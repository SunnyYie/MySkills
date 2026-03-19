import {
  APPROVAL_DECISIONS,
  APPROVAL_STATUSES,
  BUGFIX_STAGES,
  RUN_LIFECYCLE_STATUSES,
  RUN_OUTCOME_STATUSES,
  SIDE_EFFECT_STATUSES,
  STAGE_STATUSES,
  type ExecutionContext,
  type StructuredError,
} from '../domain/index.js';

type Stage = (typeof BUGFIX_STAGES)[number];
type StageStatus = (typeof STAGE_STATUSES)[number];
type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];
type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
type RunLifecycleStatus = (typeof RUN_LIFECYCLE_STATUSES)[number];
type RunOutcomeStatus = (typeof RUN_OUTCOME_STATUSES)[number];
type SideEffectStatus = (typeof SIDE_EFFECT_STATUSES)[number];

type ApprovalDecisionResult = {
  nextStageStatus: StageStatus;
  nextRunLifecycleStatus: RunLifecycleStatus;
  nextRunOutcomeStatus: RunOutcomeStatus;
};

type RecoveryAction =
  | 'await_external_input'
  | 'reconcile_before_retry'
  | 'pause_for_partial_success_review'
  | 'resume_current_stage';

type RecoveryResult = {
  action: RecoveryAction;
  reason: string;
};

type RevisionRollbackInput = {
  context: ExecutionContext;
  rollbackToStage: Stage;
  supersedingApprovalId: string;
  updatedAt: string;
};

type RevisionRollbackResult = {
  context: ExecutionContext;
  supersededApprovalIds: string[];
  supersedingApprovalId: string;
};

const APPROVAL_REQUIRED_STAGES = new Set<Stage>([
  'Requirement Synthesis',
  'Fix Planning',
  'Artifact Linking',
  'Knowledge Recording',
]);

const SIDE_EFFECT_STAGES = new Set<Stage>([
  'Artifact Linking',
  'Knowledge Recording',
]);

const NON_APPROVAL_OUTPUT_STATUSES: readonly StageStatus[] = ['completed', 'failed'];
const APPROVAL_OUTPUT_STATUSES: readonly StageStatus[] = ['waiting_approval', 'failed'];
const ANALYSIS_APPROVAL_EXIT_STATUSES: readonly StageStatus[] = ['completed', 'stale'];
const WRITE_APPROVAL_EXIT_STATUSES: readonly StageStatus[] = [
  'approved_pending_write',
  'stale',
];

const BASE_STAGE_TRANSITIONS: Record<StageStatus, readonly StageStatus[]> = {
  not_started: ['in_progress', 'skipped'],
  in_progress: ['output_ready', 'waiting_external_input', 'failed'],
  output_ready: [],
  waiting_approval: [],
  approved_pending_write: ['executing_side_effect', 'failed', 'stale'],
  executing_side_effect: ['completed', 'failed'],
  waiting_external_input: ['in_progress', 'completed', 'failed', 'stale'],
  completed: ['stale'],
  failed: ['in_progress', 'waiting_external_input', 'approved_pending_write', 'stale'],
  stale: ['not_started', 'skipped'],
  skipped: [],
};

const STAGE_OUTPUT_RESETS = {
  Intake: {},
  'Context Resolution': {
    requirement_refs: [],
    repo_selection: null,
  },
  'Requirement Synthesis': {},
  'Code Localization': {
    code_targets: [],
    root_cause_hypotheses: [],
  },
  'Fix Planning': {
    fix_plan: [],
    verification_plan: [],
  },
  Execution: {
    verification_results_ref: null,
    gitlab_artifacts: [],
  },
  'Artifact Linking': {
    jira_writeback_draft_ref: null,
    jira_writeback_result_ref: null,
  },
  'Knowledge Recording': {
    feishu_record_draft_ref: null,
    feishu_record_result_ref: null,
  },
} satisfies Record<Stage, Partial<ExecutionContext>>;

const isApprovalStage = (stage: Stage) => APPROVAL_REQUIRED_STAGES.has(stage);

const isSideEffectStage = (stage: Stage) => SIDE_EFFECT_STAGES.has(stage);

const getAllowedNextStatuses = (
  stage: Stage,
  from: StageStatus,
): readonly StageStatus[] => {
  if (from === 'output_ready') {
    return isApprovalStage(stage)
      ? APPROVAL_OUTPUT_STATUSES
      : NON_APPROVAL_OUTPUT_STATUSES;
  }

  if (from === 'waiting_approval') {
    return isSideEffectStage(stage)
      ? WRITE_APPROVAL_EXIT_STATUSES
      : ANALYSIS_APPROVAL_EXIT_STATUSES;
  }

  return BASE_STAGE_TRANSITIONS[from];
};

const normalizeActiveOutcomeStatus = (
  currentRunOutcomeStatus: RunOutcomeStatus,
): RunOutcomeStatus => {
  if (currentRunOutcomeStatus === 'unknown') {
    return 'in_progress';
  }

  return currentRunOutcomeStatus;
};

const getRollbackScope = (rollbackToStage: Stage) => {
  const rollbackIndex = BUGFIX_STAGES.indexOf(rollbackToStage);

  return BUGFIX_STAGES.slice(rollbackIndex);
};

export const canTransitionStageStatus = (
  stage: Stage,
  from: StageStatus,
  to: StageStatus,
) => getAllowedNextStatuses(stage, from).includes(to);

export const applyApprovalDecision = ({
  stage,
  decision,
  currentRunOutcomeStatus,
}: {
  stage: Stage;
  decision: ApprovalDecision;
  currentRunOutcomeStatus: RunOutcomeStatus;
}): ApprovalDecisionResult => {
  if (decision === 'approve') {
    return {
      nextStageStatus: isSideEffectStage(stage)
        ? 'approved_pending_write'
        : 'completed',
      nextRunLifecycleStatus: 'active',
      nextRunOutcomeStatus: normalizeActiveOutcomeStatus(currentRunOutcomeStatus),
    };
  }

  if (decision === 'reject') {
    return {
      nextStageStatus: 'waiting_approval',
      nextRunLifecycleStatus: 'cancelled',
      nextRunOutcomeStatus: 'cancelled',
    };
  }

  return {
    nextStageStatus: 'waiting_approval',
    nextRunLifecycleStatus: 'active',
    nextRunOutcomeStatus: 'in_progress',
  };
};

export const applyRevisionRollback = ({
  context,
  rollbackToStage,
  supersedingApprovalId,
  updatedAt,
}: RevisionRollbackInput): RevisionRollbackResult => {
  const rollbackScope = new Set(getRollbackScope(rollbackToStage));
  const nextContext: ExecutionContext = {
    ...context,
    current_stage: rollbackToStage,
    run_lifecycle_status: 'active',
    run_outcome_status: 'in_progress',
    waiting_reason: null,
    updated_at: updatedAt,
    active_error_ref: null,
    stage_status_map: {
      ...context.stage_status_map,
    },
    stage_artifact_refs: {
      ...context.stage_artifact_refs,
    },
    active_approval_ref_map: {
      ...context.active_approval_ref_map,
    },
  };

  const supersededApprovalIds: string[] = [];

  for (const stage of BUGFIX_STAGES) {
    if (!rollbackScope.has(stage)) {
      continue;
    }

    nextContext.stage_status_map[stage] =
      stage === rollbackToStage ? 'not_started' : 'stale';

    const approvalId = nextContext.active_approval_ref_map[stage];
    if (approvalId) {
      supersededApprovalIds.push(approvalId);
      delete nextContext.active_approval_ref_map[stage];
    }

    delete nextContext.stage_artifact_refs[stage];
    Object.assign(nextContext, STAGE_OUTPUT_RESETS[stage]);
  }

  return {
    context: nextContext,
    supersededApprovalIds,
    supersedingApprovalId,
  };
};

export const getRecoveryAction = ({
  stageStatus,
  runOutcomeStatus,
  activeError,
  latestSideEffectStatus,
}: {
  stage: Stage;
  stageStatus: StageStatus;
  runOutcomeStatus: RunOutcomeStatus;
  activeError?: StructuredError;
  latestSideEffectStatus?: SideEffectStatus;
  latestApprovalStatus?: ApprovalStatus;
}): RecoveryResult => {
  if (stageStatus === 'waiting_external_input') {
    return {
      action: 'await_external_input',
      reason:
        'The stage is waiting for GitLab artifacts, verification results, or other user supplied inputs.',
    };
  }

  if (activeError?.outcome_unknown) {
    return {
      action: 'reconcile_before_retry',
      reason:
        'The active error marks the write outcome as unknown, so workflow must reconcile before retrying.',
    };
  }

  if (
    latestSideEffectStatus === 'prepared' ||
    latestSideEffectStatus === 'dispatched'
  ) {
    return {
      action: 'reconcile_before_retry',
      reason:
        'A prepared or dispatched side effect exists without a terminal outcome, so replay is unsafe.',
    };
  }

  if (runOutcomeStatus === 'partial_success') {
    return {
      action: 'pause_for_partial_success_review',
      reason:
        'The run already has successful outcomes and an additional non-ignorable failure that needs review.',
    };
  }

  return {
    action: 'resume_current_stage',
    reason:
      'No special wait or reconcile invariant is active, so the workflow can resume the current stage.',
  };
};
