import { createHash } from 'node:crypto';

import {
  ApprovalRecordSchema,
  SideEffectLedgerEntrySchema,
  StructuredErrorSchema,
  type ApprovalRecord,
  type ExecutionContext,
  type FeishuRecordDraft,
  type FeishuRecordResult,
  type ProjectProfile,
  type SideEffectLedgerEntry,
  type StructuredError,
} from '../domain/index.js';

const FEISHU_RECORD_STAGE = 'Knowledge Recording';

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, nestedValue]) =>
          `${JSON.stringify(key)}:${stableStringify(nestedValue)}`,
      )
      .join(',')}}`;
  }

  return JSON.stringify(value);
};

const sha256 = (value: unknown) =>
  `sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`;

export const createFeishuRecordPreviewState = ({
  context,
  draftRef,
  draft,
  updatedAt,
}: {
  context: ExecutionContext;
  draftRef: string;
  draft: FeishuRecordDraft;
  updatedAt: string;
}): {
  context: ExecutionContext;
  previewHash: string;
  supersededApprovalIds: string[];
} => {
  const previewHash = sha256({
    target_ref: draft.target_ref,
    rendered_preview: draft.rendered_preview,
    request_payload_hash: draft.request_payload_hash,
    idempotency_key: draft.idempotency_key,
  });
  const previousApprovalId = context.active_approval_ref_map[FEISHU_RECORD_STAGE];
  const nextApprovalMap = {
    ...context.active_approval_ref_map,
  };

  delete nextApprovalMap[FEISHU_RECORD_STAGE];

  return {
    context: {
      ...context,
      updated_at: updatedAt,
      waiting_reason: null,
      active_error_ref: null,
      feishu_record_draft_ref: draftRef,
      feishu_record_result_ref: null,
      stage_status_map: {
        ...context.stage_status_map,
        [FEISHU_RECORD_STAGE]: 'output_ready',
      },
      stage_artifact_refs: {
        ...context.stage_artifact_refs,
        [FEISHU_RECORD_STAGE]: [draftRef],
      },
      active_approval_ref_map: nextApprovalMap,
    },
    previewHash,
    supersededApprovalIds: previousApprovalId ? [previousApprovalId] : [],
  };
};

export const buildFeishuRecordApprovalRecord = ({
  approvalId,
  decider,
  previewRef,
  previewHash,
  requestedAt,
  decidedAt,
  commentRef,
}: {
  approvalId: string;
  decider: string;
  previewRef: string;
  previewHash: string;
  requestedAt: string;
  decidedAt: string | null;
  commentRef: string | null;
}): ApprovalRecord =>
  ApprovalRecordSchema.parse({
    approval_id: approvalId,
    stage: FEISHU_RECORD_STAGE,
    approval_status: decidedAt ? 'approved' : 'pending',
    decision: 'approve',
    decider,
    comment_ref: commentRef,
    preview_ref: previewRef,
    preview_hash: previewHash,
    requested_at: requestedAt,
    decided_at: decidedAt,
  });

export const guardFeishuRecordRequirementBinding = ({
  projectProfile,
  context,
  timestamp,
}: {
  projectProfile: ProjectProfile;
  context: ExecutionContext;
  timestamp: string;
}): StructuredError | null => {
  if (!projectProfile.approval_policy.requirement_binding_required) {
    return null;
  }

  const hasUnresolvedRequirement = context.requirement_refs.some(
    (reference) => reference.requirement_binding_status === 'unresolved',
  );

  if (!hasUnresolvedRequirement) {
    return null;
  }

  return StructuredErrorSchema.parse({
    code: 'requirement_binding_required',
    category: 'requirement_mapping_failed',
    stage: FEISHU_RECORD_STAGE,
    system: 'workflow',
    operation: 'guard-feishu-record',
    target_ref: context.feishu_record_draft_ref,
    message:
      'Requirement binding must be resolved before Feishu knowledge recording can execute for this project.',
    detail:
      'The current run still contains an unresolved requirement reference while the project approval policy marks requirement binding as mandatory before external writeback.',
    retryable: false,
    outcome_unknown: false,
    user_action:
      'Resolve the requirement binding or relax the project policy before retrying Feishu knowledge recording.',
    raw_cause_ref: null,
    partial_state_ref: null,
    timestamp,
  });
};

export const buildFeishuRecordPreparedEntry = ({
  draft,
  attemptNo,
  executedAt,
}: {
  draft: FeishuRecordDraft;
  attemptNo: number;
  executedAt: string;
}): SideEffectLedgerEntry =>
  SideEffectLedgerEntrySchema.parse({
    system: 'feishu',
    operation: draft.write_mode === 'append' ? 'append-block' : 'replace-block',
    idempotency_key: draft.idempotency_key,
    dedupe_scope: draft.dedupe_scope,
    request_payload_hash: draft.request_payload_hash,
    target_ref: draft.target_ref,
    expected_target_version: draft.expected_target_version,
    result_ref: null,
    status: 'prepared',
    attempt_no: attemptNo,
    already_applied: false,
    external_request_id: null,
    executed_at: executedAt,
  });

export const markFeishuRecordEntryDispatched = ({
  entry,
  externalRequestId,
  executedAt,
}: {
  entry: SideEffectLedgerEntry;
  externalRequestId: string | null;
  executedAt: string;
}): SideEffectLedgerEntry =>
  SideEffectLedgerEntrySchema.parse({
    ...entry,
    status: 'dispatched',
    external_request_id: externalRequestId,
    executed_at: executedAt,
  });

export const finalizeFeishuRecordEntry = ({
  entry,
  resultRef,
  result,
  executedAt,
  status = 'succeeded',
}: {
  entry: SideEffectLedgerEntry;
  resultRef: string | null;
  result: FeishuRecordResult;
  executedAt: string;
  status?: 'succeeded' | 'failed' | 'outcome_unknown';
}): SideEffectLedgerEntry =>
  SideEffectLedgerEntrySchema.parse({
    ...entry,
    result_ref: resultRef,
    status,
    already_applied: result.already_applied,
    external_request_id: result.external_request_id,
    executed_at: executedAt,
  });

export const shouldSkipFeishuRecordExecution = ({
  dryRun,
  latestEntry,
}: {
  dryRun: boolean;
  latestEntry: SideEffectLedgerEntry | null;
}):
  | {
      skip: true;
      reason: 'dry_run_preview_only' | 'terminal_side_effect_present';
    }
  | {
      skip: false;
      reason: null;
    } => {
  if (dryRun) {
    return {
      skip: true,
      reason: 'dry_run_preview_only',
    };
  }

  if (
    latestEntry &&
    (latestEntry.status === 'succeeded' || latestEntry.already_applied)
  ) {
    return {
      skip: true,
      reason: 'terminal_side_effect_present',
    };
  }

  return {
    skip: false,
    reason: null,
  };
};
