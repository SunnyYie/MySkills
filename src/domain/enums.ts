export const BUGFIX_STAGES = [
  'Intake',
  'Context Resolution',
  'Requirement Synthesis',
  'Code Localization',
  'Fix Planning',
  'Execution',
  'Artifact Linking',
  'Knowledge Recording',
] as const;

export const STAGE_STATUSES = [
  'not_started',
  'in_progress',
  'output_ready',
  'waiting_approval',
  'approved_pending_write',
  'executing_side_effect',
  'waiting_external_input',
  'completed',
  'failed',
  'stale',
  'skipped',
] as const;

export const APPROVAL_DECISIONS = ['approve', 'reject', 'revise'] as const;

export const APPROVAL_STATUSES = [
  'none',
  'pending',
  'approved',
  'rejected',
  'revise_requested',
  'superseded',
] as const;

export const RUN_LIFECYCLE_STATUSES = [
  'active',
  'waiting_approval',
  'waiting_external_input',
  'paused',
  'cancelled',
  'completed',
  'failed',
] as const;

export const RUN_OUTCOME_STATUSES = [
  'unknown',
  'in_progress',
  'success',
  'partial_success',
  'failed',
  'cancelled',
] as const;

export const RUN_MODES = [
  'full',
  'brief_only',
  'jira_writeback_only',
  'feishu_record_only',
] as const;

export const REQUIREMENT_BINDING_STATUSES = ['resolved', 'unresolved'] as const;

export const GITLAB_ARTIFACT_TYPES = ['commit', 'branch', 'mr'] as const;

export const GITLAB_ARTIFACT_SOURCES = [
  'system_generated',
  'external_import',
] as const;

export const JIRA_WRITEBACK_TARGET_TYPES = ['comment', 'field'] as const;

export const FEISHU_WRITE_MODES = ['append', 'replace_block'] as const;

export const SIDE_EFFECT_STATUSES = [
  'prepared',
  'dispatched',
  'succeeded',
  'failed',
  'outcome_unknown',
] as const;

export const ERROR_CATEGORIES = [
  'configuration_missing',
  'authentication_failed',
  'permission_denied',
  'network_error',
  'external_field_missing',
  'requirement_mapping_failed',
  'repo_resolution_failed',
  'user_rejected',
  'writeback_failed',
  'writeback_outcome_unknown',
  'validation_error',
  'state_conflict',
] as const;

export const ERROR_CATEGORY_POLICIES = {
  configuration_missing: {
    defaultRetryable: false,
    supportsOutcomeUnknown: false,
  },
  authentication_failed: {
    defaultRetryable: false,
    supportsOutcomeUnknown: false,
  },
  permission_denied: {
    defaultRetryable: false,
    supportsOutcomeUnknown: false,
  },
  network_error: {
    defaultRetryable: true,
    supportsOutcomeUnknown: false,
  },
  external_field_missing: {
    defaultRetryable: false,
    supportsOutcomeUnknown: false,
  },
  requirement_mapping_failed: {
    defaultRetryable: false,
    supportsOutcomeUnknown: false,
  },
  repo_resolution_failed: {
    defaultRetryable: false,
    supportsOutcomeUnknown: false,
  },
  user_rejected: {
    defaultRetryable: false,
    supportsOutcomeUnknown: false,
  },
  writeback_failed: {
    defaultRetryable: true,
    supportsOutcomeUnknown: false,
  },
  writeback_outcome_unknown: {
    defaultRetryable: false,
    supportsOutcomeUnknown: true,
  },
  validation_error: {
    defaultRetryable: false,
    supportsOutcomeUnknown: false,
  },
  state_conflict: {
    defaultRetryable: false,
    supportsOutcomeUnknown: false,
  },
} as const;

export const EXECUTION_CONTEXT_STORAGE_PROJECTION = {
  context: [
    'run_id',
    'project_id',
    'config_version',
    'run_mode',
    'run_lifecycle_status',
    'run_outcome_status',
    'current_stage',
    'stage_status_map',
    'stage_artifact_refs',
    'active_approval_ref_map',
    'waiting_reason',
    'initiator',
    'started_at',
    'updated_at',
    'jira_issue_snapshot_ref',
    'requirement_refs',
    'repo_selection',
    'code_targets',
    'root_cause_hypotheses',
    'fix_plan',
    'verification_plan',
    'verification_results_ref',
    'gitlab_artifacts',
    'jira_writeback_draft_ref',
    'jira_writeback_result_ref',
    'feishu_record_draft_ref',
    'feishu_record_result_ref',
    'active_error_ref',
    'sensitive_field_paths',
  ],
  checkpoints: ['checkpoints/', 'CheckpointRecord snapshots'],
  artifacts: ['artifacts/', 'briefs, previews, reports, raw payload refs'],
  sideEffects: ['side-effects.ndjson', 'SideEffectLedgerEntry history'],
  errors: ['artifacts/errors/', 'StructuredError raw causes and long details'],
} as const;
