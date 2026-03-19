import { z } from 'zod';

import {
  APPROVAL_DECISIONS,
  APPROVAL_STATUSES,
  BUGFIX_STAGES,
  ERROR_CATEGORIES,
  FEISHU_WRITE_MODES,
  GITLAB_ARTIFACT_SOURCES,
  GITLAB_ARTIFACT_TYPES,
  JIRA_WRITEBACK_TARGET_TYPES,
  REQUIREMENT_BINDING_STATUSES,
  RUN_LIFECYCLE_STATUSES,
  RUN_MODES,
  RUN_OUTCOME_STATUSES,
  SIDE_EFFECT_STATUSES,
  STAGE_RESULT_STATUSES,
  STAGE_STATUSES,
} from './enums.js';

const NonEmptyStringSchema = z.string().trim().min(1);
const TimestampSchema = z.iso.datetime({ offset: true });
const UrlSchema = z.url();
const JsonValueSchema = z.json();

const StageSchema = z.enum(BUGFIX_STAGES);
const StageStatusSchema = z.enum(STAGE_STATUSES);
const StageResultStatusSchema = z.enum(STAGE_RESULT_STATUSES);
const ApprovalDecisionSchema = z.enum(APPROVAL_DECISIONS);
const ApprovalStatusSchema = z.enum(APPROVAL_STATUSES);
const RunLifecycleStatusSchema = z.enum(RUN_LIFECYCLE_STATUSES);
const RunOutcomeStatusSchema = z.enum(RUN_OUTCOME_STATUSES);
const RunModeSchema = z.enum(RUN_MODES);
const RequirementBindingStatusSchema = z.enum(REQUIREMENT_BINDING_STATUSES);
const GitLabArtifactTypeSchema = z.enum(GITLAB_ARTIFACT_TYPES);
const GitLabArtifactSourceSchema = z.enum(GITLAB_ARTIFACT_SOURCES);
const JiraWritebackTargetTypeSchema = z.enum(JIRA_WRITEBACK_TARGET_TYPES);
const FeishuWriteModeSchema = z.enum(FEISHU_WRITE_MODES);
const SideEffectStatusSchema = z.enum(SIDE_EFFECT_STATUSES);
const ErrorCategorySchema = z.enum(ERROR_CATEGORIES);

const buildPartialStageRecordSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z
    .object(
      Object.fromEntries(
        BUGFIX_STAGES.map((stage) => [stage, valueSchema]),
      ) as Record<(typeof BUGFIX_STAGES)[number], T>,
    )
    .partial();

export const RequirementLinkRuleSchema = z
  .object({
    source_type: z.enum([
      'issue_link',
      'custom_field',
      'label',
      'text_pattern',
      'manual',
    ]),
    priority: z.number().int().nonnegative(),
    fallback_action: z.enum(['block', 'manual', 'unresolved']),
  })
  .strict();

const RequirementHintSourceSchema = RequirementLinkRuleSchema.shape.source_type;

export const RepoModuleRuleSchema = z
  .object({
    module_id: NonEmptyStringSchema,
    path_pattern: NonEmptyStringSchema,
  })
  .strict();

export const ProjectProfileSchema = z
  .object({
    project_id: NonEmptyStringSchema,
    project_name: NonEmptyStringSchema,
    config_version: NonEmptyStringSchema,
    jira: z
      .object({
        base_url: UrlSchema,
        project_key: NonEmptyStringSchema,
        issue_type_ids: z.array(NonEmptyStringSchema).min(1),
        requirement_link_rules: z.array(RequirementLinkRuleSchema).min(1),
        writeback_targets: z.array(NonEmptyStringSchema).min(1),
        credential_ref: NonEmptyStringSchema,
      })
      .strict(),
    requirements: z
      .object({
        source_type: NonEmptyStringSchema,
        source_ref: NonEmptyStringSchema,
      })
      .strict(),
    gitlab: z
      .object({
        base_url: UrlSchema,
        project_id: NonEmptyStringSchema,
        default_branch: NonEmptyStringSchema,
        branch_naming_rule: NonEmptyStringSchema,
        credential_ref: NonEmptyStringSchema,
      })
      .strict(),
    feishu: z
      .object({
        space_id: NonEmptyStringSchema,
        doc_id: NonEmptyStringSchema,
        block_path_or_anchor: NonEmptyStringSchema,
        template_id: NonEmptyStringSchema,
        template_version: NonEmptyStringSchema,
        credential_ref: NonEmptyStringSchema,
      })
      .strict(),
    repo: z
      .object({
        local_path: NonEmptyStringSchema,
        module_rules: z.array(RepoModuleRuleSchema).min(1),
      })
      .strict(),
    approval_policy: z
      .object({
        requirement_binding_required: z.boolean(),
      })
      .passthrough(),
    serialization_policy: z
      .object({
        persist_dry_run_previews: z.boolean(),
      })
      .passthrough(),
    sensitivity_policy: z
      .object({
        sensitive_field_paths: z.array(NonEmptyStringSchema),
        prohibited_plaintext_fields: z.array(NonEmptyStringSchema),
      })
      .passthrough(),
  })
  .strict();

const RequirementReferenceBaseSchema = z
  .object({
    requirement_id: NonEmptyStringSchema.nullable(),
    requirement_ref: NonEmptyStringSchema.nullable(),
    requirement_binding_status: RequirementBindingStatusSchema,
    binding_reason: NonEmptyStringSchema.nullable(),
  })
  .strict();

export const RequirementReferenceSchema = RequirementReferenceBaseSchema
  .superRefine((value, ctx) => {
    if (value.requirement_binding_status === 'unresolved') {
      if (!value.binding_reason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'binding_reason is required when requirement_binding_status is unresolved.',
          path: ['binding_reason'],
        });
      }
      return;
    }

    if (!value.requirement_id && !value.requirement_ref) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A resolved requirement must provide requirement_id or requirement_ref.',
        path: ['requirement_id'],
      });
    }
  });

export const RequirementBriefSchema = z
  .object({
    issue_key: NonEmptyStringSchema,
    project_id: NonEmptyStringSchema,
    linked_requirement: RequirementReferenceBaseSchema.pick({
      requirement_id: true,
      requirement_ref: true,
      requirement_binding_status: true,
      binding_reason: true,
    }).nullable(),
    requirement_binding_status: RequirementBindingStatusSchema,
    binding_reason: NonEmptyStringSchema.nullable(),
    known_context: z.array(NonEmptyStringSchema),
    fix_goal: NonEmptyStringSchema,
    pending_questions: z.array(NonEmptyStringSchema),
    generated_at: TimestampSchema,
    source_refs: z.array(NonEmptyStringSchema).min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.requirement_binding_status === 'unresolved') {
      if (!value.binding_reason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'binding_reason is required when requirement_binding_status is unresolved.',
          path: ['binding_reason'],
        });
      }
      return;
    }

    if (!value.linked_requirement) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'linked_requirement is required when requirement_binding_status is resolved.',
        path: ['linked_requirement'],
      });
    }
  });

const GitLabArtifactBaseSchema = z.object({
  artifact_source: GitLabArtifactSourceSchema,
  project_id: NonEmptyStringSchema,
  project_path: NonEmptyStringSchema,
  default_branch: NonEmptyStringSchema,
  created_at: TimestampSchema,
});

export const GitLabArtifactSchema = z.discriminatedUnion('artifact_type', [
  GitLabArtifactBaseSchema.extend({
    artifact_type: z.literal('commit'),
    branch_name: NonEmptyStringSchema.optional(),
    commit_sha: NonEmptyStringSchema,
    commit_url: UrlSchema,
    mr_iid: z.number().int().positive().optional(),
    mr_url: UrlSchema.optional(),
  }).strict(),
  GitLabArtifactBaseSchema.extend({
    artifact_type: z.literal('branch'),
    branch_name: NonEmptyStringSchema,
    commit_sha: NonEmptyStringSchema.optional(),
    commit_url: UrlSchema.optional(),
    mr_iid: z.number().int().positive().optional(),
    mr_url: UrlSchema.optional(),
  }).strict(),
  GitLabArtifactBaseSchema.extend({
    artifact_type: z.literal('mr'),
    branch_name: NonEmptyStringSchema.optional(),
    commit_sha: NonEmptyStringSchema.optional(),
    commit_url: UrlSchema.optional(),
    mr_iid: z.number().int().positive(),
    mr_url: UrlSchema,
  }).strict(),
]);

export const JiraWritebackDraftSchema = z
  .object({
    issue_key: NonEmptyStringSchema,
    target_type: JiraWritebackTargetTypeSchema,
    target_field_id_or_comment_mode: NonEmptyStringSchema,
    rendered_preview: NonEmptyStringSchema,
    request_payload: JsonValueSchema,
    idempotency_key: NonEmptyStringSchema,
  })
  .strict();

export const JiraIssueRequirementHintSchema = z
  .object({
    source_type: RequirementHintSourceSchema,
    values: z.array(NonEmptyStringSchema).min(1),
    source_field: NonEmptyStringSchema,
  })
  .strict();

export const JiraIssueWritebackTargetSchema = z
  .object({
    target_type: JiraWritebackTargetTypeSchema,
    target_field_id_or_comment_mode: NonEmptyStringSchema,
  })
  .strict();

export const JiraIssueSnapshotSchema = z
  .object({
    issue_key: NonEmptyStringSchema,
    issue_id: NonEmptyStringSchema,
    issue_type_id: NonEmptyStringSchema,
    project_key: NonEmptyStringSchema,
    summary: NonEmptyStringSchema,
    description: NonEmptyStringSchema,
    status_name: NonEmptyStringSchema,
    labels: z.array(NonEmptyStringSchema),
    source_url: UrlSchema.nullable(),
    requirement_hints: z.array(JiraIssueRequirementHintSchema),
    writeback_targets: z.array(JiraIssueWritebackTargetSchema).min(1),
  })
  .strict();

export const JiraWritebackResultSchema = z
  .object({
    result_id: NonEmptyStringSchema,
    target_ref: NonEmptyStringSchema,
    target_version: NonEmptyStringSchema,
    result_url: UrlSchema,
    updated_at: TimestampSchema,
  })
  .strict();

export const FeishuRecordDraftSchema = z
  .object({
    space_id: NonEmptyStringSchema,
    doc_id: NonEmptyStringSchema,
    block_id_or_anchor: NonEmptyStringSchema,
    template_id: NonEmptyStringSchema,
    template_version: NonEmptyStringSchema,
    write_mode: FeishuWriteModeSchema,
    rendered_preview: NonEmptyStringSchema,
    request_payload: JsonValueSchema,
    idempotency_key: NonEmptyStringSchema,
  })
  .strict();

export const FeishuRecordResultSchema = z
  .object({
    result_id: NonEmptyStringSchema,
    target_ref: NonEmptyStringSchema,
    target_version: NonEmptyStringSchema,
    result_url: UrlSchema,
  })
  .strict();

export const ApprovalRecordSchema = z
  .object({
    approval_id: NonEmptyStringSchema,
    stage: StageSchema,
    approval_status: ApprovalStatusSchema,
    decision: ApprovalDecisionSchema,
    decider: NonEmptyStringSchema,
    comment_ref: NonEmptyStringSchema.nullable(),
    preview_ref: NonEmptyStringSchema,
    preview_hash: NonEmptyStringSchema,
    requested_at: TimestampSchema,
    decided_at: TimestampSchema.nullable(),
    rollback_to_stage: StageSchema.nullable().optional(),
    superseded_by: NonEmptyStringSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.decision === 'revise' && !value.rollback_to_stage) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'rollback_to_stage is required when decision is revise.',
        path: ['rollback_to_stage'],
      });
    }
  });

export const SideEffectLedgerEntrySchema = z
  .object({
    system: z.enum(['jira', 'feishu']),
    operation: NonEmptyStringSchema,
    idempotency_key: NonEmptyStringSchema,
    dedupe_scope: NonEmptyStringSchema,
    request_payload_hash: NonEmptyStringSchema,
    target_ref: NonEmptyStringSchema,
    expected_target_version: NonEmptyStringSchema.nullable(),
    result_ref: NonEmptyStringSchema.nullable(),
    status: SideEffectStatusSchema,
    attempt_no: z.number().int().positive(),
    already_applied: z.boolean(),
    external_request_id: NonEmptyStringSchema.nullable(),
    executed_at: TimestampSchema,
  })
  .strict();

export const CheckpointRecordSchema = z
  .object({
    checkpoint_id: NonEmptyStringSchema,
    run_id: NonEmptyStringSchema,
    sequence: z.number().int().nonnegative(),
    created_at: TimestampSchema,
    trigger_event: NonEmptyStringSchema,
    current_stage: StageSchema,
    run_lifecycle_status: RunLifecycleStatusSchema,
    run_outcome_status: RunOutcomeStatusSchema,
    stage_status_map: buildPartialStageRecordSchema(StageStatusSchema),
    active_artifact_refs: z.array(NonEmptyStringSchema),
    active_approval_refs: z.array(NonEmptyStringSchema),
    active_error_ref: NonEmptyStringSchema.nullable(),
    latest_side_effect_ref: NonEmptyStringSchema.nullable(),
    parent_checkpoint_id: NonEmptyStringSchema.nullable(),
    context_hash: NonEmptyStringSchema,
  })
  .strict();

export const RepoSelectionSchema = z
  .object({
    repo_path: NonEmptyStringSchema,
    module_candidates: z.array(NonEmptyStringSchema),
  })
  .strict();

export const RequirementCandidateSchema = z
  .object({
    requirement_ref: NonEmptyStringSchema,
    source_type: RequirementHintSourceSchema,
    priority: z.number().int().nonnegative(),
    reason: NonEmptyStringSchema,
  })
  .strict();

export const CodeTargetSchema = z
  .object({
    file_path: NonEmptyStringSchema,
    reason: NonEmptyStringSchema,
  })
  .strict();

export const JiraIntakeDataSchema = z
  .object({
    issue_key: NonEmptyStringSchema,
    issue_status: NonEmptyStringSchema,
    requirement_hint_count: z.number().int().nonnegative(),
    writeback_target_count: z.number().int().nonnegative(),
  })
  .strict();

export const ProjectContextDataSchema = z
  .object({
    project_id: NonEmptyStringSchema,
    requirement: RequirementReferenceSchema,
    requirement_candidates: z.array(RequirementCandidateSchema),
    repo_selection: RepoSelectionSchema,
    requirement_source_ref: NonEmptyStringSchema,
    gitlab_project_id: NonEmptyStringSchema,
    gitlab_default_branch: NonEmptyStringSchema,
  })
  .strict();

export const CodeLocalizationDataSchema = z
  .object({
    impact_modules: z.array(NonEmptyStringSchema),
    code_targets: z.array(CodeTargetSchema),
    root_cause_hypotheses: z.array(NonEmptyStringSchema),
  })
  .strict();

export const ExecutionContextSchema = z
  .object({
    run_id: NonEmptyStringSchema,
    project_id: NonEmptyStringSchema,
    config_version: NonEmptyStringSchema,
    run_mode: RunModeSchema,
    run_lifecycle_status: RunLifecycleStatusSchema,
    run_outcome_status: RunOutcomeStatusSchema,
    current_stage: StageSchema,
    stage_status_map: buildPartialStageRecordSchema(StageStatusSchema),
    stage_artifact_refs: buildPartialStageRecordSchema(
      z.array(NonEmptyStringSchema),
    ),
    active_approval_ref_map: buildPartialStageRecordSchema(NonEmptyStringSchema),
    waiting_reason: NonEmptyStringSchema.nullable(),
    initiator: NonEmptyStringSchema,
    started_at: TimestampSchema,
    updated_at: TimestampSchema,
    jira_issue_snapshot_ref: NonEmptyStringSchema,
    requirement_refs: z.array(RequirementReferenceSchema),
    repo_selection: RepoSelectionSchema.nullable().optional(),
    code_targets: z.array(CodeTargetSchema),
    root_cause_hypotheses: z.array(NonEmptyStringSchema),
    fix_plan: z.array(NonEmptyStringSchema),
    verification_plan: z.array(NonEmptyStringSchema),
    verification_results_ref: NonEmptyStringSchema.nullable(),
    gitlab_artifacts: z.array(GitLabArtifactSchema),
    jira_writeback_draft_ref: NonEmptyStringSchema.nullable(),
    jira_writeback_result_ref: NonEmptyStringSchema.nullable(),
    feishu_record_draft_ref: NonEmptyStringSchema.nullable(),
    feishu_record_result_ref: NonEmptyStringSchema.nullable(),
    active_error_ref: NonEmptyStringSchema.nullable(),
    sensitive_field_paths: z.array(NonEmptyStringSchema),
  })
  .strict();

export const BugfixReportSchema = z
  .object({
    report_id: NonEmptyStringSchema,
    run_id: NonEmptyStringSchema,
    final_status: RunOutcomeStatusSchema,
    issue_ref: NonEmptyStringSchema,
    requirement_refs: z.array(NonEmptyStringSchema),
    code_locations: z.array(NonEmptyStringSchema),
    root_cause_summary: NonEmptyStringSchema,
    fix_summary: NonEmptyStringSchema,
    verification_summary: NonEmptyStringSchema,
    artifacts: z.array(NonEmptyStringSchema),
    jira_writeback_summary: NonEmptyStringSchema,
    feishu_record_summary: NonEmptyStringSchema,
    external_outcomes: z.array(NonEmptyStringSchema),
    approval_history: z.array(NonEmptyStringSchema),
    open_risks: z.array(NonEmptyStringSchema),
    failure_summary: NonEmptyStringSchema.nullable(),
    generated_at: TimestampSchema,
    config_version: NonEmptyStringSchema,
  })
  .strict();

export const StructuredErrorSchema = z
  .object({
    code: NonEmptyStringSchema,
    category: ErrorCategorySchema,
    stage: StageSchema,
    system: NonEmptyStringSchema,
    operation: NonEmptyStringSchema,
    target_ref: NonEmptyStringSchema.nullable(),
    message: NonEmptyStringSchema,
    detail: NonEmptyStringSchema.nullable(),
    retryable: z.boolean(),
    outcome_unknown: z.boolean(),
    user_action: NonEmptyStringSchema,
    raw_cause_ref: NonEmptyStringSchema.nullable(),
    partial_state_ref: NonEmptyStringSchema.nullable(),
    timestamp: TimestampSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.outcome_unknown &&
      value.category !== 'writeback_outcome_unknown'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'outcome_unknown requires the writeback_outcome_unknown category.',
        path: ['category'],
      });
    }
  });

export const createStageResultSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z
    .object({
      status: StageResultStatusSchema,
      summary: NonEmptyStringSchema,
      data: dataSchema.nullable(),
      warnings: z.array(NonEmptyStringSchema),
      errors: z.array(StructuredErrorSchema),
      waiting_for: NonEmptyStringSchema.nullable(),
      source_refs: z.array(NonEmptyStringSchema).min(1),
      generated_at: TimestampSchema,
    })
    .strict();

export const JiraIntakeStageResultSchema = createStageResultSchema(JiraIntakeDataSchema);
export const ProjectContextStageResultSchema = createStageResultSchema(
  ProjectContextDataSchema,
);
export const RequirementSynthesisStageResultSchema = createStageResultSchema(
  RequirementBriefSchema,
);
export const CodeLocalizationStageResultSchema = createStageResultSchema(
  CodeLocalizationDataSchema,
);

export type ProjectProfile = z.infer<typeof ProjectProfileSchema>;
export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;
export type RequirementBrief = z.infer<typeof RequirementBriefSchema>;
export type BugfixReport = z.infer<typeof BugfixReportSchema>;
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;
export type SideEffectLedgerEntry = z.infer<typeof SideEffectLedgerEntrySchema>;
export type CheckpointRecord = z.infer<typeof CheckpointRecordSchema>;
export type StructuredError = z.infer<typeof StructuredErrorSchema>;
export type JiraIssueSnapshot = z.infer<typeof JiraIssueSnapshotSchema>;
export type JiraIssueRequirementHint = z.infer<typeof JiraIssueRequirementHintSchema>;
export type JiraIssueWritebackTarget = z.infer<typeof JiraIssueWritebackTargetSchema>;
export type RequirementCandidate = z.infer<typeof RequirementCandidateSchema>;
export type JiraIntakeData = z.infer<typeof JiraIntakeDataSchema>;
export type ProjectContextData = z.infer<typeof ProjectContextDataSchema>;
export type CodeLocalizationData = z.infer<typeof CodeLocalizationDataSchema>;
export type RepoSelection = z.infer<typeof RepoSelectionSchema>;
export type StageResultStatus = z.infer<typeof StageResultStatusSchema>;
export type StageResult<T> = {
  status: StageResultStatus;
  summary: string;
  data: T | null;
  warnings: string[];
  errors: StructuredError[];
  waiting_for: string | null;
  source_refs: string[];
  generated_at: string;
};
export type JiraIntakeStageResult = z.infer<typeof JiraIntakeStageResultSchema>;
export type ProjectContextStageResult = z.infer<
  typeof ProjectContextStageResultSchema
>;
export type RequirementSynthesisStageResult = z.infer<
  typeof RequirementSynthesisStageResultSchema
>;
export type CodeLocalizationStageResult = z.infer<
  typeof CodeLocalizationStageResultSchema
>;
