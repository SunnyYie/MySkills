import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
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

const seedCompleteProjectProfile = async (homeDir: string, projectId = 'proj-a') => {
  await writeJsonAtomically(
    getProjectProfilePath(projectId, homeDir),
    {
      ...createCompleteProjectProfile(),
      project_id: projectId,
    },
  );
};

describe('CLI run and record commands', () => {
  it('exposes the required run and record command groups without invalid shortcut aliases', () => {
    const collector = createOutputCollector();
    const program = bootstrapCli({
      io: collector.io,
      env: process.env,
    });
    const runCommand = program.commands.find((command) => command.name() === 'run');
    const recordCommand = program.commands.find((command) => command.name() === 'record');

    expect(program.helpInformation()).toContain('bind');
    expect(program.helpInformation()).toContain('inspect');
    expect(program.helpInformation()).toContain('run');
    expect(program.helpInformation()).toContain('record');

    expect(runCommand?.helpInformation()).toContain('start');
    expect(runCommand?.helpInformation()).toContain('brief');
    expect(runCommand?.helpInformation()).toContain('resume');
    expect(runCommand?.helpInformation()).toContain('status');
    expect(runCommand?.helpInformation()).toContain('approve');
    expect(runCommand?.helpInformation()).toContain('revise');
    expect(runCommand?.helpInformation()).toContain('reject');
    expect(runCommand?.helpInformation()).toContain('provide-artifact');
    expect(runCommand?.helpInformation()).toContain('provide-verification');
    expect(runCommand?.helpInformation()).toContain('bind-branch');
    expect(runCommand?.helpInformation()).toContain('ensure-subtask');
    expect(runCommand?.helpInformation()).toContain('provide-fix-commit');
    expect(runCommand?.helpInformation()).toContain('preview-write');
    expect(runCommand?.helpInformation()).toContain('execute-write');

    expect(recordCommand?.helpInformation()).toContain('jira');
    expect(recordCommand?.helpInformation()).toContain('feishu');
    expect(recordCommand?.helpInformation()).not.toContain('brief');
  });

  it('creates brief-only and jira-writeback-only runs without bypassing shared workflow state', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-cli-run-record-'));
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
      'run',
      'brief',
      '--project',
      'proj-a',
      '--issue',
      'BUG-123',
      '--json',
      '--dry-run',
    ]);

    const briefOutput = JSON.parse(collector.getStdout().trim());
    const briefRunPaths = getRunPaths(briefOutput.runId, fakeHome);
    const briefContext = JSON.parse(await readFile(briefRunPaths.contextFile, 'utf8'));

    expect(briefOutput).toMatchObject({
      command: 'run brief',
      runMode: 'brief_only',
      dryRun: true,
      dryRunArtifactTag: DRY_RUN_PERSISTENCE_POLICY.dryRunArtifactTag,
    });
    expect(briefContext).toMatchObject({
      run_mode: 'brief_only',
      current_stage: 'Intake',
      stage_status_map: {
        'Code Localization': 'skipped',
        'Fix Planning': 'skipped',
        Execution: 'skipped',
        'Artifact Linking': 'skipped',
        'Knowledge Recording': 'skipped',
      },
    });

    collector.reset();

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'record',
      'jira',
      '--project',
      'proj-a',
      '--issue',
      'BUG-123',
      '--json',
    ]);

    const jiraOutput = JSON.parse(collector.getStdout().trim());
    const jiraRunPaths = getRunPaths(jiraOutput.runId, fakeHome);
    const jiraContext = JSON.parse(await readFile(jiraRunPaths.contextFile, 'utf8'));

    expect(jiraOutput).toMatchObject({
      command: 'record jira',
      runMode: 'jira_writeback_only',
      currentStage: 'Execution',
      waitingReason: 'gitlab_artifacts,verification_results,branch_binding',
    });
    expect(jiraContext).toMatchObject({
      run_mode: 'jira_writeback_only',
      current_stage: 'Execution',
      run_lifecycle_status: 'waiting_external_input',
      stage_status_map: {
        Intake: 'skipped',
        'Context Resolution': 'skipped',
        'Requirement Synthesis': 'skipped',
        'Code Localization': 'skipped',
        'Fix Planning': 'skipped',
        Execution: 'waiting_external_input',
        'Artifact Linking': 'not_started',
        'Knowledge Recording': 'skipped',
      },
    });
    expect(collector.getStderr()).toBe('');
  });

  it('requires a ready project profile before run and record commands can create runs', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-cli-profile-gate-'));
    const collector = createOutputCollector();
    const program = bootstrapCli({
      io: collector.io,
      env: {
        ...process.env,
        BUGFIX_ORCHESTRATOR_HOME: fakeHome,
      },
    });
    const storedProfilePath = getProjectProfilePath('proj-a', fakeHome);

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'start',
      '--project',
      'proj-a',
      '--issue',
      'BUG-100',
      '--json',
    ]);

    const missingProfileOutput = JSON.parse(collector.getStdout().trim());
    expect(missingProfileOutput).toMatchObject({
      command: 'run start',
      exitCode: 10,
      error: {
        category: 'configuration_missing',
      },
    });
    await expect(
      access(path.join(fakeHome, '.local', 'share', 'bugfix-orchestrator', 'runs')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    collector.reset();

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'record',
      'feishu',
      '--project',
      'proj-a',
      '--json',
    ]);

    const missingFeishuProfileOutput = JSON.parse(collector.getStdout().trim());
    expect(missingFeishuProfileOutput).toMatchObject({
      command: 'record feishu',
      exitCode: 10,
      error: {
        category: 'configuration_missing',
      },
    });

    await writeJsonAtomically(storedProfilePath, {
      ...createCompleteProjectProfile(),
      config_version: 'v2',
    });
    collector.reset();

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'record',
      'jira',
      '--project',
      'proj-a',
      '--issue',
      'BUG-100',
      '--json',
    ]);

    const invalidProfileOutput = JSON.parse(collector.getStdout().trim());
    expect(invalidProfileOutput).toMatchObject({
      command: 'record jira',
      exitCode: 2,
      error: {
        category: 'validation_error',
        summary:
          'config_version must use YYYY-MM-DD so project profiles stay versionable and auditable.',
      },
    });
    await expect(
      access(path.join(fakeHome, '.local', 'share', 'bugfix-orchestrator', 'runs')),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    await writeJsonAtomically(storedProfilePath, createCompleteProjectProfile());
    collector.reset();

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'brief',
      '--project',
      'proj-a',
      '--issue',
      'BUG-100',
      '--json',
    ]);

    const repairedOutput = JSON.parse(collector.getStdout().trim());
    const repairedRunPaths = getRunPaths(repairedOutput.runId, fakeHome);
    const repairedContext = JSON.parse(
      await readFile(repairedRunPaths.contextFile, 'utf8'),
    );

    expect(repairedOutput).toMatchObject({
      command: 'run brief',
      exitCode: 0,
      runMode: 'brief_only',
    });
    expect(repairedOutput.runId).toEqual(expect.any(String));
    expect(repairedContext.config_version).toBe('2026-03-19');
  });

  it('surfaces shared recovery and status semantics for record runs', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-cli-run-status-'));
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
      'jira',
      '--project',
      'proj-a',
      '--issue',
      'BUG-456',
      '--json',
    ]);

    const { runId } = JSON.parse(collector.getStdout().trim());
    collector.reset();

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'status',
      '--run',
      runId,
      '--json',
    ]);

    const statusOutput = JSON.parse(collector.getStdout().trim());

    expect(statusOutput).toMatchObject({
      command: 'run status',
      runId,
      currentStage: 'Execution',
      stageStatus: 'waiting_external_input',
      runLifecycleStatus: 'waiting_external_input',
      waitingReason: 'gitlab_artifacts,verification_results,branch_binding',
    });
    expect(statusOutput.allowedActions).toContain('run provide-artifact');
    expect(statusOutput.allowedActions).toContain('run provide-verification');
    expect(statusOutput.allowedActions).toContain('run bind-branch');

    collector.reset();

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'resume',
      '--run',
      runId,
      '--json',
    ]);

    const resumeOutput = JSON.parse(collector.getStdout().trim());

    expect(resumeOutput).toMatchObject({
      command: 'run resume',
      runId,
      recovery: {
        action: 'await_external_input',
      },
    });
  });

  it('records a bound branch as Execution input and keeps the run waiting for the remaining inputs', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-cli-bind-branch-'));
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
      'jira',
      '--project',
      'proj-a',
      '--issue',
      'BUG-789',
      '--json',
    ]);

    const { runId } = JSON.parse(collector.getStdout().trim());
    collector.reset();

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'bind-branch',
      '--run',
      runId,
      '--branch',
      'bugfix/BUG-789',
      '--json',
    ]);

    const bindOutput = JSON.parse(collector.getStdout().trim());
    const runPaths = getRunPaths(runId, fakeHome);
    const context = JSON.parse(await readFile(runPaths.contextFile, 'utf8'));

    expect(bindOutput).toMatchObject({
      command: 'run bind-branch',
      runId,
      branchName: 'bugfix/BUG-789',
      issueKey: 'BUG-789',
      waitingReason: 'gitlab_artifacts,verification_results',
    });
    expect(bindOutput.bindingRef).toMatch(/^artifact:\/\/jira\/bindings\/branch\//);
    expect(context).toMatchObject({
      active_bug_issue_key: 'BUG-789',
      git_branch_binding_ref: bindOutput.bindingRef,
      current_stage: 'Execution',
      run_lifecycle_status: 'waiting_external_input',
      waiting_reason: 'gitlab_artifacts,verification_results',
      stage_status_map: {
        Execution: 'waiting_external_input',
      },
    });

    collector.reset();
    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'status',
      '--run',
      runId,
      '--json',
    ]);

    const statusOutput = JSON.parse(collector.getStdout().trim());
    expect(statusOutput.allowedActions).toContain('run provide-artifact');
    expect(statusOutput.allowedActions).toContain('run provide-verification');
    expect(statusOutput.allowedActions).not.toContain('run bind-branch');
  });

  it('requires Execution inputs before ensure-subtask can generate an Artifact Linking preview', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-cli-ensure-subtask-'));
    await seedCompleteProjectProfile(fakeHome);
    const fixtureDir = await mkdtemp(path.join(tmpdir(), 'bfo-cli-ensure-subtask-fixtures-'));
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
      'BUG-810',
      '--json',
    ]);

    const { runId } = JSON.parse(collector.getStdout().trim());
    collector.reset();

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'ensure-subtask',
      '--run',
      runId,
      '--json',
      '--dry-run',
    ]);

    const earlyAttempt = JSON.parse(collector.getStdout().trim());
    expect(earlyAttempt).toMatchObject({
      command: 'run ensure-subtask',
      exitCode: 2,
      error: {
        category: 'validation_error',
      },
    });

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
        created_at: '2026-03-20T10:25:00.000Z',
      },
    ]);
    const verificationFile = await writeJsonFixture(fixtureDir, 'verification.json', {
      outcome: 'passed',
      verification_summary: 'Regression path passed after the manual fix.',
      checks: [
        {
          name: 'coupon regression',
          status: 'passed',
        },
      ],
      input_source: 'manual_cli',
      recorded_at: '2026-03-20T10:26:00.000Z',
    });

    collector.reset();
    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'bind-branch',
      '--run',
      runId,
      '--branch',
      'bugfix/BUG-810',
      '--json',
    ]);
    collector.reset();

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'provide-artifact',
      '--run',
      runId,
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
      runId,
      '--file',
      verificationFile,
      '--json',
    ]);
    collector.reset();

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'ensure-subtask',
      '--run',
      runId,
      '--json',
      '--dry-run',
    ]);

    const ensureOutput = JSON.parse(collector.getStdout().trim());
    const runPaths = getRunPaths(runId, fakeHome);
    const context = JSON.parse(await readFile(runPaths.contextFile, 'utf8'));

    expect(ensureOutput).toMatchObject({
      command: 'run ensure-subtask',
      runId,
      issueKey: 'BUG-810',
      currentStage: 'Artifact Linking',
      stageStatus: 'output_ready',
      dryRun: true,
      dryRunArtifactTag: DRY_RUN_PERSISTENCE_POLICY.dryRunArtifactTag,
    });
    expect(ensureOutput.previewRef).toMatch(/^artifact:\/\/jira\/subtasks\/preview\//);
    expect(context).toMatchObject({
      active_bug_issue_key: 'BUG-810',
      current_stage: 'Artifact Linking',
      jira_subtask_ref: ensureOutput.previewRef,
      jira_subtask_result_ref: null,
      stage_status_map: {
        Execution: 'completed',
        'Artifact Linking': 'output_ready',
      },
    });
  });

  it('records fix commit ownership and resets Artifact Linking to regenerate preview', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-cli-fix-commit-'));
    await seedCompleteProjectProfile(fakeHome);
    const fixtureDir = await mkdtemp(path.join(tmpdir(), 'bfo-cli-fix-commit-fixtures-'));
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
      'BUG-811',
      '--json',
    ]);

    const { runId } = JSON.parse(collector.getStdout().trim());
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
        created_at: '2026-03-20T10:35:00.000Z',
      },
    ]);
    const verificationFile = await writeJsonFixture(fixtureDir, 'verification.json', {
      outcome: 'passed',
      verification_summary: 'Regression path passed after the manual fix.',
      checks: [
        {
          name: 'coupon regression',
          status: 'passed',
        },
      ],
      input_source: 'manual_cli',
      recorded_at: '2026-03-20T10:36:00.000Z',
    });

    collector.reset();
    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'bind-branch',
      '--run',
      runId,
      '--branch',
      'bugfix/BUG-811',
      '--json',
    ]);
    collector.reset();

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'provide-artifact',
      '--run',
      runId,
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
      runId,
      '--file',
      verificationFile,
      '--json',
    ]);
    collector.reset();

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'ensure-subtask',
      '--run',
      runId,
      '--json',
      '--dry-run',
    ]);
    collector.reset();

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'provide-fix-commit',
      '--run',
      runId,
      '--issue',
      'BUG-811',
      '--commit',
      '0123456789abcdef0123456789abcdef01234567',
      '--json',
    ]);

    const commitOutput = JSON.parse(collector.getStdout().trim());
    const runPaths = getRunPaths(runId, fakeHome);
    const context = JSON.parse(await readFile(runPaths.contextFile, 'utf8'));

    expect(commitOutput).toMatchObject({
      command: 'run provide-fix-commit',
      runId,
      issueKey: 'BUG-811',
      commitSha: '0123456789abcdef0123456789abcdef01234567',
      currentStage: 'Artifact Linking',
      stageStatus: 'not_started',
    });
    expect(commitOutput.bindingRef).toMatch(/^artifact:\/\/jira\/bindings\/commit\//);
    expect(context).toMatchObject({
      current_stage: 'Artifact Linking',
      git_commit_binding_refs: [commitOutput.bindingRef],
      stage_status_map: {
        Execution: 'completed',
        'Artifact Linking': 'not_started',
      },
    });

    collector.reset();
    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'status',
      '--run',
      runId,
      '--json',
    ]);

    const statusOutput = JSON.parse(collector.getStdout().trim());
    expect(statusOutput.currentStage).toBe('Artifact Linking');
    expect(statusOutput.stageStatus).toBe('not_started');
    expect(statusOutput.allowedActions).toContain('run preview-write');
    expect(statusOutput.allowedActions).toContain('run provide-fix-commit');
    expect(statusOutput.allowedActions).not.toContain('run approve');
  });
});
