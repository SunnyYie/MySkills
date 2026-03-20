import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from '../../../src/domain/index.js';

import { applyApprovalGateDecision } from '../../../src/skills/approval-gate/index.js';
import { renderArtifactDocument } from '../../../src/skills/artifact-renderer/index.js';
import { routeConnectorForStage } from '../../../src/skills/connector-router/index.js';
import {
  executeFeishuRecord,
  prepareFeishuRecord,
} from '../../../src/skills/feishu-recorder/index.js';

const createProjectProfile = () => ({
  project_id: 'proj-a',
  project_name: 'Project A',
  config_version: '2026-03-19',
  jira: {
    base_url: 'https://jira.example.com',
    project_key: 'BUG',
    issue_type_ids: ['10001'],
    requirement_link_rules: [
      {
        source_type: 'issue_link' as const,
        priority: 1,
        fallback_action: 'manual' as const,
      },
    ],
    writeback_targets: ['comment'],
    subtask: {
      issue_type_id: '10002',
      summary_template: '[{issue_key}] {summary}',
    },
    branch_binding: {
      target_issue_source: 'subtask' as const,
      fallback_to_bug: true,
    },
    commit_binding: {
      target_issue_source: 'subtask' as const,
      fallback_to_bug: true,
    },
    credential_ref: 'cred:jira/project-a',
  },
  requirements: {
    source_type: 'feishu_doc' as const,
    source_ref: 'doc://feishu/project-a',
  },
  gitlab: {
    base_url: 'https://gitlab.example.com',
    project_id: 'group/project-a',
    default_branch: 'main',
    branch_naming_rule: 'bugfix/{issue_key}',
    branch_binding: {
      input_mode: 'current_branch' as const,
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
    requirement_binding_required: true,
  },
  serialization_policy: {
    persist_dry_run_previews: true,
  },
  sensitivity_policy: {
    sensitive_field_paths: ['jira.credential_ref'],
    prohibited_plaintext_fields: ['token'],
  },
});

const createIssueSnapshot = () => ({
  issue_key: 'BUG-123',
  issue_id: '1001',
  issue_type_id: '10001',
  project_key: 'BUG',
  summary: 'Stacked discounts compute the wrong total.',
  description: 'Totals jump when coupon and member discounts are combined.',
  status_name: 'In Progress',
  labels: ['bug'],
  source_url: 'https://jira.example.com/browse/BUG-123',
  requirement_hints: [
    {
      source_type: 'issue_link' as const,
      values: ['REQ-100'],
      source_field: 'jira.issue_link',
    },
  ],
  writeback_targets: [
    {
      target_type: 'comment' as const,
      target_field_id_or_comment_mode: 'comment',
    },
  ],
});

const createExecutionContext = (): ExecutionContext => ({
  run_id: 'run-123',
  project_id: 'proj-a',
  config_version: '2026-03-19',
  run_mode: 'full' as const,
  run_lifecycle_status: 'waiting_approval' as const,
  run_outcome_status: 'in_progress' as const,
  current_stage: 'Fix Planning' as const,
  stage_status_map: {
    Intake: 'completed',
    'Context Resolution': 'completed',
    'Requirement Synthesis': 'completed',
    'Code Localization': 'completed',
    'Fix Planning': 'waiting_approval',
    Execution: 'not_started',
    'Artifact Linking': 'not_started',
    'Knowledge Recording': 'not_started',
  },
  stage_artifact_refs: {
    Intake: ['artifact://run-123/intake.json'],
    'Context Resolution': ['artifact://run-123/context.json'],
    'Requirement Synthesis': ['artifact://run-123/brief.json'],
    'Code Localization': ['artifact://run-123/code.json'],
    'Fix Planning': ['artifact://run-123/plan.json'],
  },
  active_approval_ref_map: {
    'Fix Planning': 'approval://run-123/fix-planning',
  },
  waiting_reason: null,
  initiator: 'cli:operator',
  started_at: '2026-03-20T10:00:00.000Z',
  updated_at: '2026-03-20T10:10:00.000Z',
  active_bug_issue_key: 'BUG-123',
  jira_issue_snapshot_ref: 'artifact://jira/issues/BUG-123',
  requirement_refs: [
    {
      requirement_id: 'REQ-100',
      requirement_ref: 'REQ-100',
      requirement_binding_status: 'resolved' as const,
      binding_reason: 'Linked from Jira issue link.',
    },
  ],
  repo_selection: {
    repo_path: '/workspace/project-a',
    module_candidates: ['api'],
  },
  code_targets: [
    {
      file_path: 'src/api/cart.ts',
      reason: 'Handles the discount stacking path.',
    },
  ],
  root_cause_hypotheses: ['Discount aggregation applies the coupon twice.'],
  fix_plan: ['Normalize discount precedence before summing totals.'],
  verification_plan: ['Run stacked discount regression coverage.'],
  verification_results_ref: 'artifact://verification/result-v1',
  gitlab_artifacts: [
    {
      artifact_source: 'external_import' as const,
      artifact_type: 'commit' as const,
      project_id: 'group/project-a',
      project_path: 'group/project-a',
      default_branch: 'main',
      commit_sha: 'abcdef0123456789abcdef0123456789abcdef01',
      commit_url:
        'https://gitlab.example.com/group/project-a/-/commit/abcdef0123456789abcdef0123456789abcdef01',
      created_at: '2026-03-20T10:09:00.000Z',
    },
  ],
  jira_subtask_ref: null,
  jira_subtask_result_ref: null,
  git_branch_binding_ref: null,
  git_commit_binding_refs: [],
  jira_writeback_draft_ref: 'artifact://run-123/jira-writeback-preview.json',
  jira_writeback_result_ref: 'artifact://run-123/jira-writeback-result.json',
  feishu_record_draft_ref: null,
  feishu_record_result_ref: null,
  active_error_ref: null,
  sensitive_field_paths: ['jira.credential_ref'],
});

describe('task 11 missing skill contracts', () => {
  it('routes write stages to the expected connector systems', () => {
    expect(routeConnectorForStage({ stage: 'Artifact Linking' })).toEqual({
      stage: 'Artifact Linking',
      system: 'jira',
      skill: 'connector-router',
    });
    expect(routeConnectorForStage({ stage: 'Knowledge Recording' })).toEqual({
      stage: 'Knowledge Recording',
      system: 'feishu',
      skill: 'connector-router',
    });
  });

  it('renders requirement briefs and bugfix reports through one named artifact renderer skill', () => {
    const requirementBrief = {
      issue_key: 'BUG-123',
      project_id: 'proj-a',
      linked_requirement: {
        requirement_id: 'REQ-100',
        requirement_ref: 'REQ-100',
        requirement_binding_status: 'resolved' as const,
        binding_reason: 'Linked from Jira issue link.',
      },
      requirement_binding_status: 'resolved' as const,
      binding_reason: null,
      known_context: ['Discount totals diverge after stacked discounts.'],
      fix_goal: 'Restore a correct final total when discounts stack.',
      pending_questions: ['Should loyalty discounts apply before coupons?'],
      generated_at: '2026-03-20T10:00:00.000Z',
      source_refs: ['artifact://jira/issues/BUG-123'],
    };
    const bugfixReport = {
      report_id: 'report://run-123',
      run_id: 'run-123',
      final_status: 'success' as const,
      issue_ref: 'artifact://jira/issues/BUG-123',
      requirement_refs: ['REQ-100'],
      code_locations: ['src/api/cart.ts - Handles the discount stacking path.'],
      root_cause_summary: 'Discount aggregation applies the coupon twice.',
      fix_summary: 'Normalize discount precedence before summing totals.',
      verification_summary: 'Regression checks passed.',
      artifacts: ['artifact://run-123/jira-writeback-result.json'],
      jira_writeback_summary: 'Jira writeback executed successfully.',
      feishu_record_summary: 'Feishu knowledge record has not produced any preview or execution result in this run.',
      external_outcomes: ['Jira writeback executed successfully.'],
      approval_history: ['Fix Planning approved by cli:operator at 2026-03-20T10:08:00.000Z'],
      open_risks: [],
      failure_summary: null,
      generated_at: '2026-03-20T10:12:00.000Z',
      config_version: '2026-03-19',
    };

    expect(
      renderArtifactDocument({
        artifactType: 'requirement_brief',
        format: 'cli',
        payload: requirementBrief,
      }),
    ).toContain('Requirement Brief');
    expect(
      renderArtifactDocument({
        artifactType: 'bugfix_report',
        format: 'markdown',
        payload: bugfixReport,
      }),
    ).toContain('# Bugfix Report');
    expect(
      JSON.parse(
        renderArtifactDocument({
          artifactType: 'bugfix_report',
          format: 'json',
          payload: bugfixReport,
        }),
      ),
    ).toEqual(bugfixReport);
  });

  it('exposes feishu-recorder as a named skill that prepares and executes structured record drafts', () => {
    const draft = prepareFeishuRecord({
      projectProfile: createProjectProfile(),
      issueSnapshot: createIssueSnapshot(),
      requirementRefs: createExecutionContext().requirement_refs,
      gitlabArtifacts: createExecutionContext().gitlab_artifacts,
      verificationResultsRef: createExecutionContext().verification_results_ref,
      rootCauseHypotheses: createExecutionContext().root_cause_hypotheses,
      fixPlan: createExecutionContext().fix_plan,
      generatedAt: '2026-03-20T10:10:00.000Z',
    });
    const result = executeFeishuRecord({
      draft,
      updatedAt: '2026-03-20T10:11:00.000Z',
    });

    expect(draft.target_ref).toBe('feishu://space-1/doc/doc-1/anchor/root/bugs');
    expect(result.result_url).toBe('https://feishu.example.com/doc/doc-1');
    expect(result.external_request_id).toContain('stub:feishu:doc-1');
  });

  it('exposes approval-gate as a named skill that keeps approval semantics aligned with the workflow state machine', () => {
    expect(
      applyApprovalGateDecision({
        stage: 'Artifact Linking',
        decision: 'approve',
        currentRunOutcomeStatus: 'in_progress',
      }),
    ).toMatchObject({
      skill: 'approval-gate',
      nextStageStatus: 'approved_pending_write',
      nextRunLifecycleStatus: 'active',
    });

    expect(
      applyApprovalGateDecision({
        stage: 'Fix Planning',
        decision: 'revise',
        context: createExecutionContext(),
        rollbackToStage: 'Requirement Synthesis',
        supersedingApprovalId: 'approval://run-123/revise',
        updatedAt: '2026-03-20T10:15:00.000Z',
      }),
    ).toMatchObject({
      skill: 'approval-gate',
      decision: 'revise',
      rollbackToStage: 'Requirement Synthesis',
      nextContext: {
        current_stage: 'Requirement Synthesis',
      },
    });
  });
});
