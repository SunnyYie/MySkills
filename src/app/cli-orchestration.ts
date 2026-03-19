import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  BUGFIX_STAGES,
  CheckpointRecordSchema,
  ExecutionContextSchema,
  StructuredErrorSchema,
  VerificationResultSchema,
  type CheckpointRecord,
  type ExecutionContext,
  type GitLabArtifact,
  type VerificationResult,
} from '../domain/index.js';
import {
  CLI_EXIT_CODES,
  initializeRun,
  mapErrorToCliFailure,
  restoreRun,
} from './run-lifecycle.js';
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

const serializeHash = (value: unknown) =>
  `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

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

const buildStatusSummary = (context: ExecutionContext) => {
  const stageStatus =
    context.stage_status_map[context.current_stage] ?? 'not_started';
  const allowedActions = new Set<string>(['run status', 'run resume']);

  if (context.run_lifecycle_status === 'waiting_external_input') {
    allowedActions.add('run provide-artifact');
    allowedActions.add('run provide-verification');
  }

  if (
    context.current_stage === ARTIFACT_LINKING_STAGE ||
    context.current_stage === KNOWLEDGE_RECORDING_STAGE
  ) {
    allowedActions.add('run preview-write');

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
    nextContext = {
      ...nextContext,
      current_stage: EXECUTION_STAGE,
      run_lifecycle_status: 'waiting_external_input',
      waiting_reason: 'gitlab_artifacts,verification_results',
    };
    nextStageStatusMap.Intake = 'skipped';
    nextStageStatusMap['Context Resolution'] = 'skipped';
    nextStageStatusMap['Requirement Synthesis'] = 'skipped';
    nextStageStatusMap['Code Localization'] = 'skipped';
    nextStageStatusMap['Fix Planning'] = 'skipped';
    nextStageStatusMap.Execution = 'waiting_external_input';
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
    const initialized = await initializeRun({
      projectId,
      configVersion: '2026-03-19',
      jiraIssueSnapshotRef: `artifact://jira/${issueKey}`,
      initiator,
      homeDir,
      runIdFactory: undefined,
      releaseLock: false,
    });

    try {
      const nextContext = applyRunModePreset({
        ...initialized.context,
        run_mode: runMode,
      });
      const persisted = await persistUpdatedContext({
        runId: initialized.runId,
        context: nextContext,
        triggerEvent: runMode === 'brief_only' ? 'run_brief_initialized' : 'run_started',
        homeDir,
      });

      return {
        command: runMode === 'brief_only' ? 'run brief' : 'run start',
        exitCode: CLI_EXIT_CODES.success,
        runId: initialized.runId,
        runMode,
        currentStage: nextContext.current_stage,
        checkpointId: persisted.checkpoint.checkpoint_id,
        waitingReason: nextContext.waiting_reason,
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
    const updated = await updateRun(
      runId,
      homeDir,
      'approval_recorded',
      async (context) => {
        const approval = applyApprovalDecision({
          stage,
          decision: 'approve',
          currentRunOutcomeStatus: context.run_outcome_status,
        });

        return {
          ...context,
          updated_at: new Date().toISOString(),
          current_stage: stage,
          run_lifecycle_status: approval.nextRunLifecycleStatus,
          run_outcome_status: approval.nextRunOutcomeStatus,
          stage_status_map: {
            ...context.stage_status_map,
            [stage]: approval.nextStageStatus,
          },
          active_approval_ref_map: {
            ...context.active_approval_ref_map,
            [stage]: `approval://${runId}/${encodeURIComponent(stage)}`,
          },
          ...(stage === ARTIFACT_LINKING_STAGE
            ? { jira_writeback_draft_ref: previewRef }
            : {}),
          ...(stage === KNOWLEDGE_RECORDING_STAGE
            ? { feishu_record_draft_ref: previewRef }
            : {}),
        };
      },
    );

    return {
      command: 'run approve',
      exitCode: CLI_EXIT_CODES.success,
      runId,
      stage,
      previewRef,
      dryRun,
      nonInteractive,
      checkpointId: updated.checkpoint.checkpoint_id,
      stageStatus: updated.context.stage_status_map[stage],
    };
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
