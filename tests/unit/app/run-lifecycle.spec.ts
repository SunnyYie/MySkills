import { access, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { StructuredError } from '../../../src/domain/index.js';
import { ExecutionContextSchema } from '../../../src/domain/index.js';
import {
  CLI_COMMAND_USE_CASE_BOUNDARY,
  CLI_EXIT_CODES,
  getUseCaseForCommandGroup,
  initializeRun,
  mapErrorToCliFailure,
  restoreRun,
} from '../../../src/app/index.js';
import { getCheckpointFilePath, getRunPaths, writeJsonAtomically } from '../../../src/storage/index.js';

const TIMESTAMP = '2026-03-19T12:00:00.000Z';

const createStructuredError = (
  overrides: Partial<StructuredError> = {},
): StructuredError => ({
  code: 'CONFIG_MISSING',
  category: 'configuration_missing',
  stage: 'Intake',
  system: 'app',
  operation: 'load-project-profile',
  target_ref: null,
  message: 'Project profile is missing.',
  detail: null,
  retryable: false,
  outcome_unknown: false,
  user_action: 'Run bind before starting a workflow.',
  raw_cause_ref: null,
  partial_state_ref: null,
  timestamp: TIMESTAMP,
  ...overrides,
});

describe('app run lifecycle', () => {
  it('freezes the CLI command to app use case boundary for task 5', () => {
    expect(CLI_COMMAND_USE_CASE_BOUNDARY).toEqual({
      bind: 'bind-project-profile',
      inspect: 'inspect-resource',
      run: 'orchestrate-run-lifecycle',
      record: 'record-external-artifacts',
    });

    expect(getUseCaseForCommandGroup('run')).toBe('orchestrate-run-lifecycle');
    expect(new Set(Object.values(CLI_COMMAND_USE_CASE_BOUNDARY)).size).toBe(4);
  });

  it('creates a recoverable run with an initial checkpoint and lock handle', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-app-init-'));

    const result = await initializeRun({
      projectId: 'proj-a',
      configVersion: '2026-03-19',
      jiraIssueSnapshotRef: 'artifact://jira/BUG-123',
      initiator: 'user:alice',
      homeDir: fakeHome,
      now: () => TIMESTAMP,
      runIdFactory: () => 'run-seeded',
      lockOwner: 'vitest',
    });

    const runPaths = getRunPaths('run-seeded', fakeHome);
    const context = ExecutionContextSchema.parse(
      JSON.parse(await readFile(runPaths.contextFile, 'utf8')),
    );
    const checkpoint = JSON.parse(
      await readFile(getCheckpointFilePath(runPaths.checkpointsDir, 0), 'utf8'),
    );

    expect(result.context.run_id).toBe('run-seeded');
    expect(result.context.current_stage).toBe('Intake');
    expect(result.context.stage_status_map).toEqual({ Intake: 'not_started' });
    expect(result.checkpoint.sequence).toBe(0);
    expect(result.checkpoint.trigger_event).toBe('run_initialized');
    expect(result.lockHandle.lockContents.owner).toBe('vitest');
    expect(context).toMatchObject({
      run_id: 'run-seeded',
      project_id: 'proj-a',
      jira_issue_snapshot_ref: 'artifact://jira/BUG-123',
      run_lifecycle_status: 'active',
      run_outcome_status: 'in_progress',
    });
    expect(checkpoint.active_artifact_refs).toEqual([]);
    expect(checkpoint.active_approval_refs).toEqual([]);
    await expect(access(runPaths.lockFile)).resolves.toBeUndefined();
  });

  it('routes restore entry through the latest or explicit checkpoint and forces reconcile when invariants require it', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-app-restore-'));
    const runPaths = getRunPaths('run-restore', fakeHome);

    await initializeRun({
      projectId: 'proj-a',
      configVersion: '2026-03-19',
      jiraIssueSnapshotRef: 'artifact://jira/BUG-456',
      initiator: 'user:bob',
      homeDir: fakeHome,
      now: () => TIMESTAMP,
      runIdFactory: () => 'run-restore',
      lockOwner: 'setup',
      releaseLock: true,
    });

    await writeJsonAtomically(runPaths.contextFile, {
      ...ExecutionContextSchema.parse(
        JSON.parse(await readFile(runPaths.contextFile, 'utf8')),
      ),
      current_stage: 'Artifact Linking',
      updated_at: '2026-03-19T12:05:00.000Z',
      stage_status_map: {
        Intake: 'completed',
        'Context Resolution': 'completed',
        'Requirement Synthesis': 'completed',
        'Code Localization': 'completed',
        'Fix Planning': 'completed',
        Execution: 'completed',
        'Artifact Linking': 'approved_pending_write',
      },
      active_error_ref: 'artifact://errors/unknown-write',
    });

    await writeJsonAtomically(getCheckpointFilePath(runPaths.checkpointsDir, 1), {
      checkpoint_id: 'checkpoint-001',
      run_id: 'run-restore',
      sequence: 1,
      created_at: '2026-03-19T12:05:00.000Z',
      trigger_event: 'jira-preview-approved',
      current_stage: 'Artifact Linking',
      run_lifecycle_status: 'active',
      run_outcome_status: 'in_progress',
      stage_status_map: {
        Intake: 'completed',
        'Context Resolution': 'completed',
        'Requirement Synthesis': 'completed',
        'Code Localization': 'completed',
        'Fix Planning': 'completed',
        Execution: 'completed',
        'Artifact Linking': 'approved_pending_write',
      },
      active_artifact_refs: ['artifact://jira/preview/v1'],
      active_approval_refs: ['approval://jira/v1'],
      active_error_ref: 'artifact://errors/unknown-write',
      latest_side_effect_ref: 'side-effect://jira/attempt-1',
      parent_checkpoint_id: 'checkpoint-000',
      context_hash: 'sha256:checkpoint-1',
    });

    const latest = await restoreRun({
      runId: 'run-restore',
      homeDir: fakeHome,
      now: () => '2026-03-19T12:06:00.000Z',
      lockOwner: 'restore-latest',
    });

    expect(latest.selectedCheckpoint.checkpoint_id).toBe('checkpoint-001');
    expect(latest.recovery.action).toBe('resume_current_stage');

    await latest.releaseLock();

    const explicit = await restoreRun({
      runId: 'run-restore',
      checkpointId: 'checkpoint-001',
      homeDir: fakeHome,
      now: () => '2026-03-19T12:07:00.000Z',
      lockOwner: 'restore-explicit',
      loadActiveError: async () =>
        createStructuredError({
          code: 'WRITE_UNKNOWN',
          category: 'writeback_outcome_unknown',
          stage: 'Artifact Linking',
          system: 'jira',
          operation: 'execute-writeback',
          target_ref: 'jira://BUG-456',
          message: 'Write outcome is unknown.',
          outcome_unknown: true,
          user_action: 'Reconcile before retrying.',
        }),
      loadLatestSideEffectStatus: async () => 'dispatched',
    });

    expect(explicit.selectedCheckpoint.checkpoint_id).toBe('checkpoint-001');
    expect(explicit.recovery).toEqual({
      action: 'reconcile_before_retry',
      reason:
        'The active error marks the write outcome as unknown, so workflow must reconcile before retrying.',
    });

    await explicit.releaseLock();
  });

  it('maps structured errors and run lock conflicts to consistent CLI exit codes', () => {
    expect(
      mapErrorToCliFailure(
        createStructuredError({
          category: 'configuration_missing',
        }),
      ),
    ).toEqual({
      exitCode: CLI_EXIT_CODES.configuration,
      summary: 'Project profile is missing.',
      nextAction: 'Run bind before starting a workflow.',
      category: 'configuration_missing',
    });

    expect(
      mapErrorToCliFailure(
        createStructuredError({
          category: 'permission_denied',
          code: 'NO_PERMISSION',
          message: 'Credential cannot update Jira.',
          user_action: 'Verify permission scopes and retry.',
        }),
      ),
    ).toEqual({
      exitCode: CLI_EXIT_CODES.permission,
      summary: 'Credential cannot update Jira.',
      nextAction: 'Verify permission scopes and retry.',
      category: 'permission_denied',
    });

    expect(
      mapErrorToCliFailure(
        createStructuredError({
          category: 'network_error',
          code: 'NETWORK_DOWN',
          message: 'Jira is temporarily unavailable.',
          user_action: 'Retry when the network is healthy.',
        }),
      ),
    ).toEqual({
      exitCode: CLI_EXIT_CODES.network,
      summary: 'Jira is temporarily unavailable.',
      nextAction: 'Retry when the network is healthy.',
      category: 'network_error',
    });

    expect(
      mapErrorToCliFailure(new Error('Run is already locked: /tmp/run.lock')),
    ).toEqual({
      exitCode: CLI_EXIT_CODES.stateConflict,
      summary: 'Run is already locked: /tmp/run.lock',
      nextAction: 'Close the other writer or wait for the active command to finish.',
      category: 'state_conflict',
    });
  });
});
