import { describe, expect, it } from 'vitest';

import {
  APPROVAL_DECISIONS,
  APPROVAL_STATUSES,
  ApprovalRecordSchema,
  BUGFIX_STAGES,
  BugfixReportSchema,
  CheckpointRecordSchema,
  ERROR_CATEGORIES,
  ERROR_CATEGORY_POLICIES,
  EXECUTION_CONTEXT_STORAGE_PROJECTION,
  V2_RUNTIME_FIELD_CARRIERS,
  ExecutionContextSchema,
  FeishuRecordDraftSchema,
  FeishuRecordResultSchema,
  FixPlanningDataSchema,
  FixPlanningStageResultSchema,
  GitLabArtifactSchema,
  JiraWritebackDraftSchema,
  JiraWritebackResultSchema,
  JIRA_V2_SIDE_EFFECT_OPERATIONS,
  JiraV2SideEffectLedgerEntrySchema,
  ProjectProfileSchema,
  RequirementBriefSchema,
  RUN_LIFECYCLE_STATUSES,
  RUN_MODES,
  RUN_OUTCOME_STATUSES,
  STAGE_STATUSES,
  SideEffectLedgerEntrySchema,
  StructuredErrorSchema,
  VerificationResultSchema,
  VerificationRecordingStageResultSchema,
} from '../../../src/domain/index.js';

describe('domain contracts', () => {
  it('freezes the stage and run enums required by the implementation plan', () => {
    expect(BUGFIX_STAGES).toEqual([
      'Intake',
      'Context Resolution',
      'Requirement Synthesis',
      'Code Localization',
      'Fix Planning',
      'Execution',
      'Artifact Linking',
      'Knowledge Recording',
    ]);

    expect(STAGE_STATUSES).toEqual([
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
    ]);

    expect(APPROVAL_DECISIONS).toEqual(['approve', 'reject', 'revise']);
    expect(APPROVAL_STATUSES).toEqual([
      'none',
      'pending',
      'approved',
      'rejected',
      'revise_requested',
      'superseded',
    ]);
    expect(RUN_LIFECYCLE_STATUSES).toEqual([
      'active',
      'waiting_approval',
      'waiting_external_input',
      'paused',
      'cancelled',
      'completed',
      'failed',
    ]);
    expect(RUN_OUTCOME_STATUSES).toEqual([
      'unknown',
      'in_progress',
      'success',
      'partial_success',
      'failed',
      'cancelled',
    ]);
    expect(RUN_MODES).toEqual([
      'full',
      'brief_only',
      'jira_writeback_only',
      'feishu_record_only',
    ]);
  });

  it('validates the minimal project profile required by the product and technical docs', () => {
    const profile = {
      project_id: 'proj-a',
      project_name: 'Project A',
      config_version: '2026-03-19',
      jira: {
        base_url: 'https://jira.example.com',
        project_key: 'BUG',
        issue_type_ids: ['10001'],
        requirement_link_rules: [
          {
            source_type: 'issue_link',
            priority: 1,
            fallback_action: 'manual',
          },
        ],
        writeback_targets: ['comment'],
        subtask: {
          issue_type_id: '10002',
          summary_template: '[{issue_key}] {summary}',
        },
        branch_binding: {
          target_issue_source: 'subtask',
          fallback_to_bug: true,
        },
        commit_binding: {
          target_issue_source: 'subtask',
        },
        credential_ref: 'cred:jira/project-a',
      },
      requirements: {
        source_type: 'feishu_doc',
        source_ref: 'doc://feishu/project-a',
      },
      gitlab: {
        base_url: 'https://gitlab.example.com',
        project_id: 'group/project-a',
        default_branch: 'main',
        branch_naming_rule: 'bugfix/{issue_key}',
        branch_binding: {
          input_mode: 'current_branch',
        },
        credential_ref: 'cred:gitlab/project-a',
      },
      feishu: {
        space_id: 'space-1',
        doc_id: 'doc-1',
        block_path_or_anchor: 'root/bugs',
        template_id: 'tpl-1',
        template_version: 'v1',
        credential_ref: 'cred:feishu/project-a',
      },
      repo: {
        local_path: '/workspace/project-a',
        module_rules: [{ module_id: 'api', path_pattern: 'src/api/**' }],
      },
      approval_policy: {
        requirement_binding_required: false,
      },
      serialization_policy: {
        persist_dry_run_previews: true,
      },
      sensitivity_policy: {
        sensitive_field_paths: ['jira.credential_ref'],
        prohibited_plaintext_fields: ['token'],
      },
    };

    expect(ProjectProfileSchema.safeParse(profile).success).toBe(true);
  });

  it('enforces unresolved requirement rules on RequirementBrief', () => {
    const unresolvedResult = RequirementBriefSchema.safeParse({
      issue_key: 'BUG-123',
      project_id: 'proj-a',
      linked_requirement: null,
      requirement_binding_status: 'unresolved',
      binding_reason: 'No matching requirement link found in Jira.',
      known_context: ['Issue affects billing export'],
      fix_goal: 'Prevent export crash',
      pending_questions: ['Need the exact failing tenant id'],
      generated_at: '2026-03-19T10:30:00.000Z',
      source_refs: ['artifact://jira/issue-snapshot'],
    });

    const invalidUnresolvedResult = RequirementBriefSchema.safeParse({
      issue_key: 'BUG-123',
      project_id: 'proj-a',
      linked_requirement: null,
      requirement_binding_status: 'unresolved',
      known_context: ['Issue affects billing export'],
      fix_goal: 'Prevent export crash',
      pending_questions: [],
      generated_at: '2026-03-19T10:30:00.000Z',
      source_refs: ['artifact://jira/issue-snapshot'],
    });

    const invalidResolvedResult = RequirementBriefSchema.safeParse({
      issue_key: 'BUG-123',
      project_id: 'proj-a',
      linked_requirement: null,
      requirement_binding_status: 'resolved',
      binding_reason: null,
      known_context: ['Issue affects billing export'],
      fix_goal: 'Prevent export crash',
      pending_questions: [],
      generated_at: '2026-03-19T10:30:00.000Z',
      source_refs: ['artifact://jira/issue-snapshot'],
    });

    expect(unresolvedResult.success).toBe(true);
    expect(invalidUnresolvedResult.success).toBe(false);
    expect(invalidResolvedResult.success).toBe(false);
  });

  it('enforces GitLab artifact conditional required fields by artifact type', () => {
    expect(
      GitLabArtifactSchema.safeParse({
        artifact_source: 'external_import',
        project_id: 'group/project-a',
        project_path: 'group/project-a',
        default_branch: 'main',
        artifact_type: 'commit',
        commit_sha: '0123456789abcdef0123456789abcdef01234567',
        commit_url: 'https://gitlab.example.com/group/project-a/-/commit/0123456789abcdef0123456789abcdef01234567',
        created_at: '2026-03-19T10:30:00.000Z',
      }).success,
    ).toBe(true);

    expect(
      GitLabArtifactSchema.safeParse({
        artifact_source: 'external_import',
        project_id: 'group/project-a',
        project_path: 'group/project-a',
        default_branch: 'main',
        artifact_type: 'branch',
        created_at: '2026-03-19T10:30:00.000Z',
      }).success,
    ).toBe(false);

    expect(
      GitLabArtifactSchema.safeParse({
        artifact_source: 'system_generated',
        project_id: 'group/project-a',
        project_path: 'group/project-a',
        default_branch: 'main',
        artifact_type: 'mr',
        mr_iid: 42,
        created_at: '2026-03-19T10:30:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('keeps writeback and recording contracts strict enough for downstream workflow use', () => {
    expect(
      JiraWritebackDraftSchema.safeParse({
        issue_key: 'BUG-123',
        target_type: 'comment',
        target_field_id_or_comment_mode: 'comment',
        target_ref: 'jira://BUG-123/comment',
        rendered_preview: 'Will link commit abcdef',
        request_payload: { body: 'payload' },
        request_payload_hash: 'sha256:payload',
        idempotency_key: 'jira:BUG-123:comment:abcdef',
        dedupe_scope: 'jira:BUG-123:comment',
        expected_target_version: null,
      }).success,
    ).toBe(true);

    expect(
      JiraWritebackResultSchema.safeParse({
        result_id: 'jira-write-1',
        target_ref: 'jira://BUG-123/comment/9001',
        target_version: '17',
        result_url: 'https://jira.example.com/browse/BUG-123?focusedCommentId=9001',
        already_applied: false,
        external_request_id: 'req-123',
        updated_at: '2026-03-19T10:30:00.000Z',
      }).success,
    ).toBe(true);

    expect(
      FeishuRecordDraftSchema.safeParse({
        space_id: 'space-1',
        doc_id: 'doc-1',
        block_id_or_anchor: 'bugfixes',
        template_id: 'tpl-1',
        template_version: 'v1',
        write_mode: 'append',
        rendered_preview: 'Bugfix record preview',
        request_payload: { blocks: [] },
        request_payload_hash: 'sha256:payload',
        idempotency_key: 'feishu:doc-1:BUG-123',
        dedupe_scope: 'feishu:space-1:doc-1:anchor:bugfixes:append',
        expected_target_version: null,
        target_ref: 'feishu://space-1/doc/doc-1/anchor/bugfixes',
      }).success,
    ).toBe(true);

    expect(
      FeishuRecordResultSchema.safeParse({
        result_id: 'feishu-write-1',
        target_ref: 'feishu://doc-1/block/bugfixes',
        target_version: '3',
        result_url: 'https://feishu.example.com/doc/doc-1',
        already_applied: false,
        external_request_id: 'req-feishu-1',
        updated_at: '2026-03-19T10:30:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('requires rollback target when an approval requests revise', () => {
    expect(
      ApprovalRecordSchema.safeParse({
        approval_id: 'approval-1',
        stage: 'Fix Planning',
        approval_status: 'revise_requested',
        decision: 'revise',
        decider: 'sunyi',
        comment_ref: 'artifact://approval-comments/1',
        preview_ref: 'artifact://previews/fix-plan-v2',
        preview_hash: 'sha256:preview',
        requested_at: '2026-03-19T10:30:00.000Z',
        decided_at: '2026-03-19T10:35:00.000Z',
      }).success,
    ).toBe(false);

    expect(
      ApprovalRecordSchema.safeParse({
        approval_id: 'approval-1',
        stage: 'Fix Planning',
        approval_status: 'revise_requested',
        decision: 'revise',
        decider: 'sunyi',
        comment_ref: 'artifact://approval-comments/1',
        preview_ref: 'artifact://previews/fix-plan-v2',
        preview_hash: 'sha256:preview',
        requested_at: '2026-03-19T10:30:00.000Z',
        decided_at: '2026-03-19T10:35:00.000Z',
        rollback_to_stage: 'Requirement Synthesis',
      }).success,
    ).toBe(true);
  });

  it('uses refs instead of embedding ledger history, checkpoints or raw error arrays in ExecutionContext', () => {
    const baseContext = {
      run_id: 'run-1',
      project_id: 'proj-a',
      config_version: '2026-03-19',
      run_mode: 'full',
      run_lifecycle_status: 'active',
      run_outcome_status: 'in_progress',
      current_stage: 'Code Localization',
      stage_status_map: {
        Intake: 'completed',
        'Context Resolution': 'completed',
        'Requirement Synthesis': 'completed',
        'Code Localization': 'in_progress',
        'Fix Planning': 'not_started',
        Execution: 'not_started',
        'Artifact Linking': 'not_started',
        'Knowledge Recording': 'not_started',
      },
      stage_artifact_refs: {
        'Requirement Synthesis': ['artifact://briefs/run-1-v1'],
      },
      active_approval_ref_map: {
        'Requirement Synthesis': 'approval://run-1/brief-approval',
      },
      waiting_reason: null,
      initiator: 'sunyi',
      started_at: '2026-03-19T10:30:00.000Z',
      updated_at: '2026-03-19T10:35:00.000Z',
      active_bug_issue_key: 'BUG-123',
      jira_issue_snapshot_ref: 'artifact://jira/issue-snapshot',
      requirement_refs: [
        {
          requirement_id: null,
          requirement_ref: null,
          requirement_binding_status: 'unresolved',
          binding_reason: 'No requirement mapping rule matched.',
        },
      ],
      repo_selection: {
        repo_path: '/workspace/project-a',
        module_candidates: ['billing-export'],
      },
      code_targets: [{ file_path: 'src/billing/export.ts', reason: 'Stack trace match' }],
      root_cause_hypotheses: ['Nil invoice caused export crash'],
      fix_plan: ['Guard the nil invoice branch'],
      verification_plan: ['Run export regression on failing tenant'],
      verification_results_ref: null,
      gitlab_artifacts: [],
      jira_subtask_ref: null,
      jira_subtask_result_ref: null,
      git_branch_binding_ref: null,
      git_commit_binding_refs: [],
      jira_writeback_draft_ref: null,
      jira_writeback_result_ref: null,
      feishu_record_draft_ref: null,
      feishu_record_result_ref: null,
      active_error_ref: null,
      sensitive_field_paths: ['jira.credential_ref'],
    };

    expect(ExecutionContextSchema.safeParse(baseContext).success).toBe(true);
    expect(baseContext.active_bug_issue_key).toBe('BUG-123');
    expect(baseContext.git_commit_binding_refs).toEqual([]);
    expect(
      ExecutionContextSchema.safeParse({
        ...baseContext,
        side_effect_ledger: [],
        checkpoints: [],
        errors: [],
      }).success,
    ).toBe(false);

    expect(EXECUTION_CONTEXT_STORAGE_PROJECTION.context).toContain('run_id');
    expect(EXECUTION_CONTEXT_STORAGE_PROJECTION.context).toContain(
      'active_bug_issue_key',
    );
    expect(EXECUTION_CONTEXT_STORAGE_PROJECTION.context).toContain(
      'jira_subtask_ref',
    );
    expect(EXECUTION_CONTEXT_STORAGE_PROJECTION.context).toContain(
      'jira_subtask_result_ref',
    );
    expect(EXECUTION_CONTEXT_STORAGE_PROJECTION.context).toContain(
      'git_branch_binding_ref',
    );
    expect(EXECUTION_CONTEXT_STORAGE_PROJECTION.context).toContain(
      'git_commit_binding_refs',
    );
    expect(EXECUTION_CONTEXT_STORAGE_PROJECTION.sideEffects).toContain('side-effects.ndjson');
    expect(EXECUTION_CONTEXT_STORAGE_PROJECTION.checkpoints).toContain('checkpoints/');
    expect(EXECUTION_CONTEXT_STORAGE_PROJECTION.artifacts).toContain('artifacts/');
    expect(EXECUTION_CONTEXT_STORAGE_PROJECTION.errors).toContain('artifacts/errors/');
    expect(V2_RUNTIME_FIELD_CARRIERS.active_bug_issue_key).toEqual({
      context: 'context.json',
      payload: 'bug_issue_key_only',
    });
    expect(V2_RUNTIME_FIELD_CARRIERS.jira_subtask_ref).toEqual({
      context: 'context.json',
      artifact: 'artifact://jira/subtasks/preview/<id>',
      payload: 'artifact_ref_only',
    });
    expect(V2_RUNTIME_FIELD_CARRIERS.jira_subtask_result_ref).toEqual({
      context: 'context.json',
      artifact: 'artifact://jira/subtasks/result/<id>',
      payload: 'artifact_ref_only',
    });
    expect(V2_RUNTIME_FIELD_CARRIERS.git_branch_binding_ref).toEqual({
      context: 'context.json',
      artifact: 'artifact://jira/bindings/branch/<id>',
      payload: 'artifact_ref_only',
    });
    expect(V2_RUNTIME_FIELD_CARRIERS.git_commit_binding_refs).toEqual({
      context: 'context.json',
      artifact: 'artifact://jira/bindings/commit/<id>',
      payload: 'artifact_ref_list_only',
    });
    expect(V2_RUNTIME_FIELD_CARRIERS.artifactBodies).toEqual({
      artifact: 'artifacts/',
      payload: 'preview_payloads_execute_results_human_readable_summaries',
    });
    expect(V2_RUNTIME_FIELD_CARRIERS.ledgerEntries).toEqual({
      ledger: 'side-effects.ndjson',
      payload:
        'idempotency_key_dedupe_scope_request_payload_hash_target_ref_expected_target_version_result_ref_status_attempt_no_already_applied_external_request_id_executed_at',
    });
  });

  it('enforces v2 artifact ref conventions for Jira subtask and Git binding refs', () => {
    const baseContext = {
      run_id: 'run-2',
      project_id: 'proj-a',
      config_version: '2026-03-19',
      run_mode: 'full',
      run_lifecycle_status: 'active',
      run_outcome_status: 'in_progress',
      current_stage: 'Artifact Linking',
      stage_status_map: {
        Intake: 'completed',
        'Context Resolution': 'completed',
        'Requirement Synthesis': 'completed',
        'Code Localization': 'completed',
        'Fix Planning': 'completed',
        Execution: 'completed',
        'Artifact Linking': 'in_progress',
        'Knowledge Recording': 'not_started',
      },
      stage_artifact_refs: {},
      active_approval_ref_map: {},
      waiting_reason: null,
      initiator: 'sunyi',
      started_at: '2026-03-19T10:30:00.000Z',
      updated_at: '2026-03-19T10:35:00.000Z',
      active_bug_issue_key: 'BUG-456',
      jira_issue_snapshot_ref: 'artifact://jira/issue-snapshot',
      requirement_refs: [],
      repo_selection: null,
      code_targets: [],
      root_cause_hypotheses: [],
      fix_plan: [],
      verification_plan: [],
      verification_results_ref: null,
      gitlab_artifacts: [],
      jira_subtask_ref: 'artifact://jira/subtasks/preview/BUG-456',
      jira_subtask_result_ref: 'artifact://jira/subtasks/result/BUG-456',
      git_branch_binding_ref: 'artifact://jira/bindings/branch/BUG-456',
      git_commit_binding_refs: [
        'artifact://jira/bindings/commit/BUG-456-1',
        'artifact://jira/bindings/commit/BUG-456-2',
      ],
      jira_writeback_draft_ref: null,
      jira_writeback_result_ref: null,
      feishu_record_draft_ref: null,
      feishu_record_result_ref: null,
      active_error_ref: null,
      sensitive_field_paths: [],
    };

    expect(ExecutionContextSchema.safeParse(baseContext).success).toBe(true);
    expect(
      ExecutionContextSchema.safeParse({
        ...baseContext,
        jira_subtask_ref: 'artifact://jira/subtasks/result/BUG-456',
      }).success,
    ).toBe(false);
    expect(
      ExecutionContextSchema.safeParse({
        ...baseContext,
        jira_subtask_result_ref: 'artifact://jira/subtasks/preview/BUG-456',
      }).success,
    ).toBe(false);
    expect(
      ExecutionContextSchema.safeParse({
        ...baseContext,
        git_branch_binding_ref: 'artifact://jira/bindings/commit/BUG-456',
      }).success,
    ).toBe(false);
    expect(
      ExecutionContextSchema.safeParse({
        ...baseContext,
        git_commit_binding_refs: ['artifact://jira/bindings/branch/BUG-456'],
      }).success,
    ).toBe(false);
  });

  it('defines the remaining core schemas expected by later workflow and storage tasks', () => {
    expect(
      BugfixReportSchema.safeParse({
        report_id: 'report-1',
        run_id: 'run-1',
        final_status: 'partial_success',
        issue_ref: 'jira://BUG-123',
        requirement_refs: ['req://PAY-100'],
        code_locations: ['src/billing/export.ts'],
        root_cause_summary: 'Nil invoice in export pipeline.',
        fix_summary: 'Added null guard and regression coverage.',
        verification_summary: 'Targeted regression passed.',
        artifacts: ['artifact://briefs/run-1-v1'],
        jira_writeback_summary: 'Comment prepared with GitLab commit link.',
        feishu_record_summary: 'Knowledge doc append preview generated.',
        external_outcomes: ['jira_preview_ready', 'feishu_preview_ready'],
        approval_history: ['approval://run-1/brief-approval'],
        open_risks: ['Need production tenant confirmation.'],
        failure_summary: null,
        generated_at: '2026-03-19T10:30:00.000Z',
        config_version: '2026-03-19',
      }).success,
    ).toBe(true);

    expect(
      SideEffectLedgerEntrySchema.safeParse({
        system: 'jira',
        operation: 'comment_write',
        idempotency_key: 'jira:BUG-123:comment:abcdef',
        dedupe_scope: 'issue-comment',
        request_payload_hash: 'sha256:payload',
        target_ref: 'jira://BUG-123/comment',
        expected_target_version: '17',
        result_ref: null,
        status: 'prepared',
        attempt_no: 1,
        already_applied: false,
        external_request_id: null,
        executed_at: '2026-03-19T10:30:00.000Z',
      }).success,
    ).toBe(true);

    expect(
      CheckpointRecordSchema.safeParse({
        checkpoint_id: 'checkpoint-1',
        run_id: 'run-1',
        sequence: 1,
        created_at: '2026-03-19T10:30:00.000Z',
        trigger_event: 'requirement-brief-generated',
        current_stage: 'Requirement Synthesis',
        run_lifecycle_status: 'waiting_approval',
        run_outcome_status: 'in_progress',
        stage_status_map: {
          Intake: 'completed',
          'Context Resolution': 'completed',
          'Requirement Synthesis': 'waiting_approval',
          'Code Localization': 'not_started',
          'Fix Planning': 'not_started',
          Execution: 'not_started',
          'Artifact Linking': 'not_started',
          'Knowledge Recording': 'not_started',
        },
        active_artifact_refs: ['artifact://briefs/run-1-v1'],
        active_approval_refs: ['approval://run-1/brief-approval'],
        active_error_ref: null,
        latest_side_effect_ref: null,
        parent_checkpoint_id: null,
        context_hash: 'sha256:context',
      }).success,
    ).toBe(true);
  });

  it('freezes the v2 Jira side-effect operation names and minimal ledger entry contract', () => {
    expect(JIRA_V2_SIDE_EFFECT_OPERATIONS).toEqual([
      'jira.create_subtask',
      'jira.bind_branch',
      'jira.bind_commit',
    ]);

    expect(
      JiraV2SideEffectLedgerEntrySchema.safeParse({
        system: 'jira',
        operation: 'jira.create_subtask',
        idempotency_key: 'jira:create_subtask:BUG-456',
        dedupe_scope: 'jira:BUG-456:subtask',
        request_payload_hash: 'sha256:payload',
        target_ref: 'jira://BUG-456/subtasks',
        expected_target_version: null,
        result_ref: null,
        status: 'prepared',
        attempt_no: 1,
        already_applied: false,
        external_request_id: null,
        executed_at: '2026-03-19T10:30:00.000Z',
      }).success,
    ).toBe(true);

    expect(
      JiraV2SideEffectLedgerEntrySchema.safeParse({
        system: 'jira',
        operation: 'jira.bind_branch',
        idempotency_key: 'jira:bind_branch:BUG-456:bugfix/BUG-456',
        dedupe_scope: 'jira:BUG-456:branch:bugfix/BUG-456',
        request_payload_hash: 'sha256:payload',
        target_ref: 'jira://BUG-456/development/branch',
        expected_target_version: null,
        result_ref: 'artifact://jira/bindings/branch/BUG-456',
        status: 'succeeded',
        attempt_no: 1,
        already_applied: false,
        external_request_id: 'req-1',
        executed_at: '2026-03-19T10:31:00.000Z',
      }).success,
    ).toBe(true);

    expect(
      JiraV2SideEffectLedgerEntrySchema.safeParse({
        system: 'jira',
        operation: 'bind_branch',
        idempotency_key: 'jira:bind_branch:BUG-456:bugfix/BUG-456',
        dedupe_scope: 'jira:BUG-456:branch:bugfix/BUG-456',
        request_payload_hash: 'sha256:payload',
        target_ref: 'jira://BUG-456/development/branch',
        expected_target_version: null,
        result_ref: 'artifact://jira/bindings/branch/BUG-456',
        status: 'succeeded',
        attempt_no: 1,
        already_applied: false,
        external_request_id: 'req-1',
        executed_at: '2026-03-19T10:31:00.000Z',
      }).success,
    ).toBe(false);

    expect(
      JiraV2SideEffectLedgerEntrySchema.safeParse({
        system: 'jira',
        operation: 'jira.bind_commit',
        idempotency_key: 'jira:bind_commit:BUG-456:abc123',
        dedupe_scope: 'jira:BUG-456:commit:abc123',
        request_payload_hash: 'sha256:payload',
        target_ref: 'jira://BUG-456/development/commit',
        expected_target_version: null,
        result_ref: 'artifact://jira/bindings/branch/BUG-456',
        status: 'succeeded',
        attempt_no: 1,
        already_applied: false,
        external_request_id: 'req-2',
        executed_at: '2026-03-19T10:32:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('defines a reviewable fix planning contract with execution handoff fields', () => {
    expect(
      FixPlanningDataSchema.safeParse({
        fix_summary:
          'Guard the coupon stacking branch in the payments validator before manual repair is executed.',
        impact_scope: [
          'payments module coupon validation flow',
          'src/payments/coupon-validator.ts',
        ],
        verification_plan: [
          'Re-run the coupon stacking regression for BUG-123 after the manual fix is applied.',
          'Capture the verification evidence reference for the final run report.',
        ],
        open_risks: ['Requirement acceptance criteria is still waiting for product confirmation.'],
        pending_external_inputs: [
          'Provide the final GitLab artifact reference after the manual fix is applied.',
          'Record the final verification evidence after the manual fix is applied.',
        ],
        referenced_code_targets: [
          {
            file_path: 'src/payments/coupon-validator.ts',
            reason: 'Matched coupon combination terms in module payments',
          },
        ],
        referenced_root_cause_hypotheses: [
          'The payments coupon validator likely rejects valid loyalty and campaign combinations.',
        ],
      }).success,
    ).toBe(true);

    expect(
      FixPlanningStageResultSchema.safeParse({
        status: 'completed',
        summary: 'Prepared an approval-ready fix plan for BUG-123.',
        data: {
          fix_summary:
            'Guard the coupon stacking branch in the payments validator before manual repair is executed.',
          impact_scope: ['payments module coupon validation flow'],
          verification_plan: [
            'Re-run the coupon stacking regression for BUG-123 after the manual fix is applied.',
          ],
          open_risks: [],
          pending_external_inputs: [
            'Provide the final GitLab artifact reference after the manual fix is applied.',
          ],
          referenced_code_targets: [
            {
              file_path: 'src/payments/coupon-validator.ts',
              reason: 'Matched coupon combination terms in module payments',
            },
          ],
          referenced_root_cause_hypotheses: [
            'The payments coupon validator likely rejects valid loyalty and campaign combinations.',
          ],
        },
        warnings: [],
        errors: [],
        waiting_for: null,
        source_refs: ['jira:BUG-123', 'brief:BUG-123', 'code-localization:BUG-123'],
        generated_at: '2026-03-19T10:30:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('defines normalized verification recording contracts for Execution handoff', () => {
    expect(
      VerificationResultSchema.safeParse({
        outcome: 'passed',
        verification_summary:
          'Verification passed with 2/2 successful checks. Primary evidence: coupon regression.',
        checks: [
          {
            name: 'coupon regression',
            status: 'passed',
          },
          {
            name: 'manual smoke test',
            status: 'passed',
          },
        ],
        input_source: 'manual_cli',
        recorded_at: '2026-03-19T10:30:00.000Z',
      }).success,
    ).toBe(true);

    expect(
      VerificationRecordingStageResultSchema.safeParse({
        status: 'completed',
        summary: 'Recorded passed verification evidence for BUG-123.',
        data: {
          outcome: 'failed',
          verification_summary:
            'Verification failed with 1 failing check. Primary failure: coupon regression.',
          checks: [
            {
              name: 'coupon regression',
              status: 'failed',
            },
          ],
          input_source: 'test_report',
          recorded_at: '2026-03-19T10:30:00.000Z',
        },
        warnings: [],
        errors: [],
        waiting_for: null,
        source_refs: ['artifact://verification/junit.xml'],
        generated_at: '2026-03-19T10:30:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('freezes structured error categories and retry guidance for downstream layers', () => {
    expect(ERROR_CATEGORIES).toEqual([
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
    ]);

    expect(ERROR_CATEGORY_POLICIES.writeback_outcome_unknown).toEqual({
      defaultRetryable: false,
      supportsOutcomeUnknown: true,
    });

    expect(
      StructuredErrorSchema.safeParse({
        code: 'writeback_failed',
        category: 'writeback_failed',
        stage: 'Artifact Linking',
        system: 'jira',
        operation: 'execute-write',
        target_ref: 'jira://BUG-123/comment',
        message: 'Jira writeback failed because the target field is missing.',
        detail: 'The configured comment field no longer exists on the issue.',
        retryable: false,
        outcome_unknown: false,
        user_action: 'Fix the Jira target configuration and retry from the latest checkpoint.',
        raw_cause_ref: 'artifact://errors/raw/jira-writeback.json',
        partial_state_ref: 'checkpoint://run-1/3',
        timestamp: '2026-03-19T10:30:00.000Z',
      }).success,
    ).toBe(true);
  });
});
