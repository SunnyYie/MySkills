import { describe, expect, it } from 'vitest';

import type {
  ExecutionContext,
  JiraIssueSnapshot,
  ProjectProfile,
  SideEffectLedgerEntry,
} from '../../../src/domain/index.js';
import {
  buildFeishuRecordPreviewDraft,
  createFeishuAlreadyAppliedResult,
  createFeishuExecuteResult,
} from '../../../src/infrastructure/connectors/feishu/index.js';
import {
  buildFeishuRecordApprovalRecord,
  buildFeishuRecordPreparedEntry,
  createFeishuRecordPreviewState,
  finalizeFeishuRecordEntry,
  guardFeishuRecordRequirementBinding,
  markFeishuRecordEntryDispatched,
  shouldSkipFeishuRecordExecution,
} from '../../../src/workflow/index.js';

const TIMESTAMP = '2026-03-19T15:30:00.000Z';

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
    writeback_targets: ['comment'],
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
    credential_ref: 'secret://gitlab/proj-a',
  },
  feishu: {
    space_id: 'space-1',
    doc_id: 'doc-1',
    block_path_or_anchor: 'bugfixes',
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
    sensitive_field_paths: ['feishu.credential_ref'],
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
  ],
});

const createContext = (
  requirementBindingStatus: 'resolved' | 'unresolved' = 'resolved',
): ExecutionContext => ({
  run_id: 'run-013',
  project_id: 'proj-a',
  config_version: '2026-03-19',
  run_mode: 'full',
  run_lifecycle_status: 'active',
  run_outcome_status: 'in_progress',
  current_stage: 'Knowledge Recording',
  stage_status_map: {
    Intake: 'completed',
    'Context Resolution': 'completed',
    'Requirement Synthesis': 'completed',
    'Code Localization': 'completed',
    'Fix Planning': 'completed',
    Execution: 'completed',
    'Artifact Linking': 'completed',
    'Knowledge Recording': 'in_progress',
  },
  stage_artifact_refs: {
    Execution: ['artifact://verification/result-v1'],
  },
  active_approval_ref_map: {
    'Artifact Linking': 'approval://jira-preview/v1',
    'Knowledge Recording': 'approval://feishu-preview/v1',
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
  jira_writeback_result_ref: 'artifact://jira/result-v1',
  feishu_record_draft_ref: 'artifact://feishu/draft-v1',
  feishu_record_result_ref: null,
  active_error_ref: null,
  sensitive_field_paths: ['feishu.credential_ref'],
});

describe('feishu writeback workflow', () => {
  it('builds stable Feishu preview drafts with explicit target resolution and append markers', () => {
    const projectProfile = createProjectProfile();
    const issueSnapshot = createIssueSnapshot();
    const context = createContext();
    const draft = buildFeishuRecordPreviewDraft({
      projectProfile,
      issueSnapshot,
      requirementRefs: context.requirement_refs,
      gitlabArtifacts: context.gitlab_artifacts,
      verificationResultsRef: context.verification_results_ref,
      rootCauseHypotheses: context.root_cause_hypotheses,
      fixPlan: context.fix_plan,
      generatedAt: TIMESTAMP,
    });

    expect(draft.space_id).toBe('space-1');
    expect(draft.doc_id).toBe('doc-1');
    expect(draft.block_id_or_anchor).toBe('bugfixes');
    expect(draft.target_ref).toBe('feishu://space-1/doc/doc-1/anchor/bugfixes');
    expect(draft.dedupe_scope).toBe('feishu:space-1:doc-1:anchor:bugfixes:append');
    expect(draft.request_payload_hash).toMatch(/^sha256:/);
    expect(draft.rendered_preview).toContain('BUG-123');
    expect(draft.rendered_preview).toContain('artifact://verification/result-v1');
    expect(JSON.stringify(draft.request_payload)).toContain('bo-orchestrator');
  });

  it('blocks real write only when requirement binding is unresolved and the project marks it as required', () => {
    const issueSnapshot = createIssueSnapshot();

    expect(
      guardFeishuRecordRequirementBinding({
        projectProfile: createProjectProfile(true),
        context: createContext('resolved'),
        timestamp: TIMESTAMP,
      }),
    ).toBeNull();

    expect(
      guardFeishuRecordRequirementBinding({
        projectProfile: createProjectProfile(false),
        context: createContext('unresolved'),
        timestamp: TIMESTAMP,
      }),
    ).toBeNull();

    expect(
      buildFeishuRecordPreviewDraft({
        projectProfile: createProjectProfile(false),
        issueSnapshot,
        requirementRefs: createContext('unresolved').requirement_refs,
        gitlabArtifacts: createContext('unresolved').gitlab_artifacts,
        verificationResultsRef: createContext('unresolved').verification_results_ref,
        rootCauseHypotheses: createContext('unresolved').root_cause_hypotheses,
        fixPlan: createContext('unresolved').fix_plan,
        generatedAt: TIMESTAMP,
      }).rendered_preview,
    ).toContain('未绑定需求');

    expect(
      guardFeishuRecordRequirementBinding({
        projectProfile: createProjectProfile(true),
        context: createContext('unresolved'),
        timestamp: TIMESTAMP,
      }),
    ).toMatchObject({
      category: 'requirement_mapping_failed',
      stage: 'Knowledge Recording',
      system: 'workflow',
    });
  });

  it('refreshes preview state with a new hash and supersedes the previous approval binding', () => {
    const projectProfile = createProjectProfile();
    const issueSnapshot = createIssueSnapshot();
    const context = createContext();
    const first = createFeishuRecordPreviewState({
      context,
      draftRef: 'artifact://feishu/draft-v1',
      draft: buildFeishuRecordPreviewDraft({
        projectProfile,
        issueSnapshot,
        requirementRefs: context.requirement_refs,
        gitlabArtifacts: context.gitlab_artifacts,
        verificationResultsRef: context.verification_results_ref,
        rootCauseHypotheses: context.root_cause_hypotheses,
        fixPlan: context.fix_plan,
        generatedAt: TIMESTAMP,
      }),
      updatedAt: TIMESTAMP,
    });
    const refreshed = createFeishuRecordPreviewState({
      context: first.context,
      draftRef: 'artifact://feishu/draft-v2',
      draft: buildFeishuRecordPreviewDraft({
        projectProfile: {
          ...projectProfile,
          feishu: {
            ...projectProfile.feishu,
            block_path_or_anchor: 'bugfix-history',
          },
        },
        issueSnapshot,
        requirementRefs: context.requirement_refs,
        gitlabArtifacts: context.gitlab_artifacts,
        verificationResultsRef: context.verification_results_ref,
        rootCauseHypotheses: context.root_cause_hypotheses,
        fixPlan: context.fix_plan,
        generatedAt: '2026-03-19T16:00:00.000Z',
      }),
      updatedAt: '2026-03-19T16:00:00.000Z',
    });

    expect(first.supersededApprovalIds).toEqual(['approval://feishu-preview/v1']);
    expect(first.previewHash).not.toBe(refreshed.previewHash);
    expect(refreshed.context.feishu_record_draft_ref).toBe('artifact://feishu/draft-v2');
    expect(refreshed.context.active_approval_ref_map['Knowledge Recording']).toBeUndefined();
    expect(refreshed.supersededApprovalIds).toEqual([]);
  });

  it('binds Feishu approvals to a specific preview ref and hash', () => {
    expect(
      buildFeishuRecordApprovalRecord({
        approvalId: 'approval://feishu-preview/v2',
        decider: 'user:sunyi',
        previewRef: 'artifact://feishu/draft-v2',
        previewHash: 'sha256:feishu-preview-v2',
        requestedAt: TIMESTAMP,
        decidedAt: TIMESTAMP,
        commentRef: 'artifact://comments/approve-feishu',
      }),
    ).toMatchObject({
      stage: 'Knowledge Recording',
      approval_status: 'approved',
      preview_ref: 'artifact://feishu/draft-v2',
      preview_hash: 'sha256:feishu-preview-v2',
    });
  });

  it('records Feishu append side effects in the required ledger order and normalizes execute results', () => {
    const draft = buildFeishuRecordPreviewDraft({
      projectProfile: createProjectProfile(),
      issueSnapshot: createIssueSnapshot(),
      requirementRefs: createContext().requirement_refs,
      gitlabArtifacts: createContext().gitlab_artifacts,
      verificationResultsRef: createContext().verification_results_ref,
      rootCauseHypotheses: createContext().root_cause_hypotheses,
      fixPlan: createContext().fix_plan,
      generatedAt: TIMESTAMP,
    });

    const prepared = buildFeishuRecordPreparedEntry({
      draft,
      attemptNo: 1,
      executedAt: TIMESTAMP,
    });

    expect(prepared).toMatchObject({
      system: 'feishu',
      operation: 'append-block',
      status: 'prepared',
      target_ref: 'feishu://space-1/doc/doc-1/anchor/bugfixes',
    });

    const dispatched = markFeishuRecordEntryDispatched({
      entry: prepared,
      externalRequestId: 'req-feishu-1',
      executedAt: '2026-03-19T15:31:00.000Z',
    });
    const result = createFeishuExecuteResult({
      targetRef: draft.target_ref,
      targetVersion: '12',
      resultUrl: 'https://feishu.example.com/doc/doc-1',
      resultId: 'feishu-write-1',
      externalRequestId: 'req-feishu-1',
      updatedAt: '2026-03-19T15:32:00.000Z',
    });
    const finalized = finalizeFeishuRecordEntry({
      entry: dispatched,
      resultRef: 'artifact://feishu/result-v1',
      result,
      executedAt: '2026-03-19T15:32:00.000Z',
    });

    expect(dispatched.status).toBe('dispatched');
    expect(finalized).toMatchObject({
      status: 'succeeded',
      result_ref: 'artifact://feishu/result-v1',
      already_applied: false,
      external_request_id: 'req-feishu-1',
    });

    expect(
      createFeishuAlreadyAppliedResult({
        targetRef: draft.target_ref,
        targetVersion: '12',
        resultUrl: 'https://feishu.example.com/doc/doc-1',
        resultId: 'feishu-write-1',
        externalRequestId: 'req-feishu-1',
        updatedAt: '2026-03-19T15:32:00.000Z',
      }),
    ).toMatchObject({
      already_applied: true,
      external_request_id: 'req-feishu-1',
    });
  });

  it('skips Feishu execution for dry-run previews and already-applied append operations', () => {
    const latestEntry: SideEffectLedgerEntry = {
      system: 'feishu',
      operation: 'append-block',
      idempotency_key: 'feishu:space-1:doc-1:anchor:bugfixes:append',
      dedupe_scope: 'feishu:space-1:doc-1:anchor:bugfixes:append',
      request_payload_hash: 'sha256:payload',
      target_ref: 'feishu://space-1/doc/doc-1/anchor/bugfixes',
      expected_target_version: null,
      result_ref: 'artifact://feishu/result-v1',
      status: 'succeeded',
      attempt_no: 1,
      already_applied: true,
      external_request_id: 'req-feishu-1',
      executed_at: TIMESTAMP,
    };

    expect(
      shouldSkipFeishuRecordExecution({
        dryRun: true,
        latestEntry: null,
      }),
    ).toEqual({
      skip: true,
      reason: 'dry_run_preview_only',
    });

    expect(
      shouldSkipFeishuRecordExecution({
        dryRun: false,
        latestEntry,
      }),
    ).toEqual({
      skip: true,
      reason: 'terminal_side_effect_present',
    });

    expect(
      shouldSkipFeishuRecordExecution({
        dryRun: false,
        latestEntry: null,
      }),
    ).toEqual({
      skip: false,
      reason: null,
    });
  });
});
