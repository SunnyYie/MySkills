import { describe, expect, it } from 'vitest';

import type { ExecutionContext } from '../../../src/domain/index.js';
import { normalizeGitLabArtifacts } from '../../../src/skills/gitlab-linker/index.js';
import {
  getExecutionExternalInputState,
  recordExecutionExternalInputs,
} from '../../../src/workflow/index.js';

const TIMESTAMP = '2026-03-19T12:10:00.000Z';

const createContext = (): ExecutionContext => ({
  run_id: 'run-011',
  project_id: 'proj-a',
  config_version: '2026-03-19',
  run_mode: 'full',
  run_lifecycle_status: 'active',
  run_outcome_status: 'in_progress',
  current_stage: 'Execution',
  stage_status_map: {
    Intake: 'completed',
    'Context Resolution': 'completed',
    'Requirement Synthesis': 'completed',
    'Code Localization': 'completed',
    'Fix Planning': 'completed',
    Execution: 'in_progress',
    'Artifact Linking': 'not_started',
    'Knowledge Recording': 'not_started',
  },
  stage_artifact_refs: {
    'Fix Planning': ['artifact://fix-plan/current'],
  },
  active_approval_ref_map: {
    'Fix Planning': 'approval://fix-plan/current',
  },
  waiting_reason: null,
  initiator: 'user:sunyi',
  started_at: TIMESTAMP,
  updated_at: TIMESTAMP,
  jira_issue_snapshot_ref: 'artifact://jira/BUG-123',
  requirement_refs: [
    {
      requirement_id: 'REQ-123',
      requirement_ref: 'req://REQ-123',
      requirement_binding_status: 'resolved',
      binding_reason: null,
    },
  ],
  repo_selection: {
    repo_path: '/workspace/project-a',
    module_candidates: ['payments'],
  },
  code_targets: [
    {
      file_path: 'src/payments/coupon-validator.ts',
      reason: 'Matched coupon validator references',
    },
  ],
  root_cause_hypotheses: [
    'The coupon validator likely rejects valid stacked discounts.',
  ],
  fix_plan: ['Apply the manual validator fix and record the artifact references.'],
  verification_plan: ['Re-run the coupon regression and capture final evidence.'],
  verification_results_ref: null,
  gitlab_artifacts: [],
  jira_writeback_draft_ref: null,
  jira_writeback_result_ref: null,
  feishu_record_draft_ref: null,
  feishu_record_result_ref: null,
  active_error_ref: null,
  sensitive_field_paths: ['jira.credential_ref'],
});

const createArtifacts = () =>
  normalizeGitLabArtifacts({
    gitlabConfig: {
      project_id: 'group/project-a',
      default_branch: 'main',
      base_url: 'https://gitlab.example.com',
    },
    recordedAt: TIMESTAMP,
    artifacts: [
      {
        artifact_source: 'external_import',
        artifact_type: 'commit',
        commit_sha: 'abcdef0123456789abcdef0123456789abcdef01',
        commit_url:
          'https://gitlab.example.com/group/project-a/-/commit/abcdef0123456789abcdef0123456789abcdef01',
      },
    ],
  });

describe('execution external inputs', () => {
  it('marks Execution as waiting when both artifacts and verification are still missing', () => {
    expect(getExecutionExternalInputState(createContext())).toEqual({
      stageStatus: 'waiting_external_input',
      runLifecycleStatus: 'waiting_external_input',
      waitingReason: 'gitlab_artifacts,verification_results',
      missingInputs: ['gitlab_artifacts', 'verification_results'],
      summary:
        'Execution is waiting for GitLab artifacts and verification results before downstream writeback can start.',
    });
  });

  it('distinguishes which external input is still missing', () => {
    const onlyArtifactsMissing = {
      ...createContext(),
      verification_results_ref: 'artifact://verification/results-v1',
    };
    const onlyVerificationMissing = {
      ...createContext(),
      gitlab_artifacts: createArtifacts(),
    };

    expect(getExecutionExternalInputState(onlyArtifactsMissing)).toMatchObject({
      waitingReason: 'gitlab_artifacts',
      missingInputs: ['gitlab_artifacts'],
    });
    expect(getExecutionExternalInputState(onlyVerificationMissing)).toMatchObject({
      waitingReason: 'verification_results',
      missingInputs: ['verification_results'],
    });
  });

  it('merges first and repeated external inputs, then completes Execution when both inputs exist', () => {
    const firstUpdate = recordExecutionExternalInputs({
      context: createContext(),
      updatedAt: '2026-03-19T12:11:00.000Z',
      gitlabArtifacts: createArtifacts(),
    });

    expect(firstUpdate.accepted).toBe(true);
    expect(firstUpdate.context.gitlab_artifacts).toHaveLength(1);
    expect(firstUpdate.context.verification_results_ref).toBeNull();
    expect(firstUpdate.state.stageStatus).toBe('waiting_external_input');

    const secondUpdate = recordExecutionExternalInputs({
      context: firstUpdate.context,
      updatedAt: '2026-03-19T12:12:00.000Z',
      gitlabArtifacts: createArtifacts(),
      verificationResultsRef: 'artifact://verification/results-v2',
    });

    expect(secondUpdate.accepted).toBe(true);
    expect(secondUpdate.context.gitlab_artifacts).toHaveLength(1);
    expect(secondUpdate.context.verification_results_ref).toBe(
      'artifact://verification/results-v2',
    );
    expect(secondUpdate.context.stage_status_map.Execution).toBe('completed');
    expect(secondUpdate.state.stageStatus).toBe('completed');
    expect(secondUpdate.state.missingInputs).toEqual([]);
  });

  it('rejects conflicting repeated GitLab artifacts without mutating the current effective state', () => {
    const initial = recordExecutionExternalInputs({
      context: createContext(),
      updatedAt: '2026-03-19T12:11:00.000Z',
      gitlabArtifacts: createArtifacts(),
    });

    const conflictingArtifacts = normalizeGitLabArtifacts({
      gitlabConfig: {
        project_id: 'group/project-a',
        default_branch: 'main',
        base_url: 'https://gitlab.example.com',
      },
      recordedAt: TIMESTAMP,
      artifacts: [
        {
          artifact_source: 'external_import',
          artifact_type: 'commit',
          commit_sha: 'abcdef0123456789abcdef0123456789abcdef01',
          commit_url:
            'https://gitlab.example.com/group/project-a/-/commit/DIFFERENT',
        },
      ],
    });

    const rejected = recordExecutionExternalInputs({
      context: initial.context,
      updatedAt: '2026-03-19T12:13:00.000Z',
      gitlabArtifacts: conflictingArtifacts,
    });

    expect(rejected.accepted).toBe(false);
    expect(rejected.errors[0]?.category).toBe('state_conflict');
    expect(rejected.context).toEqual(initial.context);
    expect(rejected.context.gitlab_artifacts).toHaveLength(1);
  });
});
