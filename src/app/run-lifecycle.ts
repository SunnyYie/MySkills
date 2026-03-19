import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  BUGFIX_STAGES,
  CheckpointRecordSchema,
  ERROR_CATEGORIES,
  ExecutionContextSchema,
  type CheckpointRecord,
  type ExecutionContext,
  type SideEffectLedgerEntry,
  type StructuredError,
  StructuredErrorSchema,
} from '../domain/index.js';
import {
  RunLockConflictError,
  acquireRunLock,
  ensureRunDirectories,
  getCheckpointFilePath,
  getRunPaths,
  readCheckpointRecords,
  releaseRunLock,
  writeJsonAtomically,
} from '../storage/index.js';
import { getRecoveryAction } from '../workflow/index.js';

type TimestampFactory = () => string;
type RunIdFactory = () => string;
type SideEffectStatus = SideEffectLedgerEntry['status'];

type InitializeRunInput = {
  projectId: string;
  configVersion: string;
  jiraIssueSnapshotRef: string;
  initiator: string;
  homeDir?: string;
  now?: TimestampFactory;
  runIdFactory?: RunIdFactory;
  lockOwner?: string;
  releaseLock?: boolean;
};

type RestoreRunInput = {
  runId: string;
  checkpointId?: string;
  homeDir?: string;
  now?: TimestampFactory;
  lockOwner?: string;
  loadActiveError?: (input: {
    activeErrorRef: string;
    context: ExecutionContext;
  }) => Promise<StructuredError | undefined>;
  loadLatestSideEffectStatus?: (input: {
    latestSideEffectRef: string;
    context: ExecutionContext;
  }) => Promise<SideEffectStatus | undefined>;
};

type CliFailureCategory =
  | StructuredError['category']
  | 'state_conflict'
  | 'unexpected';

export const CLI_EXIT_CODES = {
  success: 0,
  unexpected: 1,
  validation: 2,
  configuration: 10,
  authentication: 11,
  permission: 12,
  network: 13,
  dependency: 14,
  stateConflict: 15,
  writebackFailed: 16,
  outcomeUnknown: 17,
  cancelled: 18,
} as const;

export class RunStateNotFoundError extends Error {
  constructor(runId: string) {
    super(`Run state not found for ${runId}.`);
    this.name = 'RunStateNotFoundError';
  }
}

export class CheckpointNotFoundError extends Error {
  constructor(runId: string, checkpointId: string) {
    super(`Checkpoint ${checkpointId} does not exist for ${runId}.`);
    this.name = 'CheckpointNotFoundError';
  }
}

const buildInitialStageStatusMap = () => ({
  Intake: 'not_started',
}) satisfies ExecutionContext['stage_status_map'];

const createContextHash = (context: ExecutionContext) =>
  `sha256:${createHash('sha256')
    .update(JSON.stringify(context))
    .digest('hex')}`;

const collectActiveArtifactRefs = (context: ExecutionContext) =>
  Object.values(context.stage_artifact_refs).flat();

const collectActiveApprovalRefs = (context: ExecutionContext) =>
  Object.values(context.active_approval_ref_map);

const isMissingFileError = (error: unknown): error is NodeJS.ErrnoException =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'ENOENT';

const isRunLockMessage = (error: Error) =>
  /run is already locked/i.test(error.message);

const isStructuredError = (error: unknown): error is StructuredError =>
  StructuredErrorSchema.safeParse(error).success;

const readExecutionContext = async (contextFile: string) => {
  try {
    const contents = await readFile(contextFile, 'utf8');
    return ExecutionContextSchema.parse(JSON.parse(contents));
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
};

const createInitialExecutionContext = ({
  runId,
  projectId,
  configVersion,
  jiraIssueSnapshotRef,
  initiator,
  timestamp,
}: {
  runId: string;
  projectId: string;
  configVersion: string;
  jiraIssueSnapshotRef: string;
  initiator: string;
  timestamp: string;
}) =>
  ExecutionContextSchema.parse({
    run_id: runId,
    project_id: projectId,
    config_version: configVersion,
    run_mode: 'full',
    run_lifecycle_status: 'active',
    run_outcome_status: 'in_progress',
    current_stage: 'Intake',
    stage_status_map: buildInitialStageStatusMap(),
    stage_artifact_refs: {},
    active_approval_ref_map: {},
    waiting_reason: null,
    initiator,
    started_at: timestamp,
    updated_at: timestamp,
    jira_issue_snapshot_ref: jiraIssueSnapshotRef,
    requirement_refs: [],
    repo_selection: null,
    code_targets: [],
    root_cause_hypotheses: [],
    fix_plan: [],
    verification_plan: [],
    verification_results_ref: null,
    gitlab_artifacts: [],
    jira_writeback_draft_ref: null,
    jira_writeback_result_ref: null,
    feishu_record_draft_ref: null,
    feishu_record_result_ref: null,
    active_error_ref: null,
    sensitive_field_paths: [],
  });

const createInitialCheckpoint = (context: ExecutionContext): CheckpointRecord =>
  CheckpointRecordSchema.parse({
    checkpoint_id: `${context.run_id}-checkpoint-000000`,
    run_id: context.run_id,
    sequence: 0,
    created_at: context.started_at,
    trigger_event: 'run_initialized',
    current_stage: context.current_stage,
    run_lifecycle_status: context.run_lifecycle_status,
    run_outcome_status: context.run_outcome_status,
    stage_status_map: context.stage_status_map,
    active_artifact_refs: collectActiveArtifactRefs(context),
    active_approval_refs: collectActiveApprovalRefs(context),
    active_error_ref: context.active_error_ref,
    latest_side_effect_ref: null,
    parent_checkpoint_id: null,
    context_hash: createContextHash(context),
  });

const createReleaseHandle = (lockHandle: Awaited<ReturnType<typeof acquireRunLock>>) => {
  let released = false;

  return async () => {
    if (released) {
      return;
    }

    released = true;

    try {
      await releaseRunLock(lockHandle);
    } catch (error) {
      if (isMissingFileError(error)) {
        return;
      }

      throw error;
    }
  };
};

const findCheckpoint = (
  checkpoints: CheckpointRecord[],
  checkpointId?: string,
) => {
  if (!checkpointId) {
    return checkpoints.at(-1) ?? null;
  }

  return (
    checkpoints.find((checkpoint) => checkpoint.checkpoint_id === checkpointId) ??
    null
  );
};

const defaultTimestamp = () => new Date().toISOString();

export const initializeRun = async ({
  projectId,
  configVersion,
  jiraIssueSnapshotRef,
  initiator,
  homeDir,
  now = defaultTimestamp,
  runIdFactory = randomUUID,
  lockOwner,
  releaseLock: shouldReleaseLock = false,
}: InitializeRunInput) => {
  const timestamp = now();
  const runId = runIdFactory();
  const context = createInitialExecutionContext({
    runId,
    projectId,
    configVersion,
    jiraIssueSnapshotRef,
    initiator,
    timestamp,
  });
  const runPaths = getRunPaths(runId, homeDir);

  await ensureRunDirectories(runPaths);

  const lockHandle = await acquireRunLock(runPaths.lockFile, {
    owner: lockOwner ?? initiator,
    pid: process.pid,
    acquired_at: timestamp,
  });
  const release = createReleaseHandle(lockHandle);

  try {
    const checkpoint = createInitialCheckpoint(context);

    await writeJsonAtomically(runPaths.contextFile, context);
    await writeJsonAtomically(
      getCheckpointFilePath(runPaths.checkpointsDir, checkpoint.sequence),
      checkpoint,
    );

    if (shouldReleaseLock) {
      await release();
    }

    return {
      runId,
      runPaths,
      context,
      checkpoint,
      lockHandle,
      releaseLock: release,
    };
  } catch (error) {
    await release();
    throw error;
  }
};

export const restoreRun = async ({
  runId,
  checkpointId,
  homeDir,
  now = defaultTimestamp,
  lockOwner,
  loadActiveError,
  loadLatestSideEffectStatus,
}: RestoreRunInput) => {
  const runPaths = getRunPaths(runId, homeDir);
  const context = await readExecutionContext(runPaths.contextFile);

  if (!context) {
    throw new RunStateNotFoundError(runId);
  }

  const lockHandle = await acquireRunLock(runPaths.lockFile, {
    owner: lockOwner ?? `restore:${runId}`,
    pid: process.pid,
    acquired_at: now(),
  });
  const release = createReleaseHandle(lockHandle);

  try {
    const checkpoints = await readCheckpointRecords(runPaths.checkpointsDir);
    const selectedCheckpoint = findCheckpoint(checkpoints, checkpointId);

    if (!selectedCheckpoint) {
      throw checkpointId
        ? new CheckpointNotFoundError(runId, checkpointId)
        : new RunStateNotFoundError(runId);
    }

    const activeErrorRef =
      selectedCheckpoint.active_error_ref ?? context.active_error_ref;
    const latestSideEffectRef = selectedCheckpoint.latest_side_effect_ref;
    const stageStatus =
      selectedCheckpoint.stage_status_map[selectedCheckpoint.current_stage] ??
      context.stage_status_map[selectedCheckpoint.current_stage] ??
      'not_started';
    const activeError =
      activeErrorRef && loadActiveError
        ? await loadActiveError({
            activeErrorRef,
            context,
          })
        : undefined;
    const latestSideEffectStatus =
      latestSideEffectRef && loadLatestSideEffectStatus
        ? await loadLatestSideEffectStatus({
            latestSideEffectRef,
            context,
          })
        : undefined;
    const recovery = getRecoveryAction({
      stage: selectedCheckpoint.current_stage,
      stageStatus,
      runOutcomeStatus: selectedCheckpoint.run_outcome_status,
      activeError,
      latestSideEffectStatus,
    });

    return {
      runPaths,
      latestContext: context,
      selectedCheckpoint,
      recovery,
      lockHandle,
      releaseLock: release,
    };
  } catch (error) {
    await release();
    throw error;
  }
};

const ERROR_CATEGORY_EXIT_CODE: Record<
  (typeof ERROR_CATEGORIES)[number],
  number
> = {
  configuration_missing: CLI_EXIT_CODES.configuration,
  authentication_failed: CLI_EXIT_CODES.authentication,
  permission_denied: CLI_EXIT_CODES.permission,
  network_error: CLI_EXIT_CODES.network,
  external_field_missing: CLI_EXIT_CODES.dependency,
  requirement_mapping_failed: CLI_EXIT_CODES.dependency,
  repo_resolution_failed: CLI_EXIT_CODES.dependency,
  user_rejected: CLI_EXIT_CODES.cancelled,
  writeback_failed: CLI_EXIT_CODES.writebackFailed,
  writeback_outcome_unknown: CLI_EXIT_CODES.outcomeUnknown,
  validation_error: CLI_EXIT_CODES.validation,
  state_conflict: CLI_EXIT_CODES.stateConflict,
};

export const mapErrorToCliFailure = (error: unknown) => {
  if (isStructuredError(error)) {
    return {
      exitCode: ERROR_CATEGORY_EXIT_CODE[error.category],
      summary: error.message,
      nextAction: error.user_action,
      category: error.category,
    };
  }

  if (
    error instanceof RunLockConflictError ||
    error instanceof RunStateNotFoundError ||
    error instanceof CheckpointNotFoundError
  ) {
    return {
      exitCode: CLI_EXIT_CODES.stateConflict,
      summary: error.message,
      nextAction:
        'Close the other writer or wait for the active command to finish.',
      category: 'state_conflict' as CliFailureCategory,
    };
  }

  if (error instanceof Error) {
    if (isRunLockMessage(error)) {
      return {
        exitCode: CLI_EXIT_CODES.stateConflict,
        summary: error.message,
        nextAction:
          'Close the other writer or wait for the active command to finish.',
        category: 'state_conflict' as CliFailureCategory,
      };
    }

    return {
      exitCode: CLI_EXIT_CODES.unexpected,
      summary: error.message,
      nextAction:
        'Inspect the stack trace or logs, then retry after correcting the underlying issue.',
      category: 'unexpected' as CliFailureCategory,
    };
  }

  return {
    exitCode: CLI_EXIT_CODES.unexpected,
    summary: 'Unknown failure.',
    nextAction:
      'Inspect the stack trace or logs, then retry after correcting the underlying issue.',
    category: 'unexpected' as CliFailureCategory,
  };
};
