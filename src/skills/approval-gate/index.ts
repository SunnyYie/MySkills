import type {
  ExecutionContext,
} from '../../domain/index.js';
import {
  applyApprovalDecision,
  applyRevisionRollback,
} from '../../workflow/index.js';

export const APPROVAL_GATE_SKILL = 'approval-gate' as const;

export const applyApprovalGateDecision = ({
  stage,
  decision,
  currentRunOutcomeStatus,
  context,
  rollbackToStage,
  supersedingApprovalId,
  updatedAt,
}: {
  stage: ExecutionContext['current_stage'];
  decision: 'approve' | 'reject' | 'revise';
  currentRunOutcomeStatus?: ExecutionContext['run_outcome_status'];
  context?: ExecutionContext;
  rollbackToStage?: ExecutionContext['current_stage'];
  supersedingApprovalId?: string;
  updatedAt?: string;
}) => {
  if (decision === 'revise') {
    if (!context || !rollbackToStage || !supersedingApprovalId || !updatedAt) {
      throw new Error(
        'approval-gate revise requires context, rollbackToStage, supersedingApprovalId, and updatedAt.',
      );
    }

    const rollback = applyRevisionRollback({
      context,
      rollbackToStage,
      supersedingApprovalId,
      updatedAt,
    });

    return {
      skill: APPROVAL_GATE_SKILL,
      decision,
      rollbackToStage,
      nextContext: rollback.context,
      supersededApprovalIds: rollback.supersededApprovalIds,
    };
  }

  const next = applyApprovalDecision({
    stage,
    decision,
    currentRunOutcomeStatus: currentRunOutcomeStatus ?? 'in_progress',
  });

  return {
    skill: APPROVAL_GATE_SKILL,
    decision,
    nextStageStatus: next.nextStageStatus,
    nextRunLifecycleStatus: next.nextRunLifecycleStatus,
    nextRunOutcomeStatus: next.nextRunOutcomeStatus,
  };
};
