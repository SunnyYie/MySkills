import { describe, expect, it } from 'vitest';

import type {
  ApprovalRecord,
  ExecutionContext,
  JiraIssueSnapshot,
  ProjectProfile,
  SideEffectLedgerEntry,
} from '../../../src/domain/index.js';
import {
  buildJiraBranchBindingPreviewDraft,
  buildJiraCommitBindingPreviewDraft,
  buildJiraWritebackPreviewDraft,
  buildJiraSubtaskPreviewDraft,
  createJiraBranchBindingExecuteResult,
  createJiraAlreadyAppliedResult,
  createJiraCommitBindingExecuteResult,
  createJiraExecuteResult,
  createJiraSubtaskAlreadyAppliedResult,
  createJiraSubtaskExecuteResult,
} from '../../../src/infrastructure/connectors/jira/index.js';
import {
  buildJiraWritebackApprovalRecord,
  buildJiraV2PreparedEntry,
  buildJiraWritebackPreparedEntry,
  createJiraWritebackPreviewState,
  finalizeJiraV2Entry,
  finalizeJiraWritebackEntry,
  markJiraV2EntryDispatched,
  guardJiraWritebackRequirementBinding,
  markJiraWritebackEntryDispatched,
  planJiraV2Execution,
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
  active_bug_issue_key: 'BUG-123',
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
  jira_subtask_ref: null,
  jira_subtask_result_ref: null,
  git_branch_binding_ref: null,
  git_commit_binding_refs: [],
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

  it('builds Jira subtask preview drafts from the project profile template and a stable dedupe query', () => {
    const issueSnapshot = createIssueSnapshot();
    const draft = buildJiraSubtaskPreviewDraft({
      projectProfile: createProjectProfile(),
      issueSnapshot,
      generatedAt: TIMESTAMP,
    });

    expect(draft.operation).toBe('jira.create_subtask');
    expect(draft.parent_issue_key).toBe('BUG-123');
    expect(draft.target_ref).toBe('jira://BUG-123/subtasks');
    expect(draft.rendered_summary).toBe(
      '[BUG-123] Coupon stacking fails on valid carts',
    );
    expect(draft.request_payload).toMatchObject({
      fields: {
        project: { key: 'BUG' },
        parent: { key: 'BUG-123' },
        issuetype: { id: '10002' },
        summary: '[BUG-123] Coupon stacking fails on valid carts',
      },
    });
    expect(draft.dedupe_query).toEqual({
      parent_issue_key: 'BUG-123',
      issue_type_id: '10002',
      summary: '[BUG-123] Coupon stacking fails on valid carts',
    });
    expect(draft.dedupe_scope).toBe('jira:BUG-123:subtask');
    expect(draft.request_payload_hash).toMatch(/^sha256:/);
    expect(draft.idempotency_key).toMatch(/^jira:BUG-123:subtask:/);
  });

  it('creates Jira subtask execute results for both newly created and deduped subtasks', () => {
    const created = createJiraSubtaskExecuteResult({
      resultId: 'jira-subtask-result-1',
      parentIssueKey: 'BUG-123',
      subtaskIssueKey: 'BUG-456',
      subtaskIssueId: '10046',
      targetVersion: '19',
      updatedAt: '2026-03-20T08:01:00.000Z',
      externalRequestId: 'req-subtask-1',
    });
    const deduped = createJiraSubtaskAlreadyAppliedResult({
      parentIssueKey: 'BUG-123',
      subtaskIssueKey: 'BUG-456',
      dedupeKey: 'BUG-123:[BUG-123] Coupon stacking fails on valid carts',
      externalRequestId: 'req-subtask-2',
      updatedAt: '2026-03-20T08:02:00.000Z',
    });

    expect(created).toMatchObject({
      result_id: 'jira-subtask-result-1',
      target_ref: 'jira://BUG-123/subtasks',
      target_version: '19',
      result_url: 'https://jira.example.com/browse/BUG-456',
      already_applied: false,
      external_request_id: 'req-subtask-1',
      created_issue_key: 'BUG-456',
      created_issue_id: '10046',
    });
    expect(deduped).toMatchObject({
      target_ref: 'jira://BUG-123/subtasks',
      result_url: 'https://jira.example.com/browse/BUG-456',
      already_applied: true,
      external_request_id: 'req-subtask-2',
      created_issue_key: 'BUG-456',
      created_issue_id: null,
    });
  });

  it('resolves branch binding targets to subtask first and falls back to the bug when the profile allows it', () => {
    const preview = buildJiraBranchBindingPreviewDraft({
      projectProfile: createProjectProfile(),
      issueSnapshot: createIssueSnapshot(),
      branchName: 'bugfix/BUG-123',
      subtaskIssueKey: 'BUG-456',
      generatedAt: TIMESTAMP,
    });
    const fallbackPreview = buildJiraBranchBindingPreviewDraft({
      projectProfile: createProjectProfile(),
      issueSnapshot: createIssueSnapshot(),
      branchName: 'bugfix/BUG-123',
      generatedAt: TIMESTAMP,
    });
    const result = createJiraBranchBindingExecuteResult({
      targetIssueKey: 'BUG-456',
      targetIssueSource: 'subtask',
      branchName: 'bugfix/BUG-123',
      targetVersion: '22',
      updatedAt: '2026-03-20T08:03:00.000Z',
      externalRequestId: 'req-branch-1',
    });

    expect(preview).toMatchObject({
      operation: 'jira.bind_branch',
      target_issue_key: 'BUG-456',
      target_issue_source: 'subtask',
      target_ref: 'jira://BUG-456/development/branch',
      binding_value: 'bugfix/BUG-123',
      dedupe_scope: 'jira:BUG-456:branch:bugfix/BUG-123',
    });
    expect(fallbackPreview).toMatchObject({
      target_issue_key: 'BUG-123',
      target_issue_source: 'bug',
      target_ref: 'jira://BUG-123/development/branch',
    });
    expect(result).toMatchObject({
      target_ref: 'jira://BUG-456/development/branch',
      result_url: 'https://jira.example.com/browse/BUG-456',
      linked_value: 'bugfix/BUG-123',
      target_issue_key: 'BUG-456',
      target_issue_source: 'subtask',
      already_applied: false,
    });
  });

  it('requires an explicit subtask target for commit binding when the profile does not allow fallback', () => {
    expect(() =>
      buildJiraCommitBindingPreviewDraft({
        projectProfile: createProjectProfile(),
        issueSnapshot: createIssueSnapshot(),
        commitSha: 'abcdef0123456789abcdef0123456789abcdef01',
        generatedAt: TIMESTAMP,
      }),
    ).toThrow(/subtask/i);

    const preview = buildJiraCommitBindingPreviewDraft({
      projectProfile: createProjectProfile(),
      issueSnapshot: createIssueSnapshot(),
      commitSha: 'abcdef0123456789abcdef0123456789abcdef01',
      subtaskIssueKey: 'BUG-456',
      generatedAt: TIMESTAMP,
    });
    const result = createJiraCommitBindingExecuteResult({
      targetIssueKey: 'BUG-456',
      targetIssueSource: 'subtask',
      commitSha: 'abcdef0123456789abcdef0123456789abcdef01',
      targetVersion: '23',
      updatedAt: '2026-03-20T08:04:00.000Z',
      externalRequestId: 'req-commit-1',
    });

    expect(preview).toMatchObject({
      operation: 'jira.bind_commit',
      target_issue_key: 'BUG-456',
      target_issue_source: 'subtask',
      target_ref: 'jira://BUG-456/development/commit',
      binding_value: 'abcdef0123456789abcdef0123456789abcdef01',
      dedupe_scope:
        'jira:BUG-456:commit:abcdef0123456789abcdef0123456789abcdef01',
    });
    expect(result).toMatchObject({
      target_ref: 'jira://BUG-456/development/commit',
      result_url: 'https://jira.example.com/browse/BUG-456',
      linked_value: 'abcdef0123456789abcdef0123456789abcdef01',
      target_issue_key: 'BUG-456',
      target_issue_source: 'subtask',
      already_applied: false,
    });
  });

  it('records v2 Jira side effects in prepared -> dispatched -> terminal order with operation-specific result refs', () => {
    const subtaskDraft = buildJiraSubtaskPreviewDraft({
      projectProfile: createProjectProfile(),
      issueSnapshot: createIssueSnapshot(),
      generatedAt: TIMESTAMP,
    });
    const subtaskPrepared = buildJiraV2PreparedEntry({
      draft: subtaskDraft,
      attemptNo: 1,
      executedAt: TIMESTAMP,
    });
    const subtaskDispatched = markJiraV2EntryDispatched({
      entry: subtaskPrepared,
      externalRequestId: 'req-v2-subtask-1',
      executedAt: '2026-03-20T08:05:00.000Z',
    });
    const subtaskSucceeded = finalizeJiraV2Entry({
      entry: subtaskDispatched,
      resultRef: 'artifact://jira/subtasks/result/run-012-1',
      result: createJiraSubtaskExecuteResult({
        resultId: 'jira-subtask-result-1',
        parentIssueKey: 'BUG-123',
        subtaskIssueKey: 'BUG-456',
        subtaskIssueId: '10046',
        targetVersion: '24',
        updatedAt: '2026-03-20T08:06:00.000Z',
        externalRequestId: 'req-v2-subtask-1',
      }),
      executedAt: '2026-03-20T08:06:00.000Z',
    });
    const branchPrepared = buildJiraV2PreparedEntry({
      draft: buildJiraBranchBindingPreviewDraft({
        projectProfile: createProjectProfile(),
        issueSnapshot: createIssueSnapshot(),
        branchName: 'bugfix/BUG-123',
        subtaskIssueKey: 'BUG-456',
        generatedAt: TIMESTAMP,
      }),
      attemptNo: 1,
      executedAt: TIMESTAMP,
    });
    const branchSucceeded = finalizeJiraV2Entry({
      entry: markJiraV2EntryDispatched({
        entry: branchPrepared,
        externalRequestId: 'req-v2-branch-1',
        executedAt: '2026-03-20T08:07:00.000Z',
      }),
      resultRef: 'artifact://jira/bindings/branch/run-012-branch',
      result: createJiraBranchBindingExecuteResult({
        targetIssueKey: 'BUG-456',
        targetIssueSource: 'subtask',
        branchName: 'bugfix/BUG-123',
        targetVersion: '25',
        updatedAt: '2026-03-20T08:08:00.000Z',
        externalRequestId: 'req-v2-branch-1',
      }),
      executedAt: '2026-03-20T08:08:00.000Z',
    });
    const commitPrepared = buildJiraV2PreparedEntry({
      draft: buildJiraCommitBindingPreviewDraft({
        projectProfile: createProjectProfile(),
        issueSnapshot: createIssueSnapshot(),
        commitSha: 'abcdef0123456789abcdef0123456789abcdef01',
        subtaskIssueKey: 'BUG-456',
        generatedAt: TIMESTAMP,
      }),
      attemptNo: 2,
      executedAt: TIMESTAMP,
    });
    const commitOutcomeUnknown = finalizeJiraV2Entry({
      entry: markJiraV2EntryDispatched({
        entry: commitPrepared,
        externalRequestId: 'req-v2-commit-1',
        executedAt: '2026-03-20T08:09:00.000Z',
      }),
      resultRef: 'artifact://jira/bindings/commit/run-012-commit',
      result: createJiraCommitBindingExecuteResult({
        targetIssueKey: 'BUG-456',
        targetIssueSource: 'subtask',
        commitSha: 'abcdef0123456789abcdef0123456789abcdef01',
        targetVersion: '26',
        updatedAt: '2026-03-20T08:10:00.000Z',
        externalRequestId: 'req-v2-commit-1',
      }),
      executedAt: '2026-03-20T08:10:00.000Z',
      status: 'outcome_unknown',
    });

    expect(subtaskPrepared).toMatchObject({
      operation: 'jira.create_subtask',
      status: 'prepared',
      result_ref: null,
    });
    expect(subtaskDispatched).toMatchObject({
      operation: 'jira.create_subtask',
      status: 'dispatched',
      external_request_id: 'req-v2-subtask-1',
    });
    expect(subtaskSucceeded).toMatchObject({
      operation: 'jira.create_subtask',
      status: 'succeeded',
      result_ref: 'artifact://jira/subtasks/result/run-012-1',
    });
    expect(branchSucceeded).toMatchObject({
      operation: 'jira.bind_branch',
      status: 'succeeded',
      result_ref: 'artifact://jira/bindings/branch/run-012-branch',
    });
    expect(commitOutcomeUnknown).toMatchObject({
      operation: 'jira.bind_commit',
      status: 'outcome_unknown',
      result_ref: 'artifact://jira/bindings/commit/run-012-commit',
      attempt_no: 2,
    });
  });

  it('shares one payload baseline between dry-run and execute, and requires reconcile before retrying unfinished v2 writes', () => {
    const draft = buildJiraBranchBindingPreviewDraft({
      projectProfile: createProjectProfile(),
      issueSnapshot: createIssueSnapshot(),
      branchName: 'bugfix/BUG-123',
      subtaskIssueKey: 'BUG-456',
      generatedAt: TIMESTAMP,
    });
    const prepared = buildJiraV2PreparedEntry({
      draft,
      attemptNo: 1,
      executedAt: TIMESTAMP,
    });
    const dispatched = markJiraV2EntryDispatched({
      entry: prepared,
      externalRequestId: 'req-v2-branch-2',
      executedAt: '2026-03-20T08:11:00.000Z',
    });
    const outcomeUnknown = finalizeJiraV2Entry({
      entry: dispatched,
      resultRef: 'artifact://jira/bindings/branch/run-012-branch-2',
      result: createJiraBranchBindingExecuteResult({
        targetIssueKey: 'BUG-456',
        targetIssueSource: 'subtask',
        branchName: 'bugfix/BUG-123',
        targetVersion: '27',
        updatedAt: '2026-03-20T08:12:00.000Z',
        externalRequestId: 'req-v2-branch-2',
      }),
      executedAt: '2026-03-20T08:12:00.000Z',
      status: 'outcome_unknown',
    });

    const dryRunPlan = planJiraV2Execution({
      draft,
      dryRun: true,
      latestEntry: null,
    });
    const executePlan = planJiraV2Execution({
      draft,
      dryRun: false,
      latestEntry: null,
    });
    const preparedRecovery = planJiraV2Execution({
      draft,
      dryRun: false,
      latestEntry: prepared,
    });
    const dispatchedRecovery = planJiraV2Execution({
      draft,
      dryRun: false,
      latestEntry: dispatched,
    });
    const outcomeUnknownRecovery = planJiraV2Execution({
      draft,
      dryRun: false,
      latestEntry: outcomeUnknown,
    });

    expect(dryRunPlan).toMatchObject({
      action: 'preview_only',
      requestPayload: draft.request_payload,
      requestPayloadHash: draft.request_payload_hash,
    });
    expect(executePlan).toMatchObject({
      action: 'execute',
      requestPayload: draft.request_payload,
      requestPayloadHash: draft.request_payload_hash,
    });
    expect(preparedRecovery).toMatchObject({
      action: 'reconcile_before_retry',
      reason: 'prepared_side_effect_present',
    });
    expect(dispatchedRecovery).toMatchObject({
      action: 'reconcile_before_retry',
      reason: 'dispatched_side_effect_present',
    });
    expect(outcomeUnknownRecovery).toMatchObject({
      action: 'reconcile_before_retry',
      reason: 'write_outcome_unknown',
    });
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
