import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { bootstrapCli } from '../../../src/app/index.js';
import {
  DRY_RUN_PERSISTENCE_POLICY,
  getProjectProfilePath,
  getRunPaths,
  writeJsonAtomically,
} from '../../../src/storage/index.js';

const createOutputCollector = () => {
  let stdout = '';
  let stderr = '';

  return {
    io: {
      writeStdout: (chunk: string) => {
        stdout += chunk;
      },
      writeStderr: (chunk: string) => {
        stderr += chunk;
      },
    },
    getStdout: () => stdout,
    getStderr: () => stderr,
    reset: () => {
      stdout = '';
      stderr = '';
    },
  };
};

const writeJsonFixture = async (
  directory: string,
  fileName: string,
  payload: unknown,
) => {
  const fixturePath = path.join(directory, fileName);
  await writeFile(fixturePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return fixturePath;
};

const createCompleteProjectProfile = () => ({
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
        priority: 1,
        fallback_action: 'manual',
      },
    ],
    writeback_targets: ['comment'],
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
    credential_ref: 'cred:jira/project-a',
  },
  requirements: {
    source_type: 'feishu_doc',
    source_ref: 'doc://feishu/project-a',
  },
  gitlab: {
    base_url: 'https://gitlab.example.com',
    project_id: 'group/project-a',
    default_branch: 'main',
    branch_naming_rule: 'bugfix/{issue_key}',
    branch_binding: {
      input_mode: 'current_branch',
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

const seedCompleteProjectProfile = async (homeDir: string) => {
  await writeJsonAtomically(
    getProjectProfilePath('proj-a', homeDir),
    createCompleteProjectProfile(),
  );
};

const seedJiraIssueFixture = async (homeDir: string, issueKey: string) => {
  const fixturePath = path.join(
    homeDir,
    '.local',
    'share',
    'bugfix-orchestrator',
    'fixtures',
    'jira',
    'issues',
    `${issueKey}.json`,
  );

  await writeJsonAtomically(fixturePath, {
    issue_key: issueKey,
    issue_id: `id-${issueKey}`,
    issue_type_id: '10001',
    project_key: 'BUG',
    summary: `Summary for ${issueKey}`,
    description: `Description for ${issueKey}`,
    status_name: 'In Progress',
    labels: ['bug', 'module:api'],
    requirement_sources: {
      issue_link: ['REQ-100'],
    },
    source_url: `https://jira.example.com/browse/${issueKey}`,
  });
};

describe('CLI writeback flows', () => {
  it('lets the jira writeback subworkflow complete dry-run preview and non-interactive execution through shared run semantics', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-cli-writeback-jira-'));
    await seedCompleteProjectProfile(fakeHome);
    await seedJiraIssueFixture(fakeHome, 'BUG-900');
    const fixtureDir = await mkdtemp(path.join(tmpdir(), 'bfo-cli-writeback-fixtures-'));
    const collector = createOutputCollector();
    const program = bootstrapCli({
      io: collector.io,
      env: {
        ...process.env,
        BUGFIX_ORCHESTRATOR_HOME: fakeHome,
      },
    });

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'record',
      'jira',
      '--project',
      'proj-a',
      '--issue',
      'BUG-900',
      '--json',
    ]);

    const jiraRun = JSON.parse(collector.getStdout().trim());
    collector.reset();

    const artifactsFile = await writeJsonFixture(fixtureDir, 'artifacts.json', [
      {
        artifact_source: 'external_import',
        artifact_type: 'commit',
        project_id: 'group/project-a',
        project_path: 'group/project-a',
        default_branch: 'main',
        commit_sha: 'abcdef0123456789abcdef0123456789abcdef01',
        commit_url:
          'https://gitlab.example.com/group/project-a/-/commit/abcdef0123456789abcdef0123456789abcdef01',
        created_at: '2026-03-19T12:05:00.000Z',
      },
    ]);
    const verificationFile = await writeJsonFixture(fixtureDir, 'verification.json', {
      outcome: 'passed',
      verification_summary: 'Regression path passed after the external fix.',
      checks: [
        {
          name: 'coupon regression',
          status: 'passed',
        },
      ],
      input_source: 'manual_cli',
      recorded_at: '2026-03-19T12:10:00.000Z',
    });

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'bind-branch',
      '--run',
      jiraRun.runId,
      '--branch',
      'bugfix/BUG-900',
      '--json',
    ]);
    collector.reset();

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'provide-artifact',
      '--run',
      jiraRun.runId,
      '--file',
      artifactsFile,
      '--json',
    ]);
    collector.reset();

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'provide-verification',
      '--run',
      jiraRun.runId,
      '--file',
      verificationFile,
      '--json',
    ]);

    const verificationOutput = JSON.parse(collector.getStdout().trim());
    collector.reset();

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'preview-write',
      '--run',
      jiraRun.runId,
      '--stage',
      'Artifact Linking',
      '--json',
      '--dry-run',
    ]);

    const previewOutput = JSON.parse(collector.getStdout().trim());
    collector.reset();

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'approve',
      '--run',
      jiraRun.runId,
      '--stage',
      'Artifact Linking',
      '--preview-ref',
      previewOutput.previewRef,
      '--json',
    ]);
    collector.reset();

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'execute-write',
      '--run',
      jiraRun.runId,
      '--stage',
      'Artifact Linking',
      '--preview-ref',
      previewOutput.previewRef,
      '--confirm',
      previewOutput.previewHash,
      '--non-interactive',
      '--json',
    ]);

    const executeOutput = JSON.parse(collector.getStdout().trim());
    const runPaths = getRunPaths(jiraRun.runId, fakeHome);
    const context = JSON.parse(await readFile(runPaths.contextFile, 'utf8'));

    expect(verificationOutput).toMatchObject({
      command: 'run provide-verification',
      runId: jiraRun.runId,
    });
    expect(previewOutput).toMatchObject({
      command: 'run preview-write',
      runId: jiraRun.runId,
      stage: 'Artifact Linking',
      dryRun: true,
      dryRunArtifactTag: DRY_RUN_PERSISTENCE_POLICY.dryRunArtifactTag,
    });
    expect(executeOutput).toMatchObject({
      command: 'run execute-write',
      runId: jiraRun.runId,
      stage: 'Artifact Linking',
      previewRef: previewOutput.previewRef,
    });
    expect(context).toMatchObject({
      current_stage: 'Artifact Linking',
      run_mode: 'jira_writeback_only',
      run_lifecycle_status: 'completed',
      run_outcome_status: 'success',
      jira_writeback_draft_ref: previewOutput.previewRef,
      jira_writeback_result_ref: executeOutput.resultRef,
      stage_status_map: {
        Execution: 'completed',
        'Artifact Linking': 'completed',
        'Knowledge Recording': 'skipped',
      },
    });
    expect(collector.getStderr()).toBe('');
  });

  it('lets the feishu recording subworkflow complete independently from the main flow', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-cli-writeback-feishu-'));
    await seedCompleteProjectProfile(fakeHome);
    const collector = createOutputCollector();
    const program = bootstrapCli({
      io: collector.io,
      env: {
        ...process.env,
        BUGFIX_ORCHESTRATOR_HOME: fakeHome,
      },
    });

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'record',
      'feishu',
      '--project',
      'proj-a',
      '--json',
      '--dry-run',
    ]);

    const feishuRun = JSON.parse(collector.getStdout().trim());
    collector.reset();

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'preview-write',
      '--run',
      feishuRun.runId,
      '--stage',
      'Knowledge Recording',
      '--json',
      '--dry-run',
    ]);

    const previewOutput = JSON.parse(collector.getStdout().trim());
    collector.reset();

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'approve',
      '--run',
      feishuRun.runId,
      '--stage',
      'Knowledge Recording',
      '--preview-ref',
      previewOutput.previewRef,
      '--json',
    ]);
    collector.reset();

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'execute-write',
      '--run',
      feishuRun.runId,
      '--stage',
      'Knowledge Recording',
      '--preview-ref',
      previewOutput.previewRef,
      '--confirm',
      previewOutput.previewHash,
      '--non-interactive',
      '--json',
    ]);

    const executeOutput = JSON.parse(collector.getStdout().trim());
    const runPaths = getRunPaths(feishuRun.runId, fakeHome);
    const context = JSON.parse(await readFile(runPaths.contextFile, 'utf8'));

    expect(feishuRun).toMatchObject({
      command: 'record feishu',
      runMode: 'feishu_record_only',
      currentStage: 'Knowledge Recording',
      dryRun: true,
      dryRunArtifactTag: DRY_RUN_PERSISTENCE_POLICY.dryRunArtifactTag,
    });
    expect(previewOutput).toMatchObject({
      command: 'run preview-write',
      runId: feishuRun.runId,
      stage: 'Knowledge Recording',
      dryRun: true,
    });
    expect(executeOutput).toMatchObject({
      command: 'run execute-write',
      runId: feishuRun.runId,
      stage: 'Knowledge Recording',
      previewRef: previewOutput.previewRef,
    });
    expect(context).toMatchObject({
      current_stage: 'Knowledge Recording',
      run_mode: 'feishu_record_only',
      run_lifecycle_status: 'completed',
      run_outcome_status: 'success',
      feishu_record_draft_ref: previewOutput.previewRef,
      feishu_record_result_ref: executeOutput.resultRef,
      stage_status_map: {
        'Artifact Linking': 'skipped',
        'Knowledge Recording': 'completed',
      },
    });
    expect(collector.getStderr()).toBe('');
  });
});
