import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  BUGFIX_STAGES,
  CheckpointRecordSchema,
  ExecutionContextSchema,
  JiraIssueSnapshotSchema,
  ProjectContextStageResultSchema,
  RequirementSynthesisStageResultSchema,
  StructuredErrorSchema,
  VerificationResultSchema,
  type CheckpointRecord,
  type ExecutionContext,
  type GitLabArtifact,
  type RequirementBrief,
  type VerificationResult,
} from '../domain/index.js';
import {
  CLI_EXIT_CODES,
  initializeRun,
  mapErrorToCliFailure,
  restoreRun,
} from './run-lifecycle.js';
import {
  ProjectProfileValidationError,
  loadProjectProfile,
} from '../skills/config-loader/index.js';
import { readJiraIssueSnapshot } from '../infrastructure/connectors/index.js';
import {
  DRY_RUN_PERSISTENCE_POLICY,
  getCheckpointFilePath,
  getRunPaths,
  readCheckpointRecords,
  writeJsonAtomically,
} from '../storage/index.js';
import {
  applyApprovalDecision,
  applyRevisionRollback,
  getExecutionExternalInputState,
  recordExecutionExternalInputs,
  runInitialAnalysisFlow,
  runPostRequirementApprovalFlow,
} from '../workflow/index.js';

type HomeDirOptions = {
  homeDir?: string;
};

type ActorOptions = {
  initiator?: string;
};

type CommonCommandOptions = HomeDirOptions &
  ActorOptions & {
    dryRun?: boolean;
    nonInteractive?: boolean;
  };

type StartRunInput = CommonCommandOptions & {
  projectId: string;
  issueKey: string;
  runMode: ExecutionContext['run_mode'];
};

type RecordSubworkflowInput = CommonCommandOptions & {
  projectId: string;
  issueKey?: string;
  workflow: 'jira' | 'feishu';
};

type RunStatusInput = HomeDirOptions & {
  runId: string;
  checkpointId?: string;
};

type RunStageActionInput = CommonCommandOptions &
  HomeDirOptions & {
    runId: string;
    issueKey?: string;
    branchName?: string;
    commitSha?: string;
    stage?: (typeof BUGFIX_STAGES)[number];
    previewRef?: string;
    rollbackToStage?: (typeof BUGFIX_STAGES)[number];
    confirm?: string;
    artifactFile?: string;
    verificationFile?: string;
    commentRef?: string;
  };

type PreviewArtifact = {
  preview_ref: string;
  stage: (typeof BUGFIX_STAGES)[number];
  preview_hash: string;
  is_dry_run: boolean;
  generated_at: string;
};

type ResultArtifact = {
  result_ref: string;
  stage: (typeof BUGFIX_STAGES)[number];
  source_preview_ref: string;
  executed_at: string;
};

type CliCommandSuccess = {
  command: string;
  exitCode: number;
  dryRun: boolean;
  dryRunArtifactTag?: string;
  nonInteractive: boolean;
};

type CliCommandFailure = {
  command: string;
  exitCode: number;
  error: {
    category: string;
    summary: string;
    nextAction: string;
  };
};

const ARTIFACT_LINKING_STAGE = 'Artifact Linking';
const KNOWLEDGE_RECORDING_STAGE = 'Knowledge Recording';
const EXECUTION_STAGE = 'Execution';

const DEFAULT_INITIATOR = 'cli:operator';
const ANALYSIS_STAGE_STATUS_MAP = {
  completed: 'completed',
  waiting: 'waiting_external_input',
  failed: 'failed',
} as const;
const ANALYSIS_APPROVAL_GATE_STAGES = new Set<
  'Requirement Synthesis' | 'Fix Planning'
>(['Requirement Synthesis', 'Fix Planning']);

const serializeHash = (value: unknown) =>
  `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

const extractIssueKeyFromSnapshotRef = (snapshotRef: string) => {
  const canonicalMatched = /^artifact:\/\/jira\/issues\/([^/]+)$/.exec(snapshotRef);
  if (canonicalMatched) {
    return canonicalMatched[1];
  }

  const legacyMatched = /^artifact:\/\/jira\/([^/]+)$/.exec(snapshotRef);
  return legacyMatched?.[1] ?? null;
};

const getJiraIssueFixturePath = (issueKey: string, homeDir?: string) =>
  path.join(
    homeDir ?? process.env.BUGFIX_ORCHESTRATOR_HOME ?? '',
    '.local',
    'share',
    'bugfix-orchestrator',
    'fixtures',
    'jira',
    'issues',
    `${issueKey}.json`,
  );

const loadContext = async (runId: string, homeDir?: string) => {
  const runPaths = getRunPaths(runId, homeDir);
  const context = ExecutionContextSchema.parse(
    JSON.parse(await readFile(runPaths.contextFile, 'utf8')),
  );

  return { runPaths, context };
};

const buildCheckpoint = ({
  context,
  previousCheckpoint,
  triggerEvent,
}: {
  context: ExecutionContext;
  previousCheckpoint: CheckpointRecord;
  triggerEvent: string;
}): CheckpointRecord =>
  CheckpointRecordSchema.parse({
    checkpoint_id: `${context.run_id}-checkpoint-${String(previousCheckpoint.sequence + 1).padStart(6, '0')}`,
    run_id: context.run_id,
    sequence: previousCheckpoint.sequence + 1,
    created_at: context.updated_at,
    trigger_event: triggerEvent,
    current_stage: context.current_stage,
    run_lifecycle_status: context.run_lifecycle_status,
    run_outcome_status: context.run_outcome_status,
    stage_status_map: context.stage_status_map,
    active_artifact_refs: Object.values(context.stage_artifact_refs).flat(),
    active_approval_refs: Object.values(context.active_approval_ref_map),
    active_error_ref: context.active_error_ref,
    latest_side_effect_ref: null,
    parent_checkpoint_id: previousCheckpoint.checkpoint_id,
    context_hash: serializeHash(context),
  });

const persistUpdatedContext = async ({
  runId,
  context,
  triggerEvent,
  homeDir,
}: {
  runId: string;
  context: ExecutionContext;
  triggerEvent: string;
  homeDir?: string;
}) => {
  const runPaths = getRunPaths(runId, homeDir);
  const checkpoints = await readCheckpointRecords(runPaths.checkpointsDir);
  const previousCheckpoint = checkpoints.at(-1);

  if (!previousCheckpoint) {
    throw new Error(`No checkpoint found for ${runId}.`);
  }

  const checkpoint = buildCheckpoint({
    context,
    previousCheckpoint,
    triggerEvent,
  });

  await writeJsonAtomically(runPaths.contextFile, context);
  await writeJsonAtomically(
    getCheckpointFilePath(runPaths.checkpointsDir, checkpoint.sequence),
    checkpoint,
  );

  return {
    runPaths,
    checkpoint,
  };
};

const slugifyStage = (stage: (typeof BUGFIX_STAGES)[number]) =>
  stage.toLowerCase().replace(/\s+/g, '-');

const getLatestStageArtifactRef = (
  context: ExecutionContext,
  stage: (typeof BUGFIX_STAGES)[number],
) => {
  const stageRefs = context.stage_artifact_refs[stage];
  return stageRefs?.at(-1) ?? null;
};

const resolvePersistedArtifactPath = ({
  runId,
  artifactRef,
  homeDir,
}: {
  runId: string;
  artifactRef: string;
  homeDir?: string;
}) => {
  const runPaths = getRunPaths(runId, homeDir);
  const runScopedPrefix = `artifact://${runId}/`;
  if (artifactRef.startsWith(runScopedPrefix)) {
    return path.join(runPaths.artifactsDir, artifactRef.slice(runScopedPrefix.length));
  }

  const issueKey = extractIssueKeyFromSnapshotRef(artifactRef);
  if (issueKey) {
    return path.join(runPaths.artifactsDir, `jira-issue-snapshot-${issueKey}.json`);
  }

  throw new Error(`Unsupported artifact ref ${artifactRef}.`);
};

const readPersistedArtifact = async ({
  runId,
  artifactRef,
  homeDir,
}: {
  runId: string;
  artifactRef: string;
  homeDir?: string;
}) =>
  JSON.parse(
    await readFile(
      resolvePersistedArtifactPath({
        runId,
        artifactRef,
        homeDir,
      }),
      'utf8',
    ),
  );

const applyAnalysisStageExecution = ({
  context,
  stage,
  stageResult,
  stageArtifactRef,
  contextPatch,
  enterApprovalGate = false,
}: {
  context: ExecutionContext;
  stage: (typeof BUGFIX_STAGES)[number];
  stageResult: {
    status: 'completed' | 'waiting' | 'failed';
    waiting_for: string | null;
    generated_at: string;
  };
  stageArtifactRef: string;
  contextPatch: Partial<
    Pick<
      ExecutionContext,
      | 'requirement_refs'
      | 'repo_selection'
      | 'code_targets'
      | 'root_cause_hypotheses'
      | 'fix_plan'
      | 'verification_plan'
    >
  >;
  enterApprovalGate?: boolean;
}) => {
  const stageStatus =
    enterApprovalGate && stageResult.status === 'completed'
      ? 'waiting_approval'
      : ANALYSIS_STAGE_STATUS_MAP[stageResult.status];
  const existingArtifactRefs = context.stage_artifact_refs[stage] ?? [];

  return {
    ...context,
    ...contextPatch,
    current_stage: stage,
    updated_at: stageResult.generated_at,
    waiting_reason: stageResult.status === 'waiting' ? stageResult.waiting_for : null,
    run_lifecycle_status:
      enterApprovalGate && stageResult.status === 'completed'
        ? 'waiting_approval'
        : stageResult.status === 'waiting'
        ? 'waiting_external_input'
        : stageResult.status === 'failed'
          ? 'failed'
          : 'active',
    run_outcome_status: stageResult.status === 'failed' ? 'failed' : 'in_progress',
    stage_status_map: {
      ...context.stage_status_map,
      [stage]: stageStatus,
    },
    stage_artifact_refs: {
      ...context.stage_artifact_refs,
      [stage]: [...existingArtifactRefs, stageArtifactRef],
    },
  } satisfies ExecutionContext;
};

const persistAnalysisStageExecutions = async ({
  runId,
  context,
  stageExecutions,
  homeDir,
  approvalGateStages = new Set<(typeof BUGFIX_STAGES)[number]>(),
}: {
  runId: string;
  context: ExecutionContext;
  stageExecutions: Array<{
    stage: (typeof BUGFIX_STAGES)[number];
    result: {
      status: 'completed' | 'waiting' | 'failed';
      waiting_for: string | null;
      generated_at: string;
    };
    contextPatch: Partial<
      Pick<
        ExecutionContext,
        | 'requirement_refs'
        | 'repo_selection'
        | 'code_targets'
        | 'root_cause_hypotheses'
        | 'fix_plan'
        | 'verification_plan'
      >
    >;
  }>;
  homeDir?: string;
  approvalGateStages?: Set<(typeof BUGFIX_STAGES)[number]>;
}) => {
  let nextContext = context;
  let latestCheckpointId: string | null = null;

  for (const stageExecution of stageExecutions) {
    const enterApprovalGate =
      approvalGateStages.has(stageExecution.stage) &&
      stageExecution.result.status === 'completed';
    const persistedArtifact = await persistArtifactDocument({
      runId,
      stage: stageExecution.stage,
      kind: `analysis-${slugifyStage(stageExecution.stage)}`,
      payload: stageExecution.result,
      homeDir,
    });

    nextContext = applyAnalysisStageExecution({
      context: nextContext,
      stage: stageExecution.stage,
      stageResult: stageExecution.result,
      stageArtifactRef: persistedArtifact.artifactRef,
      contextPatch: stageExecution.contextPatch,
      enterApprovalGate,
    });

    const persistedStage = await persistUpdatedContext({
      runId,
      context: nextContext,
      triggerEvent: `analysis_stage_${slugifyStage(stageExecution.stage)}_${enterApprovalGate ? 'waiting_approval' : stageExecution.result.status}`,
      homeDir,
    });
    latestCheckpointId = persistedStage.checkpoint.checkpoint_id;

    if (enterApprovalGate || stageExecution.result.status !== 'completed') {
      break;
    }
  }

  return {
    context: nextContext,
    checkpointId: latestCheckpointId,
  };
};

const buildStatusSummary = (context: ExecutionContext) => {
  const stageStatus =
    context.stage_status_map[context.current_stage] ?? 'not_started';
  const allowedActions = new Set<string>(['run status', 'run resume']);
  if (stageStatus === 'waiting_approval') {
    allowedActions.add('run approve');
    allowedActions.add('run reject');
    allowedActions.add('run revise');
  }

  if (context.run_lifecycle_status === 'waiting_external_input') {
    const missingInputs =
      context.current_stage === EXECUTION_STAGE
        ? getExecutionExternalInputState(context).missingInputs
        : [];

    if (missingInputs.includes('gitlab_artifacts')) {
      allowedActions.add('run provide-artifact');
    }

    if (missingInputs.includes('verification_results')) {
      allowedActions.add('run provide-verification');
    }

    if (missingInputs.includes('branch_binding')) {
      allowedActions.add('run bind-branch');
    }
  }

  if (
    context.current_stage === ARTIFACT_LINKING_STAGE ||
    context.current_stage === KNOWLEDGE_RECORDING_STAGE
  ) {
    allowedActions.add('run preview-write');

    if (context.current_stage === ARTIFACT_LINKING_STAGE) {
      allowedActions.add('run provide-fix-commit');
    }

    if (stageStatus === 'output_ready') {
      allowedActions.add('run approve');
      allowedActions.add('run reject');
      allowedActions.add('run revise');
    }

    if (stageStatus === 'approved_pending_write') {
      allowedActions.add('run execute-write');
    }
  }

  return {
    currentStage: context.current_stage,
    stageStatus,
    runLifecycleStatus: context.run_lifecycle_status,
    runOutcomeStatus: context.run_outcome_status,
    waitingReason: context.waiting_reason,
    allowedActions: [...allowedActions],
  };
};

const applyRunModePreset = (
  context: ExecutionContext,
): ExecutionContext => {
  const nextStageStatusMap: ExecutionContext['stage_status_map'] = {
    ...context.stage_status_map,
  };
  let nextContext: ExecutionContext = { ...context, stage_status_map: nextStageStatusMap };

  if (context.run_mode === 'brief_only') {
    nextStageStatusMap['Code Localization'] = 'skipped';
    nextStageStatusMap['Fix Planning'] = 'skipped';
    nextStageStatusMap.Execution = 'skipped';
    nextStageStatusMap[ARTIFACT_LINKING_STAGE] = 'skipped';
    nextStageStatusMap[KNOWLEDGE_RECORDING_STAGE] = 'skipped';
    return nextContext;
  }

  if (context.run_mode === 'jira_writeback_only') {
    const executionInputState = getExecutionExternalInputState(nextContext);

    nextContext = {
      ...nextContext,
      current_stage: EXECUTION_STAGE,
      run_lifecycle_status: executionInputState.runLifecycleStatus,
      waiting_reason: executionInputState.waitingReason,
    };
    nextStageStatusMap.Intake = 'skipped';
    nextStageStatusMap['Context Resolution'] = 'skipped';
    nextStageStatusMap['Requirement Synthesis'] = 'skipped';
    nextStageStatusMap['Code Localization'] = 'skipped';
    nextStageStatusMap['Fix Planning'] = 'skipped';
    nextStageStatusMap.Execution = executionInputState.stageStatus;
    nextStageStatusMap[ARTIFACT_LINKING_STAGE] = 'not_started';
    nextStageStatusMap[KNOWLEDGE_RECORDING_STAGE] = 'skipped';
    return nextContext;
  }

  if (context.run_mode === 'feishu_record_only') {
    nextContext = {
      ...nextContext,
      current_stage: KNOWLEDGE_RECORDING_STAGE,
    };
    nextStageStatusMap.Intake = 'skipped';
    nextStageStatusMap['Context Resolution'] = 'skipped';
    nextStageStatusMap['Requirement Synthesis'] = 'skipped';
    nextStageStatusMap['Code Localization'] = 'skipped';
    nextStageStatusMap['Fix Planning'] = 'skipped';
    nextStageStatusMap.Execution = 'skipped';
    nextStageStatusMap[ARTIFACT_LINKING_STAGE] = 'skipped';
    nextStageStatusMap[KNOWLEDGE_RECORDING_STAGE] = 'not_started';
  }

  return nextContext;
};

const wrapCommand = async <T>(command: string, work: () => Promise<T>) => {
  try {
    return await work();
  } catch (error) {
    const failure = mapErrorToCliFailure(error);
    return {
      command,
      exitCode: failure.exitCode,
      error: {
        category: failure.category,
        summary: failure.summary,
        nextAction: failure.nextAction,
      },
    } satisfies CliCommandFailure;
  }
};

const mapProjectProfileValidationError = (
  error: ProjectProfileValidationError,
) => {
  const primaryIssue = error.inspection.issues[0];
  const hasMissingField = error.inspection.issues.some(
    (issue) => issue.code === 'missing_field',
  );

  return StructuredErrorSchema.parse({
    code: hasMissingField ? 'PROJECT_PROFILE_INCOMPLETE' : 'PROJECT_PROFILE_INVALID',
    category: hasMissingField ? 'configuration_missing' : 'validation_error',
    stage: 'Intake',
    system: 'app',
    operation: 'load-project-profile',
    target_ref: error.inspection.profilePath,
    message:
      primaryIssue?.message ??
      `Project profile ${error.inspection.projectId} is incomplete or invalid.`,
    detail: JSON.stringify({
      project_id: error.inspection.projectId,
      missing_fields: error.inspection.missingFields,
      issue_paths: error.inspection.issues.map((issue) => issue.path),
    }),
    retryable: false,
    outcome_unknown: false,
    user_action:
      primaryIssue?.nextAction ??
      `Run inspect config --project ${error.inspection.projectId} and fill the reported gaps before retrying.`,
    raw_cause_ref: null,
    partial_state_ref: null,
    timestamp: new Date().toISOString(),
  });
};

const loadRequiredProjectProfile = async (projectId: string, homeDir?: string) => {
  try {
    return await loadProjectProfile({ projectId, homeDir });
  } catch (error) {
    if (error instanceof ProjectProfileValidationError) {
      throw mapProjectProfileValidationError(error);
    }

    throw error;
  }
};

export const createCliRun = async ({
  projectId,
  issueKey,
  runMode,
  homeDir,
  dryRun = false,
  nonInteractive = false,
  initiator = DEFAULT_INITIATOR,
}: StartRunInput) =>
  wrapCommand(runMode === 'brief_only' ? 'run brief' : 'run start', async () => {
    const projectProfile = await loadRequiredProjectProfile(projectId, homeDir);
    const initialSnapshotRef = `artifact://jira/issues/${issueKey}`;
    const initialized = await initializeRun({
      projectId,
      configVersion: projectProfile.config_version,
      jiraIssueSnapshotRef: initialSnapshotRef,
      initiator,
      homeDir,
      runIdFactory: undefined,
      releaseLock: false,
    });

    try {
      let nextContext: ExecutionContext = {
        ...initialized.context,
        run_mode: runMode,
      };
      let checkpointId: string;
      let requirementBrief: RequirementBrief | null = null;

      if (runMode !== 'feishu_record_only') {
        const snapshot = await readJiraIssueSnapshot({
          projectProfile,
          issueKey,
          fetchIssue: async (requestedIssueKey) =>
            JSON.parse(
              await readFile(
                getJiraIssueFixturePath(requestedIssueKey, homeDir),
                'utf8',
              ),
            ),
        });
        const persistedSnapshot = await persistJiraIssueSnapshotArtifact({
          runId: initialized.runId,
          issueKey: snapshot.issue_key,
          snapshot,
          homeDir,
        });

        nextContext = {
          ...nextContext,
          active_bug_issue_key: snapshot.issue_key,
          jira_issue_snapshot_ref: persistedSnapshot.artifactRef,
          stage_artifact_refs: {
            ...nextContext.stage_artifact_refs,
            Intake: [persistedSnapshot.artifactRef],
          },
        };

        if (runMode === 'full') {
          const analysisFlow = await runInitialAnalysisFlow({
            projectProfile,
            issueSnapshot: snapshot,
          });
          const persistedStages = await persistAnalysisStageExecutions({
            runId: initialized.runId,
            context: nextContext,
            stageExecutions: analysisFlow.stageExecutions,
            homeDir,
            approvalGateStages: new Set(['Requirement Synthesis']),
          });

          nextContext = persistedStages.context;
          checkpointId =
            persistedStages.checkpointId ?? initialized.checkpoint.checkpoint_id;
        } else if (runMode === 'brief_only') {
          const analysisFlow = await runInitialAnalysisFlow({
            projectProfile,
            issueSnapshot: snapshot,
          });
          const persistedStages = await persistAnalysisStageExecutions({
            runId: initialized.runId,
            context: nextContext,
            stageExecutions: analysisFlow.stageExecutions,
            homeDir,
          });

          nextContext = applyRunModePreset(persistedStages.context);
          if (
            analysisFlow.currentStage === 'Requirement Synthesis' &&
            analysisFlow.stageResults['Requirement Synthesis']?.status === 'completed'
          ) {
            requirementBrief =
              analysisFlow.stageResults['Requirement Synthesis'].data;
            nextContext = {
              ...nextContext,
              run_lifecycle_status: 'completed',
              run_outcome_status: 'success',
              waiting_reason: null,
            };
          }

          const persisted = await persistUpdatedContext({
            runId: initialized.runId,
            context: nextContext,
            triggerEvent:
              nextContext.run_lifecycle_status === 'completed'
                ? 'run_brief_generated'
                : 'run_brief_initialized',
            homeDir,
          });
          checkpointId = persisted.checkpoint.checkpoint_id;
        } else {
          nextContext = applyRunModePreset(nextContext);
          const persisted = await persistUpdatedContext({
            runId: initialized.runId,
            context: nextContext,
            triggerEvent: 'run_started',
            homeDir,
          });
          checkpointId = persisted.checkpoint.checkpoint_id;
        }
      } else {
        nextContext = applyRunModePreset(nextContext);
        const persisted = await persistUpdatedContext({
          runId: initialized.runId,
          context: nextContext,
          triggerEvent: 'run_started',
          homeDir,
        });
        checkpointId = persisted.checkpoint.checkpoint_id;
      }

      return {
        command: runMode === 'brief_only' ? 'run brief' : 'run start',
        exitCode: CLI_EXIT_CODES.success,
        runId: initialized.runId,
        runMode,
        currentStage: nextContext.current_stage,
        checkpointId,
        waitingReason: nextContext.waiting_reason,
        requirementBrief,
        dryRun,
        dryRunArtifactTag: dryRun
          ? DRY_RUN_PERSISTENCE_POLICY.dryRunArtifactTag
          : undefined,
        nonInteractive,
      } satisfies CliCommandSuccess & {
        runId: string;
        runMode: ExecutionContext['run_mode'];
        currentStage: ExecutionContext['current_stage'];
        checkpointId: string;
        waitingReason: string | null;
        requirementBrief: RequirementBrief | null;
      };
    } finally {
      await initialized.releaseLock();
    }
  });

export const createCliRecordRun = async ({
  projectId,
  issueKey,
  workflow,
  homeDir,
  dryRun = false,
  nonInteractive = false,
  initiator = DEFAULT_INITIATOR,
}: RecordSubworkflowInput) =>
  createCliRun({
    projectId,
    issueKey:
      issueKey ??
      (workflow === 'jira' ? 'MISSING-ISSUE' : 'FEISHU-RECORD-ONLY'),
    runMode:
      workflow === 'jira' ? 'jira_writeback_only' : 'feishu_record_only',
    homeDir,
    dryRun,
    nonInteractive,
    initiator,
  }).then((result) =>
    'error' in result
      ? {
          ...result,
          command: `record ${workflow}`,
        }
      : {
          ...result,
          command: `record ${workflow}`,
        },
  );

export const getCliRunStatus = async ({ runId, checkpointId, homeDir }: RunStatusInput) =>
  wrapCommand('run status', async () => {
    const { context } = await loadContext(runId, homeDir);
    const status = buildStatusSummary(context);

    return {
      command: 'run status',
      exitCode: CLI_EXIT_CODES.success,
      runId,
      checkpointId: checkpointId ?? null,
      dryRun: false,
      nonInteractive: false,
      ...status,
    } satisfies CliCommandSuccess & {
      runId: string;
      checkpointId: string | null;
      currentStage: string;
      stageStatus: string;
      runLifecycleStatus: string;
      runOutcomeStatus: string;
      waitingReason: string | null;
      allowedActions: string[];
    };
  });

export const resumeCliRun = async ({ runId, checkpointId, homeDir }: RunStatusInput) =>
  wrapCommand('run resume', async () => {
    const restored = await restoreRun({
      runId,
      checkpointId,
      homeDir,
    });

    try {
      return {
        command: 'run resume',
        exitCode: CLI_EXIT_CODES.success,
        runId,
        checkpointId: restored.selectedCheckpoint.checkpoint_id,
        currentStage: restored.latestContext.current_stage,
        dryRun: false,
        nonInteractive: false,
        recovery: restored.recovery,
      } satisfies CliCommandSuccess & {
        runId: string;
        checkpointId: string;
        currentStage: string;
        recovery: { action: string; reason: string };
      };
    } finally {
      await restored.releaseLock();
    }
  });

const validationError = (
  command: string,
  summary: string,
  nextAction: string,
): CliCommandFailure => ({
  command,
  exitCode: CLI_EXIT_CODES.validation,
  error: {
    category: 'validation_error',
    summary,
    nextAction,
  },
});

const updateRun = async (
  runId: string,
  homeDir: string | undefined,
  triggerEvent: string,
  mutate: (context: ExecutionContext) => Promise<ExecutionContext> | ExecutionContext,
) => {
  const restored = await restoreRun({
    runId,
    homeDir,
  });

  try {
    const nextContext = await mutate(restored.latestContext);
    const persisted = await persistUpdatedContext({
      runId,
      context: nextContext,
      triggerEvent,
      homeDir,
    });

    return {
      context: nextContext,
      checkpoint: persisted.checkpoint,
    };
  } finally {
    await restored.releaseLock();
  }
};

export const approveCliRunStage = async ({
  runId,
  stage,
  previewRef,
  homeDir,
  dryRun = false,
  nonInteractive = false,
}: RunStageActionInput) => {
  if (!stage) {
    return validationError(
      'run approve',
      'stage is required when approving a run stage.',
      'Re-run the command with --stage <stage>.',
    );
  }

  if (!previewRef) {
    return validationError(
      'run approve',
      'preview_ref is required when approving a stage.',
      'Re-run the command with --preview-ref <ref>.',
    );
  }

  return wrapCommand('run approve', async () => {
    const restored = await restoreRun({
      runId,
      homeDir,
    });

    try {
      if (
        restored.latestContext.current_stage !== stage ||
        restored.latestContext.stage_status_map[stage] !== 'waiting_approval'
      ) {
        return validationError(
          'run approve',
          `stage ${stage} is not currently waiting for approval on run ${runId}.`,
          'Run status to inspect the current stage before retrying approval.',
        );
      }

      const approval = applyApprovalDecision({
        stage,
        decision: 'approve',
        currentRunOutcomeStatus: restored.latestContext.run_outcome_status,
      });
      let nextContext: ExecutionContext = {
        ...restored.latestContext,
        updated_at: new Date().toISOString(),
        current_stage: stage,
        waiting_reason: null,
        run_lifecycle_status: approval.nextRunLifecycleStatus,
        run_outcome_status: approval.nextRunOutcomeStatus,
        stage_status_map: {
          ...restored.latestContext.stage_status_map,
          [stage]: approval.nextStageStatus,
        },
        active_approval_ref_map: {
          ...restored.latestContext.active_approval_ref_map,
          [stage]: `approval://${runId}/${encodeURIComponent(stage)}`,
        },
        ...(stage === ARTIFACT_LINKING_STAGE
          ? { jira_writeback_draft_ref: previewRef }
          : {}),
        ...(stage === KNOWLEDGE_RECORDING_STAGE
          ? { feishu_record_draft_ref: previewRef }
          : {}),
      };
      let checkpointId: string;

      if (stage === 'Requirement Synthesis') {
        const projectProfile = await loadRequiredProjectProfile(
          nextContext.project_id,
          homeDir,
        );
        const snapshotArtifact = JiraIssueSnapshotSchema.parse(
          await readPersistedArtifact({
            runId,
            artifactRef: nextContext.jira_issue_snapshot_ref,
            homeDir,
          }),
        );
        const projectContextArtifactRef = getLatestStageArtifactRef(
          nextContext,
          'Context Resolution',
        );
        const requirementArtifactRef = getLatestStageArtifactRef(
          nextContext,
          'Requirement Synthesis',
        );

        if (!projectContextArtifactRef || !requirementArtifactRef) {
          throw new Error(
            'Requirement approval cannot continue because required stage artifacts are missing.',
          );
        }

        const projectContextResult = ProjectContextStageResultSchema.parse(
          await readPersistedArtifact({
            runId,
            artifactRef: projectContextArtifactRef,
            homeDir,
          }),
        );
        const requirementResult = RequirementSynthesisStageResultSchema.parse(
          await readPersistedArtifact({
            runId,
            artifactRef: requirementArtifactRef,
            homeDir,
          }),
        );

        const downstreamFlow = await runPostRequirementApprovalFlow({
          projectProfile,
          issueSnapshot: snapshotArtifact,
          projectContext: projectContextResult.data!,
          requirementBrief: requirementResult.data!,
        });
        const persistedStages = await persistAnalysisStageExecutions({
          runId,
          context: nextContext,
          stageExecutions: downstreamFlow.stageExecutions,
          homeDir,
          approvalGateStages: new Set(['Fix Planning']),
        });
        nextContext = persistedStages.context;
        checkpointId = persistedStages.checkpointId ?? restored.selectedCheckpoint.checkpoint_id;
      } else if (stage === 'Fix Planning') {
        const executionInputState = getExecutionExternalInputState(nextContext);
        nextContext = {
          ...nextContext,
          current_stage: EXECUTION_STAGE,
          waiting_reason: executionInputState.waitingReason,
          run_lifecycle_status: executionInputState.runLifecycleStatus,
          stage_status_map: {
            ...nextContext.stage_status_map,
            Execution: executionInputState.stageStatus,
          },
        };

        const persisted = await persistUpdatedContext({
          runId,
          context: nextContext,
          triggerEvent: 'analysis_gate_fix_planning_approved',
          homeDir,
        });
        checkpointId = persisted.checkpoint.checkpoint_id;
      } else {
        const persisted = await persistUpdatedContext({
          runId,
          context: nextContext,
          triggerEvent: 'approval_recorded',
          homeDir,
        });
        checkpointId = persisted.checkpoint.checkpoint_id;
      }

      return {
        command: 'run approve',
        exitCode: CLI_EXIT_CODES.success,
        runId,
        stage,
        previewRef,
        dryRun,
        nonInteractive,
        checkpointId,
        stageStatus: nextContext.stage_status_map[stage],
        currentStage: nextContext.current_stage,
        waitingReason: nextContext.waiting_reason,
      };
    } finally {
      await restored.releaseLock();
    }
  });
};

export const rejectCliRunStage = async ({
  runId,
  stage,
  homeDir,
  dryRun = false,
  nonInteractive = false,
}: RunStageActionInput) => {
  if (!stage) {
    return validationError(
      'run reject',
      'stage is required when rejecting a run stage.',
      'Re-run the command with --stage <stage>.',
    );
  }

  return wrapCommand('run reject', async () => {
    const updated = await updateRun(runId, homeDir, 'approval_rejected', async (context) => ({
      ...context,
      updated_at: new Date().toISOString(),
      current_stage: stage,
      run_lifecycle_status: 'cancelled',
      run_outcome_status: 'cancelled',
      waiting_reason: `stage_rejected:${stage}`,
    }));

    return {
      command: 'run reject',
      exitCode: CLI_EXIT_CODES.success,
      runId,
      stage,
      checkpointId: updated.checkpoint.checkpoint_id,
      dryRun,
      nonInteractive,
    };
  });
};

export const reviseCliRun = async ({
  runId,
  rollbackToStage,
  homeDir,
  dryRun = false,
  nonInteractive = false,
}: RunStageActionInput) => {
  if (!rollbackToStage) {
    return validationError(
      'run revise',
      'rollback_to_stage is required when revising a run.',
      'Re-run the command with --rollback-to <stage>.',
    );
  }

  return wrapCommand('run revise', async () => {
    const updated = await updateRun(runId, homeDir, 'revision_requested', async (context) =>
      applyRevisionRollback({
        context,
        rollbackToStage,
        supersedingApprovalId: `approval://${runId}/revise/${Date.now()}`,
        updatedAt: new Date().toISOString(),
      }).context,
    );

    return {
      command: 'run revise',
      exitCode: CLI_EXIT_CODES.success,
      runId,
      rollbackToStage,
      checkpointId: updated.checkpoint.checkpoint_id,
      currentStage: updated.context.current_stage,
      dryRun,
      nonInteractive,
    };
  });
};

const parseArtifactFile = async (artifactFile: string) =>
  ExecutionContextSchema.shape.gitlab_artifacts.parse(
    JSON.parse(await readFile(artifactFile, 'utf8')),
  ) as GitLabArtifact[];

const persistArtifactDocument = async ({
  runId,
  stage,
  kind,
  payload,
  homeDir,
}: {
  runId: string;
  stage: (typeof BUGFIX_STAGES)[number];
  kind: string;
  payload: unknown;
  homeDir?: string;
}) => {
  const runPaths = getRunPaths(runId, homeDir);
  const fileName = `${kind}-${Date.now()}.json`;
  const targetPath = path.join(runPaths.artifactsDir, fileName);
  const artifactRef = `artifact://${runId}/${fileName}`;

  await writeJsonAtomically(targetPath, payload);

  return {
    artifactRef,
    targetPath,
    stage,
  };
};

const persistBranchBindingArtifact = async ({
  runId,
  issueKey,
  branchName,
  homeDir,
}: {
  runId: string;
  issueKey: string;
  branchName: string;
  homeDir?: string;
}) => {
  const runPaths = getRunPaths(runId, homeDir);
  const bindingId = `${runId}-${Date.now()}`;
  const targetPath = path.join(
    runPaths.artifactsDir,
    `jira-branch-binding-${bindingId}.json`,
  );
  const artifactRef = `artifact://jira/bindings/branch/${bindingId}`;
  const payload = {
    operation: 'jira.bind_branch',
    issue_key: issueKey,
    branch_name: branchName,
    recorded_at: new Date().toISOString(),
  };

  await writeJsonAtomically(targetPath, payload);

  return {
    artifactRef,
    targetPath,
  };
};

const persistSubtaskPreviewArtifact = async ({
  runId,
  issueKey,
  dryRun,
  homeDir,
}: {
  runId: string;
  issueKey: string;
  dryRun: boolean;
  homeDir?: string;
}) => {
  const runPaths = getRunPaths(runId, homeDir);
  const previewId = `${runId}-${Date.now()}`;
  const targetPath = path.join(
    runPaths.artifactsDir,
    `jira-subtask-preview-${previewId}.json`,
  );
  const artifactRef = `artifact://jira/subtasks/preview/${previewId}`;
  const payload = {
    operation: 'jira.create_subtask',
    issue_key: issueKey,
    is_dry_run: dryRun,
    generated_at: new Date().toISOString(),
  };

  await writeJsonAtomically(targetPath, payload);

  return {
    artifactRef,
    targetPath,
  };
};

const persistJiraIssueSnapshotArtifact = async ({
  runId,
  issueKey,
  snapshot,
  homeDir,
}: {
  runId: string;
  issueKey: string;
  snapshot: unknown;
  homeDir?: string;
}) => {
  const runPaths = getRunPaths(runId, homeDir);
  const targetPath = path.join(
    runPaths.artifactsDir,
    `jira-issue-snapshot-${issueKey}.json`,
  );
  const artifactRef = `artifact://jira/issues/${issueKey}`;

  await writeJsonAtomically(targetPath, snapshot);

  return {
    artifactRef,
    targetPath,
  };
};

const persistCommitBindingArtifact = async ({
  runId,
  issueKey,
  commitSha,
  homeDir,
}: {
  runId: string;
  issueKey: string;
  commitSha: string;
  homeDir?: string;
}) => {
  const runPaths = getRunPaths(runId, homeDir);
  const bindingId = `${runId}-${Date.now()}`;
  const targetPath = path.join(
    runPaths.artifactsDir,
    `jira-commit-binding-${bindingId}.json`,
  );
  const artifactRef = `artifact://jira/bindings/commit/${bindingId}`;
  const payload = {
    operation: 'jira.bind_commit',
    issue_key: issueKey,
    commit_sha: commitSha,
    recorded_at: new Date().toISOString(),
  };

  await writeJsonAtomically(targetPath, payload);

  return {
    artifactRef,
    targetPath,
  };
};

export const provideCliArtifacts = async ({
  runId,
  artifactFile,
  homeDir,
  dryRun = false,
  nonInteractive = false,
}: RunStageActionInput) => {
  if (!artifactFile) {
    return validationError(
      'run provide-artifact',
      'artifact input file is required.',
      'Provide --file <path> with a GitLab artifact array payload.',
    );
  }

  return wrapCommand('run provide-artifact', async () => {
    const artifacts = await parseArtifactFile(artifactFile);
    const updated = await updateRun(
      runId,
      homeDir,
      'execution_artifacts_recorded',
      async (context) => {
        const result = recordExecutionExternalInputs({
          context,
          updatedAt: new Date().toISOString(),
          gitlabArtifacts: artifacts,
        });

        if (!result.accepted) {
          throw result.errors[0] ?? new Error('Artifact recording failed.');
        }

        if (result.state.stageStatus === 'completed') {
          result.context.current_stage = ARTIFACT_LINKING_STAGE;
          result.context.run_lifecycle_status = 'active';
          result.context.waiting_reason = null;
        }

        return result.context;
      },
    );

    return {
      command: 'run provide-artifact',
      exitCode: CLI_EXIT_CODES.success,
      runId,
      dryRun,
      nonInteractive,
      checkpointId: updated.checkpoint.checkpoint_id,
      waitingReason: updated.context.waiting_reason,
    };
  });
};

export const bindCliRunBranch = async ({
  runId,
  branchName,
  issueKey,
  homeDir,
  dryRun = false,
  nonInteractive = false,
}: RunStageActionInput) => {
  if (!branchName?.trim()) {
    return validationError(
      'run bind-branch',
      'branch name is required when binding a development branch.',
      'Re-run the command with --branch <name>.',
    );
  }

  return wrapCommand('run bind-branch', async () => {
    const { context } = await loadContext(runId, homeDir);
    const resolvedIssueKey =
      issueKey?.trim() ??
      context.active_bug_issue_key ??
      extractIssueKeyFromSnapshotRef(context.jira_issue_snapshot_ref);

    if (!resolvedIssueKey) {
      throw StructuredErrorSchema.parse({
        code: 'branch_binding_issue_missing',
        category: 'validation_error',
        stage: EXECUTION_STAGE,
        system: 'cli',
        operation: 'bind-branch',
        target_ref: null,
        message: 'run bind-branch requires a bug issue key to associate the branch.',
        detail:
          'The current run does not have an active bug issue key and no explicit --issue value was provided.',
        retryable: false,
        outcome_unknown: false,
        user_action: 'Re-run the command with --issue <key> or restore a run with a Jira issue snapshot.',
        raw_cause_ref: null,
        partial_state_ref: null,
        timestamp: new Date().toISOString(),
      });
    }

    const binding = await persistBranchBindingArtifact({
      runId,
      issueKey: resolvedIssueKey,
      branchName: branchName.trim(),
      homeDir,
    });
    const updated = await updateRun(
      runId,
      homeDir,
      'execution_branch_bound',
      async (currentContext) => {
        const result = recordExecutionExternalInputs({
          context: currentContext,
          updatedAt: new Date().toISOString(),
          branchBindingRef: binding.artifactRef,
        });

        if (!result.accepted) {
          throw result.errors[0] ?? new Error('Branch binding failed.');
        }

        result.context.active_bug_issue_key = resolvedIssueKey;
        result.context.current_stage = EXECUTION_STAGE;

        return result.context;
      },
    );

    return {
      command: 'run bind-branch',
      exitCode: CLI_EXIT_CODES.success,
      runId,
      issueKey: resolvedIssueKey,
      branchName: branchName.trim(),
      bindingRef: binding.artifactRef,
      checkpointId: updated.checkpoint.checkpoint_id,
      waitingReason: updated.context.waiting_reason,
      dryRun,
      nonInteractive,
    };
  });
};

export const ensureCliSubtask = async ({
  runId,
  issueKey,
  homeDir,
  dryRun = false,
  nonInteractive = false,
}: RunStageActionInput) =>
  wrapCommand('run ensure-subtask', async () => {
    const { context } = await loadContext(runId, homeDir);
    const executionStageStatus = context.stage_status_map.Execution ?? 'not_started';

    if (executionStageStatus !== 'completed' && executionStageStatus !== 'skipped') {
      throw StructuredErrorSchema.parse({
        code: 'ensure_subtask_execution_incomplete',
        category: 'validation_error',
        stage: ARTIFACT_LINKING_STAGE,
        system: 'cli',
        operation: 'ensure-subtask',
        target_ref: context.jira_issue_snapshot_ref,
        message:
          'run ensure-subtask requires Execution external inputs to be complete first.',
        detail:
          'Complete branch binding, GitLab artifact recording, and verification recording before generating a subtask preview.',
        retryable: false,
        outcome_unknown: false,
        user_action:
          'Finish the remaining Execution inputs, then re-run ensure-subtask.',
        raw_cause_ref: null,
        partial_state_ref: null,
        timestamp: new Date().toISOString(),
      });
    }

    const resolvedIssueKey =
      issueKey?.trim() ??
      context.active_bug_issue_key ??
      extractIssueKeyFromSnapshotRef(context.jira_issue_snapshot_ref);

    if (!resolvedIssueKey) {
      throw StructuredErrorSchema.parse({
        code: 'ensure_subtask_issue_missing',
        category: 'validation_error',
        stage: ARTIFACT_LINKING_STAGE,
        system: 'cli',
        operation: 'ensure-subtask',
        target_ref: null,
        message: 'run ensure-subtask requires a bug issue key.',
        detail:
          'The current run does not expose an active bug issue key and no explicit --issue value was provided.',
        retryable: false,
        outcome_unknown: false,
        user_action: 'Re-run the command with --issue <key> or restore a bug-linked run.',
        raw_cause_ref: null,
        partial_state_ref: null,
        timestamp: new Date().toISOString(),
      });
    }

    const preview = await persistSubtaskPreviewArtifact({
      runId,
      issueKey: resolvedIssueKey,
      dryRun,
      homeDir,
    });
    const updated = await updateRun(
      runId,
      homeDir,
      'jira_subtask_preview_generated',
      async (currentContext) => ({
        ...currentContext,
        updated_at: new Date().toISOString(),
        current_stage: ARTIFACT_LINKING_STAGE,
        run_lifecycle_status: 'active',
        waiting_reason: null,
        active_bug_issue_key:
          currentContext.active_bug_issue_key ?? resolvedIssueKey,
        jira_subtask_ref: preview.artifactRef,
        jira_subtask_result_ref: null,
        stage_status_map: {
          ...currentContext.stage_status_map,
          [ARTIFACT_LINKING_STAGE]: 'output_ready',
        },
        stage_artifact_refs: {
          ...currentContext.stage_artifact_refs,
          [ARTIFACT_LINKING_STAGE]: [preview.artifactRef],
        },
      }),
    );

    return {
      command: 'run ensure-subtask',
      exitCode: CLI_EXIT_CODES.success,
      runId,
      issueKey: resolvedIssueKey,
      previewRef: preview.artifactRef,
      currentStage: updated.context.current_stage,
      stageStatus: updated.context.stage_status_map[ARTIFACT_LINKING_STAGE],
      checkpointId: updated.checkpoint.checkpoint_id,
      dryRun,
      dryRunArtifactTag: dryRun
        ? DRY_RUN_PERSISTENCE_POLICY.dryRunArtifactTag
        : undefined,
      nonInteractive,
    };
  });

export const provideCliFixCommit = async ({
  runId,
  issueKey,
  commitSha,
  homeDir,
  dryRun = false,
  nonInteractive = false,
}: RunStageActionInput) => {
  if (!issueKey?.trim()) {
    return validationError(
      'run provide-fix-commit',
      'issue key is required when recording fix commit ownership.',
      'Re-run the command with --issue <key>.',
    );
  }

  if (!commitSha?.trim()) {
    return validationError(
      'run provide-fix-commit',
      'commit sha is required when recording a fix commit.',
      'Re-run the command with --commit <sha>.',
    );
  }

  return wrapCommand('run provide-fix-commit', async () => {
    const { context } = await loadContext(runId, homeDir);
    const executionStageStatus = context.stage_status_map.Execution ?? 'not_started';

    if (executionStageStatus !== 'completed' && executionStageStatus !== 'skipped') {
      throw StructuredErrorSchema.parse({
        code: 'provide_fix_commit_execution_incomplete',
        category: 'validation_error',
        stage: ARTIFACT_LINKING_STAGE,
        system: 'cli',
        operation: 'provide-fix-commit',
        target_ref: context.jira_issue_snapshot_ref,
        message:
          'run provide-fix-commit requires Execution external inputs to be complete first.',
        detail:
          'Complete branch binding, GitLab artifact recording, and verification recording before attaching fix commits to Artifact Linking.',
        retryable: false,
        outcome_unknown: false,
        user_action:
          'Finish the remaining Execution inputs, then re-run provide-fix-commit.',
        raw_cause_ref: null,
        partial_state_ref: null,
        timestamp: new Date().toISOString(),
      });
    }

    const binding = await persistCommitBindingArtifact({
      runId,
      issueKey: issueKey.trim(),
      commitSha: commitSha.trim().toLowerCase(),
      homeDir,
    });
    const updated = await updateRun(
      runId,
      homeDir,
      'artifact_linking_fix_commit_recorded',
      async (currentContext) => {
        const nextApprovalMap = {
          ...currentContext.active_approval_ref_map,
        };

        delete nextApprovalMap[ARTIFACT_LINKING_STAGE];

        return {
          ...currentContext,
          updated_at: new Date().toISOString(),
          current_stage: ARTIFACT_LINKING_STAGE,
          waiting_reason: null,
          active_bug_issue_key:
            currentContext.active_bug_issue_key ?? issueKey.trim(),
          git_commit_binding_refs: [
            ...currentContext.git_commit_binding_refs,
            binding.artifactRef,
          ],
          jira_writeback_draft_ref: null,
          jira_writeback_result_ref: null,
          stage_status_map: {
            ...currentContext.stage_status_map,
            [ARTIFACT_LINKING_STAGE]: 'not_started',
          },
          stage_artifact_refs: {
            ...currentContext.stage_artifact_refs,
            [ARTIFACT_LINKING_STAGE]: [
              ...(currentContext.stage_artifact_refs[ARTIFACT_LINKING_STAGE] ?? []),
              binding.artifactRef,
            ],
          },
          active_approval_ref_map: nextApprovalMap,
        };
      },
    );

    return {
      command: 'run provide-fix-commit',
      exitCode: CLI_EXIT_CODES.success,
      runId,
      issueKey: issueKey.trim(),
      commitSha: commitSha.trim().toLowerCase(),
      bindingRef: binding.artifactRef,
      currentStage: updated.context.current_stage,
      stageStatus: updated.context.stage_status_map[ARTIFACT_LINKING_STAGE],
      checkpointId: updated.checkpoint.checkpoint_id,
      dryRun,
      nonInteractive,
    };
  });
};

export const provideCliVerification = async ({
  runId,
  verificationFile,
  homeDir,
  dryRun = false,
  nonInteractive = false,
}: RunStageActionInput) => {
  if (!verificationFile) {
    return validationError(
      'run provide-verification',
      'verification input file is required.',
      'Provide --file <path> with a verification result payload.',
    );
  }

  return wrapCommand('run provide-verification', async () => {
    const verification = VerificationResultSchema.parse(
      JSON.parse(await readFile(verificationFile, 'utf8')),
    ) as VerificationResult;
    const artifact = await persistArtifactDocument({
      runId,
      stage: EXECUTION_STAGE,
      kind: 'verification',
      payload: verification,
      homeDir,
    });
    const updated = await updateRun(
      runId,
      homeDir,
      'execution_verification_recorded',
      async (context) => {
        const result = recordExecutionExternalInputs({
          context,
          updatedAt: new Date().toISOString(),
          verificationResultsRef: artifact.artifactRef,
        });

        if (!result.accepted) {
          throw result.errors[0] ?? new Error('Verification recording failed.');
        }

        if (result.state.stageStatus === 'completed') {
          result.context.current_stage = ARTIFACT_LINKING_STAGE;
          result.context.run_lifecycle_status = 'active';
          result.context.waiting_reason = null;
        }

        return result.context;
      },
    );

    return {
      command: 'run provide-verification',
      exitCode: CLI_EXIT_CODES.success,
      runId,
      artifactRef: artifact.artifactRef,
      checkpointId: updated.checkpoint.checkpoint_id,
      dryRun,
      nonInteractive,
    };
  });
};

export const previewCliWrite = async ({
  runId,
  stage,
  homeDir,
  dryRun = false,
  nonInteractive = false,
}: RunStageActionInput) =>
  wrapCommand('run preview-write', async () => {
    if (!stage) {
      throw StructuredErrorSchema.parse({
        code: 'preview_stage_missing',
        category: 'validation_error',
        stage: ARTIFACT_LINKING_STAGE,
        system: 'cli',
        operation: 'preview-write',
        target_ref: null,
        message: 'preview-write requires an explicit stage.',
        detail: 'Use --stage Artifact Linking or --stage Knowledge Recording.',
        retryable: false,
        outcome_unknown: false,
        user_action: 'Re-run the command with --stage <stage>.',
        raw_cause_ref: null,
        partial_state_ref: null,
        timestamp: new Date().toISOString(),
      });
    }

    if (stage !== ARTIFACT_LINKING_STAGE && stage !== KNOWLEDGE_RECORDING_STAGE) {
      throw StructuredErrorSchema.parse({
        code: 'preview_stage_invalid',
        category: 'validation_error',
        stage,
        system: 'cli',
        operation: 'preview-write',
        target_ref: null,
        message: 'preview-write only supports Artifact Linking and Knowledge Recording.',
        detail: 'Use preview-write on a writeback stage.',
        retryable: false,
        outcome_unknown: false,
        user_action: 'Select Artifact Linking or Knowledge Recording.',
        raw_cause_ref: null,
        partial_state_ref: null,
        timestamp: new Date().toISOString(),
      });
    }

    const preview = {
      preview_ref: `preview://${runId}/${encodeURIComponent(stage)}/${Date.now()}`,
      stage,
      preview_hash: serializeHash({ runId, stage, dryRun }),
      is_dry_run: dryRun,
      generated_at: new Date().toISOString(),
    } satisfies PreviewArtifact;
    await persistArtifactDocument({
      runId,
      stage,
      kind: stage === ARTIFACT_LINKING_STAGE ? 'jira-preview' : 'feishu-preview',
      payload: preview,
      homeDir,
    });
    const updated = await updateRun(runId, homeDir, 'write_preview_generated', async (context) => ({
      ...context,
      updated_at: preview.generated_at,
      current_stage: stage,
      waiting_reason: null,
      stage_status_map: {
        ...context.stage_status_map,
        [stage]: 'output_ready',
      },
      ...(stage === ARTIFACT_LINKING_STAGE
        ? { jira_writeback_draft_ref: preview.preview_ref }
        : { feishu_record_draft_ref: preview.preview_ref }),
    }));

    return {
      command: 'run preview-write',
      exitCode: CLI_EXIT_CODES.success,
      runId,
      stage,
      previewRef: preview.preview_ref,
      previewHash: preview.preview_hash,
      checkpointId: updated.checkpoint.checkpoint_id,
      dryRun,
      nonInteractive,
      dryRunArtifactTag: dryRun
        ? DRY_RUN_PERSISTENCE_POLICY.dryRunArtifactTag
        : undefined,
    };
  });

export const executeCliWrite = async ({
  runId,
  stage,
  previewRef,
  confirm,
  homeDir,
  dryRun = false,
  nonInteractive = false,
}: RunStageActionInput) => {
  if (!stage) {
    return validationError(
      'run execute-write',
      'stage is required before execution.',
      'Re-run the command with --stage <stage>.',
    );
  }

  if (nonInteractive && !confirm) {
    return validationError(
      'run execute-write',
      'confirmation_required',
      'Re-run with --confirm <preview-hash> when using --non-interactive.',
    );
  }

  if (!previewRef) {
    return validationError(
      'run execute-write',
      'preview_ref is required before execution.',
      'Generate or provide a preview ref first.',
    );
  }

  return wrapCommand('run execute-write', async () => {
    const result = {
      result_ref: `result://${runId}/${encodeURIComponent(stage)}/${Date.now()}`,
      stage,
      source_preview_ref: previewRef,
      executed_at: new Date().toISOString(),
    } satisfies ResultArtifact;
    await persistArtifactDocument({
      runId,
      stage,
      kind: stage === ARTIFACT_LINKING_STAGE ? 'jira-result' : 'feishu-result',
      payload: result,
      homeDir,
    });
    const updated = await updateRun(runId, homeDir, 'write_executed', async (context) => {
      const nextContext: ExecutionContext = {
        ...context,
        updated_at: result.executed_at,
        current_stage: stage,
        stage_status_map: {
          ...context.stage_status_map,
          [stage]: 'completed',
        },
      };

      if (stage === ARTIFACT_LINKING_STAGE) {
        nextContext.jira_writeback_result_ref = result.result_ref;
      } else {
        nextContext.feishu_record_result_ref = result.result_ref;
      }

      if (
        nextContext.run_mode === 'jira_writeback_only' ||
        nextContext.run_mode === 'feishu_record_only'
      ) {
        nextContext.run_lifecycle_status = 'completed';
        nextContext.run_outcome_status = 'success';
      }

      return nextContext;
    });

    return {
      command: 'run execute-write',
      exitCode: CLI_EXIT_CODES.success,
      runId,
      stage,
      previewRef,
      resultRef: result.result_ref,
      checkpointId: updated.checkpoint.checkpoint_id,
      dryRun,
      nonInteractive,
    };
  });
};
