import os from 'node:os';
import path from 'node:path';

import { EXECUTION_CONTEXT_STORAGE_PROJECTION } from '../domain/index.js';

export const STORAGE_APP_DIRECTORY = 'bugfix-orchestrator';

export const RUN_LAYOUT = {
  contextFile: 'context.json',
  eventsFile: 'events.ndjson',
  sideEffectsFile: 'side-effects.ndjson',
  checkpointsDir: 'checkpoints',
  artifactsDir: 'artifacts',
  lockFile: 'lock',
} as const;

export const RUN_LAYOUT_RESPONSIBILITIES = {
  contextFile: '保存最新业务有效态，只允许索引、摘要、hash 与 artifact ref。',
  eventsFile: '保存 run 创建、阶段推进、审批、恢复等审计事件。',
  sideEffectsFile: '保存 Jira / 飞书真实写入的副作用账本。',
  checkpointsDir: '保存每次 durable 状态迁移后的脱敏 checkpoint 快照。',
  artifactsDir: '保存 brief、preview、report 等默认脱敏的人类可读工件。',
  lockFile: '保存 run 级互斥锁信息，防止多个终端并发写同一 run。',
} as const;

export const DIRECTORY_PERMISSIONS = 0o700;
export const FILE_PERMISSIONS = 0o600;

export const EXECUTION_CONTEXT_ALLOWLIST = [
  ...EXECUTION_CONTEXT_STORAGE_PROJECTION.context,
] as const;

export const CHECKPOINT_ALLOWLIST = [
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
] as const;

export const ARTIFACT_METADATA_ALLOWLIST = [
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
] as const;

export const REPORT_ALLOWLIST = [
  'report_id',
  'run_id',
  'final_status',
  'issue_ref',
  'requirement_refs',
  'code_locations',
  'root_cause_summary',
  'fix_summary',
  'verification_summary',
  'artifacts',
  'jira_writeback_summary',
  'feishu_record_summary',
  'external_outcomes',
  'approval_history',
  'open_risks',
  'failure_summary',
  'generated_at',
  'config_version',
] as const;

export const AUDIT_EVENT_ALLOWLIST = [
  'event_type',
  'run_id',
  'stage',
  'status',
  'artifact_ref',
  'approval_id',
  'target_ref',
  'request_payload_hash',
  'result_ref',
  'dry_run',
  'timestamp',
] as const;

export const DRY_RUN_PERSISTENCE_POLICY = {
  persistPreviewArtifactsByDefault: true,
  persistRefreshedPreviews: true,
  markArtifactsAsDryRun: true,
  allowSuccessLedgerEntries: false,
  dryRunArtifactTag: 'dry_run_preview',
} as const;

export type RunPaths = ReturnType<typeof getRunPaths>;

export const getProjectProfilePath = (
  projectId: string,
  homeDir = os.homedir(),
) =>
  path.join(
    homeDir,
    '.config',
    STORAGE_APP_DIRECTORY,
    'projects',
    `${projectId}.json`,
  );

export const getRunPaths = (runId: string, homeDir = os.homedir()) => {
  const runDir = path.join(
    homeDir,
    '.local',
    'share',
    STORAGE_APP_DIRECTORY,
    'runs',
    runId,
  );

  return {
    runDir,
    contextFile: path.join(runDir, RUN_LAYOUT.contextFile),
    eventsFile: path.join(runDir, RUN_LAYOUT.eventsFile),
    sideEffectsFile: path.join(runDir, RUN_LAYOUT.sideEffectsFile),
    checkpointsDir: path.join(runDir, RUN_LAYOUT.checkpointsDir),
    artifactsDir: path.join(runDir, RUN_LAYOUT.artifactsDir),
    lockFile: path.join(runDir, RUN_LAYOUT.lockFile),
  };
};

export const formatCheckpointSequence = (sequence: number) =>
  String(sequence).padStart(6, '0');

export const getCheckpointFilePath = (
  checkpointsDir: string,
  sequence: number,
) => path.join(checkpointsDir, `${formatCheckpointSequence(sequence)}.json`);
