import { describe, expect, it } from 'vitest';

import type {
  ApprovalRecord,
  ExecutionContext,
  JiraIssueSnapshot,
  ProjectProfile,
  SideEffectLedgerEntry,
} from '../../../src/domain/index.js';
import {
  buildJiraWritebackPreviewDraft,
  createJiraAlreadyAppliedResult,
  createJiraExecuteResult,
} from '../../../src/infrastructure/connectors/jira/index.js';
import {
  buildJiraWritebackApprovalRecord,
  buildJiraWritebackPreparedEntry,
  createJiraWritebackPreviewState,
  finalizeJiraWritebackEntry,
  guardJiraWritebackRequirementBinding,
  markJiraWritebackEntryDispatched,
  shouldSkipJiraWritebackExecution,
} from '../../../src/workflow/index.js';

const TIMESTAMP = '2026-03-19T15:10:00.000Z';

const createProjectProfile = (
  requirementBindingRequired = true,
): ProjectProfile => ({
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
        priority: 0,
        fallback_action: 'manual',
      },
    ],
    writeback_targets: ['comment', 'customfield_12345'],
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
    credential_ref: 'secret://jira/proj-a',
  },
  requirements: {
    source_type: 'feishu_doc',
    source_ref: 'feishu://space/doc',
  },
  gitlab: {
    base_url: 'https://gitlab.example.com',
    project_id: 'group/project-a',
    default_branch: 'main',
    branch_naming_rule: 'bugfix/{issue_key}',
    branch_binding: {
      input_mode: 'current_branch',
    },
    credential_ref: 'secret://gitlab/proj-a',
  },
  feishu: {
    space_id: 'space-1',
    doc_id: 'doc-1',
    block_path_or_anchor: 'bugfix',
    template_id: 'tpl-1',
    template_version: 'v1',
    credential_ref: 'secret://feishu/proj-a',
  },
  repo: {
    local_path: '/workspace/project-a',
    module_rules: [{ module_id: 'payments', path_pattern: 'src/payments' }],
  },
  approval_policy: {
    requirement_binding_required: requirementBindingRequired,
  },
  serialization_policy: {
    persist_dry_run_previews: true,
  },
  sensitivity_policy: {
    sensitive_field_paths: ['jira.credential_ref'],
    prohibited_plaintext_fields: ['authorization'],
  },
});

const createIssueSnapshot = (): JiraIssueSnapshot => ({
  issue_key: 'BUG-123',
  issue_id: '10001',
  issue_type_id: '10001',
  project_key: 'BUG',
  summary: 'Coupon stacking fails on valid carts',
  description: 'Users cannot apply a second valid coupon.',
  status_name: 'In Progress',
  labels: ['payments'],
  source_url: 'https://jira.example.com/browse/BUG-123',
  requirement_hints: [],
  writeback_targets: [
    {
      target_type: 'comment',
      target_field_id_or_comment_mode: 'comment',
    },
    {
      target_type: 'field',
      target_field_id_or_comment_mode: 'customfield_12345',
    },
  ],
});

const createContext = (
  requirementBindingStatus: 'resolved' | 'unresolved' = 'resolved',
): ExecutionContext => ({
  run_id: 'run-012',
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
  stage_artifact_refs: {
    Execution: ['artifact://verification/result-v1'],
  },
  active_approval_ref_map: {
    'Fix Planning': 'approval://fix-plan/current',
    'Artifact Linking': 'approval://jira-preview/v1',
  },
  waiting_reason: null,
  initiator: 'user:sunyi',
  started_at: TIMESTAMP,
  updated_at: TIMESTAMP,
  jira_issue_snapshot_ref: 'artifact://jira/BUG-123',
  requirement_refs: [
    requirementBindingStatus === 'resolved'
      ? {
          requirement_id: 'REQ-123',
          requirement_ref: 'req://REQ-123',
          requirement_binding_status: 'resolved',
          binding_reason: null,
        }
      : {
          requirement_id: null,
          requirement_ref: null,
          requirement_binding_status: 'unresolved',
          binding_reason: 'No matching requirement rule was found.',
        },
  ],
  repo_selection: {
    repo_path: '/workspace/project-a',
    module_candidates: ['payments'],
  },
  code_targets: [
    {
      file_path: 'src/payments/coupon-validator.ts',
      reason: 'Regression stack trace points here.',
    },
  ],
  root_cause_hypotheses: ['Missing secondary coupon state merge.'],
  fix_plan: ['Apply the coupon state merge fix manually.'],
  verification_plan: ['Run coupon stacking regression after manual repair.'],
  verification_results_ref: 'artifact://verification/result-v1',
  gitlab_artifacts: [
    {
      artifact_source: 'external_import',
      artifact_type: 'commit',
      project_id: 'group/project-a',
      project_path: 'group/project-a',
      default_branch: 'main',
      branch_name: 'bugfix/BUG-123',
      commit_sha: '0123456789abcdef0123456789abcdef01234567',
      commit_url:
        'https://gitlab.example.com/group/project-a/-/commit/0123456789abcdef0123456789abcdef01234567',
      created_at: TIMESTAMP,
    },
  ],
  jira_writeback_draft_ref: 'artifact://jira/draft-v1',
  jira_writeback_result_ref: null,
  feishu_record_draft_ref: null,
  feishu_record_result_ref: null,
  active_error_ref: null,
  sensitive_field_paths: ['jira.credential_ref'],
});

describe('jira writeback workflow', () => {
  it('builds stable Jira preview drafts whose execute input differs only by dynamic metadata', () => {
    const issueSnapshot = createIssueSnapshot();
    const context = createContext();
    const draft = buildJiraWritebackPreviewDraft({
      issueSnapshot,
      target: issueSnapshot.writeback_targets[0]!,
      gitlabArtifacts: context.gitlab_artifacts,
      verificationResultsRef: context.verification_results_ref,
      requirementRefs: context.requirement_refs,
      generatedAt: TIMESTAMP,
    });

    expect(draft.target_ref).toBe('jira://BUG-123/comment');
    expect(draft.dedupe_scope).toBe('jira:BUG-123:comment');
    expect(draft.request_payload_hash).toMatch(/^sha256:/);
    expect(draft.rendered_preview).toContain('BUG-123');
    expect(draft.rendered_preview).toContain('0123456789abcdef0123456789abcdef01234567');
    expect(JSON.stringify(draft.request_payload)).toContain('bo-orchestrator');
  });

  it('blocks execute only when requirement binding is unresolved and the project marks it as required', () => {
    expect(
      guardJiraWritebackRequirementBinding({
        projectProfile: createProjectProfile(true),
        context: createContext('resolved'),
        timestamp: TIMESTAMP,
      }),
    ).toBeNull();

    expect(
      guardJiraWritebackRequirementBinding({
        projectProfile: createProjectProfile(false),
        context: createContext('unresolved'),
        timestamp: TIMESTAMP,
      }),
    ).toBeNull();

    expect(
      guardJiraWritebackRequirementBinding({
        projectProfile: createProjectProfile(true),
        context: createContext('unresolved'),
        timestamp: TIMESTAMP,
      }),
    ).toMatchObject({
      category: 'requirement_mapping_failed',
      stage: 'Artifact Linking',
      system: 'workflow',
    });
  });

  it('refreshes preview state with a new hash and supersedes the previous approval binding', () => {
    const issueSnapshot = createIssueSnapshot();
    const context = createContext();
    const first = createJiraWritebackPreviewState({
      context,
      draftRef: 'artifact://jira/draft-v1',
      draft: buildJiraWritebackPreviewDraft({
        issueSnapshot,
        target: issueSnapshot.writeback_targets[0]!,
        gitlabArtifacts: context.gitlab_artifacts,
        verificationResultsRef: context.verification_results_ref,
        requirementRefs: context.requirement_refs,
        generatedAt: TIMESTAMP,
      }),
      updatedAt: TIMESTAMP,
    });
    const refreshed = createJiraWritebackPreviewState({
      context: first.context,
      draftRef: 'artifact://jira/draft-v2',
      draft: buildJiraWritebackPreviewDraft({
        issueSnapshot,
        target: issueSnapshot.writeback_targets[1]!,
        gitlabArtifacts: context.gitlab_artifacts,
        verificationResultsRef: context.verification_results_ref,
        requirementRefs: context.requirement_refs,
        generatedAt: '2026-03-19T15:11:00.000Z',
      }),
      updatedAt: '2026-03-19T15:11:00.000Z',
    });

    expect(first.supersededApprovalIds).toEqual(['approval://jira-preview/v1']);
    expect(first.previewHash).not.toBe(refreshed.previewHash);
    expect(refreshed.context.jira_writeback_draft_ref).toBe('artifact://jira/draft-v2');
    expect(refreshed.context.stage_artifact_refs['Artifact Linking']).toEqual([
      'artifact://jira/draft-v2',
    ]);
    expect(refreshed.supersededApprovalIds).toEqual([]);
  });

  it('binds approval records to the immutable preview ref and hash', () => {
    const approval = buildJiraWritebackApprovalRecord({
      approvalId: 'approval://jira-preview/v2',
      decider: 'user:sunyi',
      previewRef: 'artifact://jira/draft-v2',
      previewHash: 'sha256:preview-v2',
      requestedAt: TIMESTAMP,
      decidedAt: '2026-03-19T15:12:00.000Z',
      commentRef: null,
    });

    expect(approval).toMatchObject<Partial<ApprovalRecord>>({
      stage: 'Artifact Linking',
      decision: 'approve',
      approval_status: 'approved',
      preview_ref: 'artifact://jira/draft-v2',
      preview_hash: 'sha256:preview-v2',
    });
  });

  it('records Jira side effects in prepared -> dispatched -> terminal order and preserves dry-run boundaries', () => {
    const issueSnapshot = createIssueSnapshot();
    const draft = buildJiraWritebackPreviewDraft({
      issueSnapshot,
      target: issueSnapshot.writeback_targets[0]!,
      gitlabArtifacts: createContext().gitlab_artifacts,
      verificationResultsRef: 'artifact://verification/result-v1',
      requirementRefs: createContext().requirement_refs,
      generatedAt: TIMESTAMP,
    });

    const prepared = buildJiraWritebackPreparedEntry({
      draft,
      attemptNo: 1,
      executedAt: TIMESTAMP,
    });
    const dispatched = markJiraWritebackEntryDispatched({
      entry: prepared,
      externalRequestId: 'req-123',
      executedAt: '2026-03-19T15:11:00.000Z',
    });
    const succeeded = finalizeJiraWritebackEntry({
      entry: dispatched,
      resultRef: 'artifact://jira/result-v1',
      result: createJiraExecuteResult({
        resultId: 'jira-result-1',
        targetRef: draft.target_ref,
        targetVersion: '18',
        issueKey: issueSnapshot.issue_key,
        updatedAt: '2026-03-19T15:12:00.000Z',
        externalRequestId: 'req-123',
      }),
      executedAt: '2026-03-19T15:12:00.000Z',
    });
    const dryRun = shouldSkipJiraWritebackExecution({
      dryRun: true,
      latestEntry: null,
    });

    expect(prepared.status).toBe('prepared');
    expect(dispatched.status).toBe('dispatched');
    expect(succeeded.status).toBe('succeeded');
    expect(succeeded.result_ref).toBe('artifact://jira/result-v1');
    expect(dryRun).toEqual({
      skip: true,
      reason: 'dry_run_preview_only',
    });
  });

  it('treats already-applied or terminal Jira writes as non-repeatable executions', () => {
    const terminalEntry: SideEffectLedgerEntry = {
      system: 'jira',
      operation: 'write-comment',
      idempotency_key: 'jira:BUG-123:comment:marker',
      dedupe_scope: 'jira:BUG-123:comment',
      request_payload_hash: 'sha256:payload',
      target_ref: 'jira://BUG-123/comment',
      expected_target_version: null,
      result_ref: 'artifact://jira/result-v1',
      status: 'succeeded',
      attempt_no: 1,
      already_applied: false,
      external_request_id: 'req-123',
      executed_at: TIMESTAMP,
    };
    const alreadyApplied = createJiraAlreadyAppliedResult({
      issueKey: 'BUG-123',
      targetRef: 'jira://BUG-123/comment',
      marker: 'bo-orchestrator:run-012',
      externalRequestId: 'req-456',
      updatedAt: '2026-03-19T15:12:30.000Z',
    });

    expect(
      shouldSkipJiraWritebackExecution({
        dryRun: false,
        latestEntry: terminalEntry,
      }),
    ).toEqual({
      skip: true,
      reason: 'terminal_side_effect_present',
    });
    expect(alreadyApplied.already_applied).toBe(true);
  });
});
