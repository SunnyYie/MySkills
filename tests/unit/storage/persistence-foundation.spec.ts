import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CheckpointRecordSchema, EXECUTION_CONTEXT_STORAGE_PROJECTION } from '../../../src/domain/index.js';
import {
  ARTIFACT_METADATA_ALLOWLIST,
  AUDIT_EVENT_ALLOWLIST,
  CHECKPOINT_ALLOWLIST,
  DIRECTORY_PERMISSIONS,
  DRY_RUN_PERSISTENCE_POLICY,
  EXECUTION_CONTEXT_ALLOWLIST,
  FILE_PERMISSIONS,
  REPORT_ALLOWLIST,
  RUN_LAYOUT,
  RUN_LAYOUT_RESPONSIBILITIES,
  acquireRunLock,
  ensureRunDirectories,
  getCheckpointFilePath,
  getProjectProfilePath,
  getRunPaths,
  readCheckpointRecords,
  releaseRunLock,
  writeJsonAtomically,
} from '../../../src/storage/index.js';

describe('storage foundation', () => {
  it('freezes the project profile path and run layout required by task 3', () => {
    const fakeHome = path.join('/tmp', 'bugfix-home');
    const runPaths = getRunPaths('run-123', fakeHome);

    expect(getProjectProfilePath('proj-a', fakeHome)).toBe(
      path.join(
        fakeHome,
        '.config',
        'bugfix-orchestrator',
        'projects',
        'proj-a.json',
      ),
    );

    expect(RUN_LAYOUT).toEqual({
      contextFile: 'context.json',
      eventsFile: 'events.ndjson',
      sideEffectsFile: 'side-effects.ndjson',
      checkpointsDir: 'checkpoints',
      artifactsDir: 'artifacts',
      lockFile: 'lock',
    });

    expect(runPaths).toEqual({
      runDir: path.join(
        fakeHome,
        '.local',
        'share',
        'bugfix-orchestrator',
        'runs',
        'run-123',
      ),
      contextFile: path.join(
        fakeHome,
        '.local',
        'share',
        'bugfix-orchestrator',
        'runs',
        'run-123',
        'context.json',
      ),
      eventsFile: path.join(
        fakeHome,
        '.local',
        'share',
        'bugfix-orchestrator',
        'runs',
        'run-123',
        'events.ndjson',
      ),
      sideEffectsFile: path.join(
        fakeHome,
        '.local',
        'share',
        'bugfix-orchestrator',
        'runs',
        'run-123',
        'side-effects.ndjson',
      ),
      checkpointsDir: path.join(
        fakeHome,
        '.local',
        'share',
        'bugfix-orchestrator',
        'runs',
        'run-123',
        'checkpoints',
      ),
      artifactsDir: path.join(
        fakeHome,
        '.local',
        'share',
        'bugfix-orchestrator',
        'runs',
        'run-123',
        'artifacts',
      ),
      lockFile: path.join(
        fakeHome,
        '.local',
        'share',
        'bugfix-orchestrator',
        'runs',
        'run-123',
        'lock',
      ),
    });

    expect(RUN_LAYOUT_RESPONSIBILITIES.contextFile).toContain('最新业务有效态');
    expect(RUN_LAYOUT_RESPONSIBILITIES.sideEffectsFile).toContain('副作用账本');
    expect(RUN_LAYOUT_RESPONSIBILITIES.lockFile).toContain('run 级互斥');
  });

  it('freezes allowlists and dry-run persistence boundaries', () => {
    expect(EXECUTION_CONTEXT_ALLOWLIST).toEqual(
      EXECUTION_CONTEXT_STORAGE_PROJECTION.context,
    );

    expect(CHECKPOINT_ALLOWLIST).toEqual([
      'checkpoint_id',
      'run_id',
      'sequence',
      'created_at',
      'trigger_event',
      'current_stage',
      'run_lifecycle_status',
      'run_outcome_status',
      'stage_status_map',
      'active_artifact_refs',
      'active_approval_refs',
      'active_error_ref',
      'latest_side_effect_ref',
      'parent_checkpoint_id',
      'context_hash',
    ]);

    expect(ARTIFACT_METADATA_ALLOWLIST).toEqual([
      'artifact_id',
      'artifact_kind',
      'stage',
      'format',
      'created_at',
      'content_ref',
      'content_hash',
      'is_dry_run',
      'is_redacted',
      'source_run_id',
    ]);

    expect(REPORT_ALLOWLIST).toContain('report_id');
    expect(REPORT_ALLOWLIST).toContain('root_cause_summary');
    expect(AUDIT_EVENT_ALLOWLIST).toContain('request_payload_hash');
    expect(AUDIT_EVENT_ALLOWLIST).not.toContain('request_payload');
    expect(EXECUTION_CONTEXT_ALLOWLIST).not.toContain('request_payload');

    expect(DRY_RUN_PERSISTENCE_POLICY).toEqual({
      persistPreviewArtifactsByDefault: true,
      persistRefreshedPreviews: true,
      markArtifactsAsDryRun: true,
      allowSuccessLedgerEntries: false,
      dryRunArtifactTag: 'dry_run_preview',
    });
  });

  it('creates private run directories, enforces run locks, and keeps checkpoint reads sorted by sequence', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-storage-'));
    const runPaths = getRunPaths('run-1', fakeHome);

    await ensureRunDirectories(runPaths);

    const runDirStat = await stat(runPaths.runDir);
    const checkpointsDirStat = await stat(runPaths.checkpointsDir);
    const artifactsDirStat = await stat(runPaths.artifactsDir);

    expect(runDirStat.mode & 0o777).toBe(DIRECTORY_PERMISSIONS);
    expect(checkpointsDirStat.mode & 0o777).toBe(DIRECTORY_PERMISSIONS);
    expect(artifactsDirStat.mode & 0o777).toBe(DIRECTORY_PERMISSIONS);

    const lock = await acquireRunLock(runPaths.lockFile, {
      owner: 'vitest',
      pid: process.pid,
      acquired_at: '2026-03-19T10:45:00.000Z',
    });

    await expect(
      acquireRunLock(runPaths.lockFile, {
        owner: 'second-writer',
        pid: process.pid,
        acquired_at: '2026-03-19T10:46:00.000Z',
      }),
    ).rejects.toThrow(/already locked/i);

    await writeJsonAtomically(runPaths.contextFile, { run_id: 'run-1' });

    const contextFileStat = await stat(runPaths.contextFile);
    const contextContents = JSON.parse(await readFile(runPaths.contextFile, 'utf8'));

    expect(contextFileStat.mode & 0o777).toBe(FILE_PERMISSIONS);
    expect(contextContents).toEqual({ run_id: 'run-1' });

    const checkpointLater = CheckpointRecordSchema.parse({
      checkpoint_id: 'checkpoint-2',
      run_id: 'run-1',
      sequence: 2,
      created_at: '2026-03-19T10:50:00.000Z',
      trigger_event: 'approval-written',
      current_stage: 'Requirement Synthesis',
      run_lifecycle_status: 'waiting_approval',
      run_outcome_status: 'in_progress',
      stage_status_map: {
        Intake: 'completed',
        'Context Resolution': 'completed',
        'Requirement Synthesis': 'waiting_approval',
      },
      active_artifact_refs: ['artifact://briefs/run-1-v2'],
      active_approval_refs: ['approval://run-1/brief-approval-v2'],
      active_error_ref: null,
      latest_side_effect_ref: null,
      parent_checkpoint_id: 'checkpoint-1',
      context_hash: 'sha256:context-v2',
    });

    const checkpointEarlier = CheckpointRecordSchema.parse({
      checkpoint_id: 'checkpoint-1',
      run_id: 'run-1',
      sequence: 1,
      created_at: '2026-03-19T10:40:00.000Z',
      trigger_event: 'brief-generated',
      current_stage: 'Requirement Synthesis',
      run_lifecycle_status: 'active',
      run_outcome_status: 'in_progress',
      stage_status_map: {
        Intake: 'completed',
        'Context Resolution': 'completed',
        'Requirement Synthesis': 'output_ready',
      },
      active_artifact_refs: ['artifact://briefs/run-1-v1'],
      active_approval_refs: [],
      active_error_ref: null,
      latest_side_effect_ref: null,
      parent_checkpoint_id: null,
      context_hash: 'sha256:context-v1',
    });

    await writeJsonAtomically(
      getCheckpointFilePath(runPaths.checkpointsDir, checkpointLater.sequence),
      checkpointLater,
    );
    await writeJsonAtomically(
      getCheckpointFilePath(runPaths.checkpointsDir, checkpointEarlier.sequence),
      checkpointEarlier,
    );

    const checkpoints = await readCheckpointRecords(runPaths.checkpointsDir);

    expect(checkpoints.map((checkpoint) => checkpoint.sequence)).toEqual([1, 2]);
    expect(checkpoints[0]?.checkpoint_id).toBe('checkpoint-1');
    expect(checkpoints[1]?.checkpoint_id).toBe('checkpoint-2');

    await releaseRunLock(lock);
  });
});
