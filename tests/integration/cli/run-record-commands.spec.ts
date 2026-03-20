import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { bootstrapCli } from '../../../src/app/index.js';
import {
  DRY_RUN_PERSISTENCE_POLICY,
  getProjectProfilePath,
  getRunPaths,
  readCheckpointRecords,
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

const seedDetailedJiraIssueFixture = async ({
  homeDir,
  issueKey,
  summary,
  description,
  labels,
  requirementSources,
}: {
  homeDir: string;
  issueKey: string;
  summary: string;
  description: string;
  labels: string[];
  requirementSources: Record<string, string[]>;
}) => {
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
    summary,
    description,
    status_name: 'In Progress',
    labels,
    requirement_sources: requirementSources,
    source_url: `https://jira.example.com/browse/${issueKey}`,
  });
};

const writeRepoFixture = async ({
  repoPath,
  relativePath,
  contents,
}: {
  repoPath: string;
  relativePath: string;
  contents: string;
}) => {
  const targetPath = path.join(repoPath, relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, contents, 'utf8');
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
    await seedJiraIssueFixture(fakeHome, 'BUG-123');
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
    await seedJiraIssueFixture(fakeHome, 'BUG-100');
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

  it('persists the Jira snapshot as an Intake artifact when a run starts from an issue key', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-cli-jira-snapshot-'));
    await seedCompleteProjectProfile(fakeHome);
    await seedJiraIssueFixture(fakeHome, 'BUG-120');
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
      'start',
      '--project',
      'proj-a',
      '--issue',
      'BUG-120',
      '--json',
    ]);

    const output = JSON.parse(collector.getStdout().trim());
    const runPaths = getRunPaths(output.runId, fakeHome);
    const context = JSON.parse(await readFile(runPaths.contextFile, 'utf8'));
    const artifactPath = path.join(
      runPaths.artifactsDir,
      'jira-issue-snapshot-BUG-120.json',
    );
    const snapshot = JSON.parse(await readFile(artifactPath, 'utf8'));

    expect(output).toMatchObject({
      command: 'run start',
      exitCode: 0,
      currentStage: 'Context Resolution',
    });
    expect(context).toMatchObject({
      active_bug_issue_key: 'BUG-120',
      jira_issue_snapshot_ref: 'artifact://jira/issues/BUG-120',
    });
    expect(context.stage_artifact_refs.Intake).toEqual(
      expect.arrayContaining(['artifact://jira/issues/BUG-120']),
    );
    expect(snapshot).toMatchObject({
      issue_key: 'BUG-120',
      status_name: 'In Progress',
      description: 'Description for BUG-120',
      labels: ['bug', 'module:api'],
    });
  });

  it('orchestrates the upstream analysis stages during run start before the first approval gate', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-cli-main-flow-'));
    const repoPath = await mkdtemp(path.join(tmpdir(), 'bfo-cli-main-flow-repo-'));
    await writeRepoFixture({
      repoPath,
      relativePath: 'src/api/coupon-validator.ts',
      contents: [
        'export const validateCouponStack = () => {',
        '  return "coupon combination submit validation for checkout api";',
        '};',
      ].join('\n'),
    });
    await writeJsonAtomically(getProjectProfilePath('proj-a', fakeHome), {
      ...createCompleteProjectProfile(),
      repo: {
        local_path: repoPath,
        module_rules: [{ module_id: 'api', path_pattern: 'src/api/**' }],
      },
    });
    await seedDetailedJiraIssueFixture({
      homeDir: fakeHome,
      issueKey: 'BUG-130',
      summary: 'API coupon validation rejects valid combinations',
      description:
        'Checkout submit fails when coupon validation runs for loyalty and campaign combinations.',
      labels: ['bug', 'module:api'],
      requirementSources: {
        issue_link: ['REQ-130'],
      },
    });
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
      'start',
      '--project',
      'proj-a',
      '--issue',
      'BUG-130',
      '--json',
    ]);

    const output = JSON.parse(collector.getStdout().trim());
    const runPaths = getRunPaths(output.runId, fakeHome);
    const context = JSON.parse(await readFile(runPaths.contextFile, 'utf8'));

    expect(output).toMatchObject({
      command: 'run start',
      exitCode: 0,
      currentStage: 'Requirement Synthesis',
    });
    expect(context).toMatchObject({
      current_stage: 'Requirement Synthesis',
      run_lifecycle_status: 'waiting_approval',
      active_bug_issue_key: 'BUG-130',
      requirement_refs: [
        {
          requirement_ref: 'REQ-130',
          requirement_binding_status: 'resolved',
        },
      ],
      repo_selection: {
        repo_path: repoPath,
        module_candidates: ['api'],
      },
    });
    expect(context.code_targets).toEqual([]);
    expect(context.root_cause_hypotheses).toEqual([]);
    expect(context.fix_plan).toEqual([]);
    expect(context.verification_plan).toEqual([]);
  });

  it('persists stage artifacts, checkpoints, and status transitions through the first approval gate', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-cli-analysis-artifacts-'));
    const repoPath = await mkdtemp(path.join(tmpdir(), 'bfo-cli-analysis-artifacts-repo-'));
    await writeRepoFixture({
      repoPath,
      relativePath: 'src/api/coupon-validator.ts',
      contents: [
        'export const validateCouponStack = () => {',
        '  return "coupon combination submit validation for checkout api";',
        '};',
      ].join('\n'),
    });
    await writeJsonAtomically(getProjectProfilePath('proj-a', fakeHome), {
      ...createCompleteProjectProfile(),
      repo: {
        local_path: repoPath,
        module_rules: [{ module_id: 'api', path_pattern: 'src/api/**' }],
      },
    });
    await seedDetailedJiraIssueFixture({
      homeDir: fakeHome,
      issueKey: 'BUG-131',
      summary: 'API coupon validation rejects valid combinations',
      description:
        'Checkout submit fails when coupon validation runs for loyalty and campaign combinations.',
      labels: ['bug', 'module:api'],
      requirementSources: {
        issue_link: ['REQ-131'],
      },
    });
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
      'start',
      '--project',
      'proj-a',
      '--issue',
      'BUG-131',
      '--json',
    ]);

    const output = JSON.parse(collector.getStdout().trim());
    const runPaths = getRunPaths(output.runId, fakeHome);
    const context = JSON.parse(await readFile(runPaths.contextFile, 'utf8'));
    const checkpoints = await readCheckpointRecords(runPaths.checkpointsDir);

    expect(context.stage_status_map).toMatchObject({
      Intake: 'completed',
      'Context Resolution': 'completed',
      'Requirement Synthesis': 'waiting_approval',
    });
    expect(context.stage_artifact_refs.Intake).toHaveLength(2);
    expect(context.stage_artifact_refs['Context Resolution']).toHaveLength(1);
    expect(context.stage_artifact_refs['Requirement Synthesis']).toHaveLength(1);
    expect(context.stage_artifact_refs['Code Localization']).toBeUndefined();
    expect(context.stage_artifact_refs['Fix Planning']).toBeUndefined();
    expect(checkpoints).toHaveLength(4);
    expect(checkpoints.at(-1)).toMatchObject({
      current_stage: 'Requirement Synthesis',
      stage_status_map: {
        Intake: 'completed',
        'Context Resolution': 'completed',
        'Requirement Synthesis': 'waiting_approval',
      },
    });
  });

  it('stops at analysis approval gates and only hands off to Execution after both approvals are recorded', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-cli-analysis-approval-'));
    const repoPath = await mkdtemp(path.join(tmpdir(), 'bfo-cli-analysis-approval-repo-'));
    await writeRepoFixture({
      repoPath,
      relativePath: 'src/api/coupon-validator.ts',
      contents: [
        'export const validateCouponStack = () => {',
        '  return "coupon combination submit validation for checkout api";',
        '};',
      ].join('\n'),
    });
    await writeJsonAtomically(getProjectProfilePath('proj-a', fakeHome), {
      ...createCompleteProjectProfile(),
      repo: {
        local_path: repoPath,
        module_rules: [{ module_id: 'api', path_pattern: 'src/api/**' }],
      },
    });
    await seedDetailedJiraIssueFixture({
      homeDir: fakeHome,
      issueKey: 'BUG-132',
      summary: 'API coupon validation rejects valid combinations',
      description:
        'Checkout submit fails when coupon validation runs for loyalty and campaign combinations.',
      labels: ['bug', 'module:api'],
      requirementSources: {
        issue_link: ['REQ-132'],
      },
    });
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
      'start',
      '--project',
      'proj-a',
      '--issue',
      'BUG-132',
      '--json',
    ]);

    const startOutput = JSON.parse(collector.getStdout().trim());
    const runPaths = getRunPaths(startOutput.runId, fakeHome);
    const startContext = JSON.parse(await readFile(runPaths.contextFile, 'utf8'));

    expect(startOutput).toMatchObject({
      command: 'run start',
      currentStage: 'Requirement Synthesis',
      waitingReason: null,
    });
    expect(startContext).toMatchObject({
      current_stage: 'Requirement Synthesis',
      run_lifecycle_status: 'waiting_approval',
      stage_status_map: {
        Intake: 'completed',
        'Context Resolution': 'completed',
        'Requirement Synthesis': 'waiting_approval',
      },
    });

    collector.reset();
    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'status',
      '--run',
      startOutput.runId,
      '--json',
    ]);
    const waitingApprovalStatus = JSON.parse(collector.getStdout().trim());
    expect(waitingApprovalStatus.allowedActions).toEqual(
      expect.arrayContaining(['run approve', 'run reject', 'run revise']),
    );

    const requirementPreviewRef =
      startContext.stage_artifact_refs['Requirement Synthesis'][0];
    collector.reset();
    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'approve',
      '--run',
      startOutput.runId,
      '--stage',
      'Requirement Synthesis',
      '--preview-ref',
      requirementPreviewRef,
      '--json',
    ]);

    const postRequirementApproval = JSON.parse(
      await readFile(runPaths.contextFile, 'utf8'),
    );
    expect(postRequirementApproval).toMatchObject({
      current_stage: 'Fix Planning',
      run_lifecycle_status: 'waiting_approval',
      stage_status_map: {
        'Requirement Synthesis': 'completed',
        'Code Localization': 'completed',
        'Fix Planning': 'waiting_approval',
      },
    });

    const fixPlanningPreviewRef =
      postRequirementApproval.stage_artifact_refs['Fix Planning'][0];
    collector.reset();
    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'approve',
      '--run',
      startOutput.runId,
      '--stage',
      'Fix Planning',
      '--preview-ref',
      fixPlanningPreviewRef,
      '--json',
    ]);

    const executionReadyContext = JSON.parse(
      await readFile(runPaths.contextFile, 'utf8'),
    );
    expect(executionReadyContext).toMatchObject({
      current_stage: 'Execution',
      run_lifecycle_status: 'waiting_external_input',
      waiting_reason: 'gitlab_artifacts,verification_results,branch_binding',
      stage_status_map: {
        'Fix Planning': 'completed',
        Execution: 'waiting_external_input',
      },
    });
  });

  it('keeps revise, resume, and repeated approval semantics stable across analysis approval gates', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-cli-analysis-revise-'));
    const repoPath = await mkdtemp(path.join(tmpdir(), 'bfo-cli-analysis-revise-repo-'));
    await writeRepoFixture({
      repoPath,
      relativePath: 'src/api/coupon-validator.ts',
      contents: [
        'export const validateCouponStack = () => {',
        '  return "coupon combination submit validation for checkout api";',
        '};',
      ].join('\n'),
    });
    await writeJsonAtomically(getProjectProfilePath('proj-a', fakeHome), {
      ...createCompleteProjectProfile(),
      repo: {
        local_path: repoPath,
        module_rules: [{ module_id: 'api', path_pattern: 'src/api/**' }],
      },
    });
    await seedDetailedJiraIssueFixture({
      homeDir: fakeHome,
      issueKey: 'BUG-133',
      summary: 'API coupon validation rejects valid combinations',
      description:
        'Checkout submit fails when coupon validation runs for loyalty and campaign combinations.',
      labels: ['bug', 'module:api'],
      requirementSources: {
        issue_link: ['REQ-133'],
      },
    });
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
      'start',
      '--project',
      'proj-a',
      '--issue',
      'BUG-133',
      '--json',
    ]);

    const startOutput = JSON.parse(collector.getStdout().trim());
    const runPaths = getRunPaths(startOutput.runId, fakeHome);
    const startContext = JSON.parse(await readFile(runPaths.contextFile, 'utf8'));
    const requirementPreviewRef =
      startContext.stage_artifact_refs['Requirement Synthesis'][0];

    collector.reset();
    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'approve',
      '--run',
      startOutput.runId,
      '--stage',
      'Requirement Synthesis',
      '--preview-ref',
      requirementPreviewRef,
      '--json',
    ]);

    const approvedContext = JSON.parse(await readFile(runPaths.contextFile, 'utf8'));
    const fixPlanningArtifactCount =
      approvedContext.stage_artifact_refs['Fix Planning']?.length ?? 0;

    collector.reset();
    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'approve',
      '--run',
      startOutput.runId,
      '--stage',
      'Requirement Synthesis',
      '--preview-ref',
      requirementPreviewRef,
      '--json',
    ]);

    const duplicateApprovalOutput = JSON.parse(collector.getStdout().trim());
    const duplicateApprovalContext = JSON.parse(
      await readFile(runPaths.contextFile, 'utf8'),
    );
    expect(duplicateApprovalOutput).toMatchObject({
      command: 'run approve',
      exitCode: 2,
      error: {
        category: 'validation_error',
      },
    });
    expect(
      duplicateApprovalContext.stage_artifact_refs['Fix Planning']?.length ?? 0,
    ).toBe(fixPlanningArtifactCount);

    collector.reset();
    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'revise',
      '--run',
      startOutput.runId,
      '--rollback-to',
      'Requirement Synthesis',
      '--json',
    ]);

    const revisedContext = JSON.parse(await readFile(runPaths.contextFile, 'utf8'));
    expect(revisedContext).toMatchObject({
      current_stage: 'Requirement Synthesis',
      run_lifecycle_status: 'active',
      run_outcome_status: 'in_progress',
      stage_status_map: {
        'Requirement Synthesis': 'not_started',
        'Code Localization': 'stale',
        'Fix Planning': 'stale',
      },
    });
    expect(revisedContext.stage_artifact_refs['Requirement Synthesis']).toBeUndefined();
    expect(revisedContext.stage_artifact_refs['Code Localization']).toBeUndefined();
    expect(revisedContext.stage_artifact_refs['Fix Planning']).toBeUndefined();

    collector.reset();
    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'run',
      'resume',
      '--run',
      startOutput.runId,
      '--json',
    ]);

    const resumeOutput = JSON.parse(collector.getStdout().trim());
    expect(resumeOutput).toMatchObject({
      command: 'run resume',
      runId: startOutput.runId,
      currentStage: 'Requirement Synthesis',
      recovery: {
        action: 'resume_current_stage',
      },
    });
  });

  it('surfaces shared recovery and status semantics for record runs', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-cli-run-status-'));
    await seedCompleteProjectProfile(fakeHome);
    await seedJiraIssueFixture(fakeHome, 'BUG-456');
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
    await seedJiraIssueFixture(fakeHome, 'BUG-789');
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
    await seedJiraIssueFixture(fakeHome, 'BUG-810');
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
    await seedJiraIssueFixture(fakeHome, 'BUG-811');
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
