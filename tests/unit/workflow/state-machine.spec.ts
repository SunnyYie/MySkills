import { describe, expect, it } from 'vitest';

import type { ExecutionContext, StructuredError } from '../../../src/domain/index.js';
import {
  applyApprovalDecision,
  applyRevisionRollback,
  canTransitionStageStatus,
  getRecoveryAction,
} from '../../../src/workflow/index.js';

const TIMESTAMP = '2026-03-19T11:15:00.000Z';

const createContext = (): ExecutionContext => ({
  run_id: 'run-001',
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
    'Knowledge Recording': 'waiting_approval',
  },
  stage_artifact_refs: {
    'Requirement Synthesis': ['artifact://brief/current'],
    'Code Localization': ['artifact://code-targets/current'],
    'Fix Planning': ['artifact://fix-plan/current'],
    Execution: ['artifact://verification/current'],
    'Artifact Linking': ['artifact://jira-preview/current'],
    'Knowledge Recording': ['artifact://feishu-preview/current'],
  },
  active_approval_ref_map: {
    'Requirement Synthesis': 'approval-brief',
    'Fix Planning': 'approval-fix-plan',
    'Artifact Linking': 'approval-jira',
    'Knowledge Recording': 'approval-feishu',
  },
  waiting_reason: null,
  initiator: 'user:alice',
  started_at: TIMESTAMP,
  updated_at: TIMESTAMP,
  active_bug_issue_key: 'BUG-123',
  jira_issue_snapshot_ref: 'artifact://jira/BUG-123',
  requirement_refs: [
    {
      requirement_id: 'REQ-1',
      requirement_ref: 'req://REQ-1',
      requirement_binding_status: 'resolved',
      binding_reason: null,
    },
  ],
  repo_selection: {
    repo_path: '/workspace/project-a',
    module_candidates: ['billing'],
  },
  code_targets: [
    {
      file_path: 'src/billing/export.ts',
      reason: 'stack trace points to export flow',
    },
  ],
  root_cause_hypotheses: ['Null export config reaches formatter'],
  fix_plan: ['Guard missing export config before formatter call'],
  verification_plan: ['Run export scenario with missing config'],
  verification_results_ref: 'artifact://verification/results',
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
  jira_writeback_draft_ref: 'artifact://jira/draft',
  jira_writeback_result_ref: 'artifact://jira/result',
  feishu_record_draft_ref: 'artifact://feishu/draft',
  feishu_record_result_ref: 'artifact://feishu/result',
  active_error_ref: 'artifact://errors/current',
  sensitive_field_paths: ['jira.credentials.token'],
});

const createError = (
  overrides: Partial<StructuredError> = {},
): StructuredError => ({
  code: 'WRITEBACK_UNKNOWN',
  category: 'writeback_outcome_unknown',
  stage: 'Artifact Linking',
  system: 'jira',
  operation: 'write-comment',
  target_ref: 'jira://BUG-123',
  message: 'Outcome is unknown.',
  detail: null,
  retryable: false,
  outcome_unknown: true,
  user_action: 'Reconcile before retrying.',
  raw_cause_ref: 'artifact://errors/raw',
  partial_state_ref: 'artifact://errors/partial',
  timestamp: TIMESTAMP,
  ...overrides,
});

describe('workflow state machine', () => {
  it('allows legal transitions and blocks paths that bypass approval or side-effect gates', () => {
    expect(
      canTransitionStageStatus(
        'Requirement Synthesis',
        'output_ready',
        'waiting_approval',
      ),
    ).toBe(true);
    expect(
      canTransitionStageStatus(
        'Requirement Synthesis',
        'output_ready',
        'completed',
      ),
    ).toBe(false);
    expect(
      canTransitionStageStatus('Execution', 'in_progress', 'waiting_external_input'),
    ).toBe(true);
    expect(
      canTransitionStageStatus(
        'Artifact Linking',
        'waiting_approval',
        'executing_side_effect',
      ),
    ).toBe(false);
    expect(
      canTransitionStageStatus(
        'Artifact Linking',
        'approved_pending_write',
        'executing_side_effect',
      ),
    ).toBe(true);
  });

  it('maps approval decisions to run statuses without mixing approval state into stage status semantics', () => {
    expect(
      applyApprovalDecision({
        stage: 'Requirement Synthesis',
        decision: 'approve',
        currentRunOutcomeStatus: 'in_progress',
      }),
    ).toEqual({
      nextStageStatus: 'completed',
      nextRunLifecycleStatus: 'active',
      nextRunOutcomeStatus: 'in_progress',
    });

    expect(
      applyApprovalDecision({
        stage: 'Artifact Linking',
        decision: 'approve',
        currentRunOutcomeStatus: 'in_progress',
      }),
    ).toEqual({
      nextStageStatus: 'approved_pending_write',
      nextRunLifecycleStatus: 'active',
      nextRunOutcomeStatus: 'in_progress',
    });

    expect(
      applyApprovalDecision({
        stage: 'Fix Planning',
        decision: 'reject',
        currentRunOutcomeStatus: 'in_progress',
      }),
    ).toEqual({
      nextStageStatus: 'waiting_approval',
      nextRunLifecycleStatus: 'cancelled',
      nextRunOutcomeStatus: 'cancelled',
    });
  });

  it('keeps Fix Planning behind an approval gate and clears its active outputs after revise rollback', () => {
    expect(
      canTransitionStageStatus('Fix Planning', 'output_ready', 'waiting_approval'),
    ).toBe(true);
    expect(
      canTransitionStageStatus('Fix Planning', 'output_ready', 'completed'),
    ).toBe(false);

    const result = applyRevisionRollback({
      context: createContext(),
      rollbackToStage: 'Fix Planning',
      supersedingApprovalId: 'approval-fix-plan-v2',
      updatedAt: '2026-03-19T11:18:00.000Z',
    });

    expect(result.context.current_stage).toBe('Fix Planning');
    expect(result.context.stage_status_map['Fix Planning']).toBe('not_started');
    expect(result.context.fix_plan).toEqual([]);
    expect(result.context.verification_plan).toEqual([]);
    expect(result.context.stage_artifact_refs['Fix Planning']).toBeUndefined();
    expect(result.context.active_approval_ref_map['Fix Planning']).toBeUndefined();
  });

  it('marks rollback scope as stale while preserving history references outside the active state', () => {
    const result = applyRevisionRollback({
      context: createContext(),
      rollbackToStage: 'Code Localization',
      supersedingApprovalId: 'approval-revise-001',
      updatedAt: '2026-03-19T11:20:00.000Z',
    });

    expect(result.supersededApprovalIds).toEqual([
      'approval-fix-plan',
      'approval-jira',
      'approval-feishu',
    ]);
    expect(result.context.current_stage).toBe('Code Localization');
    expect(result.context.run_lifecycle_status).toBe('active');
    expect(result.context.run_outcome_status).toBe('in_progress');
    expect(result.context.stage_status_map).toMatchObject({
      'Requirement Synthesis': 'completed',
      'Code Localization': 'not_started',
      'Fix Planning': 'stale',
      Execution: 'stale',
      'Artifact Linking': 'stale',
      'Knowledge Recording': 'stale',
    });
    expect(result.context.stage_artifact_refs['Code Localization']).toBeUndefined();
    expect(result.context.stage_artifact_refs['Fix Planning']).toBeUndefined();
    expect(result.context.active_approval_ref_map['Fix Planning']).toBeUndefined();
    expect(result.context.active_approval_ref_map['Artifact Linking']).toBeUndefined();
    expect(result.context.code_targets).toEqual([]);
    expect(result.context.root_cause_hypotheses).toEqual([]);
    expect(result.context.fix_plan).toEqual([]);
    expect(result.context.verification_plan).toEqual([]);
    expect(result.context.verification_results_ref).toBeNull();
    expect(result.context.gitlab_artifacts).toEqual([]);
    expect(result.context.jira_writeback_draft_ref).toBeNull();
    expect(result.context.jira_writeback_result_ref).toBeNull();
    expect(result.context.feishu_record_draft_ref).toBeNull();
    expect(result.context.feishu_record_result_ref).toBeNull();
    expect(result.context.active_error_ref).toBeNull();
  });

  it('derives explicit recovery actions for waiting input, partial success and reconcile-first situations', () => {
    expect(
      getRecoveryAction({
        stage: 'Execution',
        stageStatus: 'waiting_external_input',
        runOutcomeStatus: 'in_progress',
      }),
    ).toEqual({
      action: 'await_external_input',
      reason: 'The stage is waiting for GitLab artifacts, verification results, or other user supplied inputs.',
    });

    expect(
      getRecoveryAction({
        stage: 'Artifact Linking',
        stageStatus: 'failed',
        runOutcomeStatus: 'failed',
        activeError: createError(),
      }),
    ).toEqual({
      action: 'reconcile_before_retry',
      reason: 'The active error marks the write outcome as unknown, so workflow must reconcile before retrying.',
    });

    expect(
      getRecoveryAction({
        stage: 'Knowledge Recording',
        stageStatus: 'approved_pending_write',
        runOutcomeStatus: 'in_progress',
        latestSideEffectStatus: 'dispatched',
      }),
    ).toEqual({
      action: 'reconcile_before_retry',
      reason: 'A prepared or dispatched side effect exists without a terminal outcome, so replay is unsafe.',
    });

    expect(
      getRecoveryAction({
        stage: 'Knowledge Recording',
        stageStatus: 'failed',
        runOutcomeStatus: 'partial_success',
      }),
    ).toEqual({
      action: 'pause_for_partial_success_review',
      reason: 'The run already has successful outcomes and an additional non-ignorable failure that needs review.',
    });
  });
});
