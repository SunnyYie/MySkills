import { describe, expect, it } from 'vitest';

import {
  renderBugfixReportCli,
  renderBugfixReportJson,
  renderBugfixReportMarkdown,
} from '../../../src/renderers/index.js';
import { createBugfixReport } from '../../../src/skills/index.js';
import type { ApprovalRecord, ExecutionContext } from '../../../src/domain/index.js';

const baseContext: ExecutionContext = {
  run_id: 'run-123',
  project_id: 'proj-a',
  config_version: '2026-03-19',
  run_mode: 'full',
  run_lifecycle_status: 'completed',
  run_outcome_status: 'success',
  current_stage: 'Knowledge Recording',
  stage_status_map: {
    Intake: 'completed',
    'Context Resolution': 'completed',
    'Requirement Synthesis': 'completed',
    'Code Localization': 'completed',
    'Fix Planning': 'completed',
    Execution: 'completed',
    'Artifact Linking': 'completed',
    'Knowledge Recording': 'completed',
  },
  stage_artifact_refs: {
    'Requirement Synthesis': ['artifact://briefs/run-123'],
    'Artifact Linking': ['artifact://jira/draft-v1'],
    'Knowledge Recording': ['artifact://feishu/draft-v1'],
  },
  active_approval_ref_map: {},
  waiting_reason: null,
  initiator: 'tester',
  started_at: '2026-03-19T07:00:00.000Z',
  updated_at: '2026-03-19T08:00:00.000Z',
  jira_issue_snapshot_ref: 'artifact://jira/issues/BUG-123',
  requirement_refs: [
    {
      requirement_id: 'req-1',
      requirement_ref: 'REQ-123',
      requirement_binding_status: 'resolved',
      binding_reason: 'Resolved from issue link.',
    },
  ],
  repo_selection: {
    repo_path: '/repo/project-a',
    module_candidates: ['checkout'],
  },
  code_targets: [
    {
      file_path: 'src/checkout/cart.ts',
      reason: 'Matched coupon validation in module checkout.',
    },
  ],
  root_cause_hypotheses: [
    'Coupon validation skipped the zero-quantity guard in the checkout flow.',
  ],
  fix_plan: [
    'Restore the quantity guard before the coupon is applied and add a defensive branch for stale carts.',
  ],
  verification_plan: [
    'Replay the BUG-123 checkout path with zero quantity and confirm the coupon is rejected.',
  ],
  verification_results_ref: 'artifact://verification/run-123',
  gitlab_artifacts: [
    {
      artifact_source: 'external_import',
      artifact_type: 'commit',
      project_id: 'proj-a',
      project_path: 'group/proj-a',
      default_branch: 'main',
      branch_name: undefined,
      commit_sha: 'abc123def456',
      commit_url: 'https://gitlab.example.com/group/proj-a/-/commit/abc123def456',
      mr_iid: undefined,
      mr_url: undefined,
      created_at: '2026-03-19T07:30:00.000Z',
    },
  ],
  jira_writeback_draft_ref: 'artifact://jira/draft-v1',
  jira_writeback_result_ref: 'artifact://jira/result-v1',
  feishu_record_draft_ref: 'artifact://feishu/draft-v1',
  feishu_record_result_ref: 'artifact://feishu/result-v1',
  active_error_ref: null,
  sensitive_field_paths: [],
};

const approvalHistory: ApprovalRecord[] = [
  {
    approval_id: 'approval://brief/1',
    stage: 'Requirement Synthesis',
    approval_status: 'approved',
    decision: 'approve',
    decider: 'alice',
    comment_ref: 'artifact://comments/brief-approval',
    preview_ref: 'artifact://briefs/run-123',
    preview_hash: 'sha256:brief-v1',
    requested_at: '2026-03-19T07:05:00.000Z',
    decided_at: '2026-03-19T07:06:00.000Z',
  },
  {
    approval_id: 'approval://fix-plan/1',
    stage: 'Fix Planning',
    approval_status: 'approved',
    decision: 'approve',
    decider: 'alice',
    comment_ref: null,
    preview_ref: 'artifact://plans/run-123',
    preview_hash: 'sha256:plan-v1',
    requested_at: '2026-03-19T07:10:00.000Z',
    decided_at: '2026-03-19T07:11:00.000Z',
  },
];

describe('report writer', () => {
  it('builds a success report from the final execution context without depending on raw intermediate objects', () => {
    const report = createBugfixReport({
      context: baseContext,
      approvalHistory,
      verificationSummary: 'Verification passed with 2/2 successful checks.',
      openRisks: ['Watch for stale cart snapshots during rollout.'],
      externalOutcomes: [
        'Jira writeback executed successfully.',
        'Feishu knowledge record appended successfully.',
      ],
      generatedAt: '2026-03-19T08:05:00.000Z',
    });

    expect(report).toMatchObject({
      report_id: 'report://run-123',
      run_id: 'run-123',
      final_status: 'success',
      issue_ref: 'artifact://jira/issues/BUG-123',
      requirement_refs: ['REQ-123'],
      code_locations: [
        'src/checkout/cart.ts - Matched coupon validation in module checkout.',
      ],
      root_cause_summary:
        'Coupon validation skipped the zero-quantity guard in the checkout flow.',
      fix_summary:
        'Restore the quantity guard before the coupon is applied and add a defensive branch for stale carts.',
      verification_summary: 'Verification passed with 2/2 successful checks.',
      jira_writeback_summary:
        'Jira writeback executed successfully (result ref: artifact://jira/result-v1).',
      feishu_record_summary:
        'Feishu knowledge record executed successfully (result ref: artifact://feishu/result-v1).',
      failure_summary: null,
      config_version: '2026-03-19',
    });
    expect(report.artifacts).toEqual([
      'gitlab:commit:abc123def456',
      'artifact://verification/run-123',
      'artifact://jira/draft-v1',
      'artifact://jira/result-v1',
      'artifact://feishu/draft-v1',
      'artifact://feishu/result-v1',
    ]);
    expect(report.approval_history).toEqual([
      'Requirement Synthesis approved by alice at 2026-03-19T07:06:00.000Z (preview: artifact://briefs/run-123)',
      'Fix Planning approved by alice at 2026-03-19T07:11:00.000Z (preview: artifact://plans/run-123)',
    ]);
  });

  it('captures partial success and failed outcomes with different summaries', () => {
    const partialSuccessReport = createBugfixReport({
      context: {
        ...baseContext,
        run_outcome_status: 'partial_success',
        active_error_ref: 'artifact://errors/feishu-writeback',
        feishu_record_result_ref: null,
      },
      approvalHistory,
      verificationSummary: 'Verification passed with 2/2 successful checks.',
      openRisks: [],
      externalOutcomes: [
        'Jira writeback executed successfully.',
        'Feishu knowledge record failed and requires retry.',
      ],
      generatedAt: '2026-03-19T08:10:00.000Z',
    });

    const failedReport = createBugfixReport({
      context: {
        ...baseContext,
        run_lifecycle_status: 'failed',
        run_outcome_status: 'failed',
        active_error_ref: 'artifact://errors/run-failed',
        jira_writeback_result_ref: null,
        feishu_record_result_ref: null,
      },
      approvalHistory,
      verificationSummary: 'Verification evidence is missing because execution stopped early.',
      openRisks: [],
      generatedAt: '2026-03-19T08:15:00.000Z',
    });

    expect(partialSuccessReport.failure_summary).toBe(
      'Run completed with partial success; review active error ref artifact://errors/feishu-writeback before retrying remaining writeback steps.',
    );
    expect(partialSuccessReport.feishu_record_summary).toBe(
      'Feishu knowledge record preview exists but execution has not completed yet.',
    );

    expect(failedReport.failure_summary).toBe(
      'Run failed before all downstream outputs completed; inspect active error ref artifact://errors/run-failed for recovery details.',
    );
    expect(failedReport.jira_writeback_summary).toBe(
      'Jira writeback preview exists but execution has not completed yet.',
    );
    expect(failedReport.feishu_record_summary).toBe(
      'Feishu knowledge record preview exists but execution has not completed yet.',
    );
  });

  it('renders one report consistently for cli, markdown, and json export', () => {
    const report = createBugfixReport({
      context: baseContext,
      approvalHistory,
      verificationSummary: 'Verification passed with 2/2 successful checks.',
      openRisks: ['Watch for stale cart snapshots during rollout.'],
      externalOutcomes: [
        'Jira writeback executed successfully.',
        'Feishu knowledge record appended successfully.',
      ],
      generatedAt: '2026-03-19T08:05:00.000Z',
    });

    const cliOutput = renderBugfixReportCli(report);
    const markdownOutput = renderBugfixReportMarkdown(report);
    const jsonOutput = renderBugfixReportJson(report);

    expect(cliOutput).toContain('Bugfix Report');
    expect(cliOutput).toContain('Final Status: success');
    expect(cliOutput).toContain('Issue Ref: artifact://jira/issues/BUG-123');
    expect(cliOutput).toContain(
      'Jira writeback executed successfully (result ref: artifact://jira/result-v1).',
    );

    expect(markdownOutput).toContain('# Bugfix Report');
    expect(markdownOutput).toContain('- Final Status: success');
    expect(markdownOutput).toContain('## Approval History');
    expect(markdownOutput).toContain('## External Outcomes');

    expect(JSON.parse(jsonOutput)).toEqual(report);
  });
});
