import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { bootstrapCli } from '../../../src/app/index.js';
import { getProjectProfilePath } from '../../../src/storage/index.js';

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

const createCompleteProjectSection = () => ({
  project_name: 'Project A',
  config_version: '2026-03-19',
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

const createCompleteProfileSections = () => ({
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
});

describe('CLI config commands', () => {
  it('bind project writes only project profile state and does not create a run', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-cli-bind-project-'));
    const fixtureDir = await mkdtemp(path.join(tmpdir(), 'bfo-cli-bind-fixtures-'));
    const collector = createOutputCollector();
    const projectFile = await writeJsonFixture(
      fixtureDir,
      'project.json',
      createCompleteProjectSection(),
    );
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
      'bind',
      'project',
      '--project',
      'proj-a',
      '--file',
      projectFile,
      '--json',
    ]);

    const storedProfilePath = getProjectProfilePath('proj-a', fakeHome);
    const storedProfile = JSON.parse(await readFile(storedProfilePath, 'utf8'));

    expect(storedProfile).toMatchObject({
      project_id: 'proj-a',
      project_name: 'Project A',
      config_version: '2026-03-19',
    });
    expect(JSON.parse(collector.getStdout())).toMatchObject({
      command: 'bind project',
      projectId: 'proj-a',
      validation: {
        ready: false,
      },
    });
    await expect(
      access(path.join(fakeHome, '.local', 'share', 'bugfix-orchestrator', 'runs')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(collector.getStderr()).toBe('');
  });

  it('bind section commands merge explicit configuration updates and inspect stays read only', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-cli-bind-sections-'));
    const fixtureDir = await mkdtemp(path.join(tmpdir(), 'bfo-cli-bind-section-files-'));
    const collector = createOutputCollector();
    const program = bootstrapCli({
      io: collector.io,
      env: {
        ...process.env,
        BUGFIX_ORCHESTRATOR_HOME: fakeHome,
      },
    });
    const sections = createCompleteProfileSections();

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'bind',
      'project',
      '--project',
      'proj-a',
      '--file',
      await writeJsonFixture(fixtureDir, 'project.json', createCompleteProjectSection()),
      '--json',
    ]);
    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'bind',
      'jira',
      '--project',
      'proj-a',
      '--file',
      await writeJsonFixture(fixtureDir, 'jira.json', sections.jira),
      '--json',
    ]);
    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'bind',
      'requirements',
      '--project',
      'proj-a',
      '--file',
      await writeJsonFixture(fixtureDir, 'requirements.json', sections.requirements),
      '--json',
    ]);
    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'bind',
      'gitlab',
      '--project',
      'proj-a',
      '--file',
      await writeJsonFixture(fixtureDir, 'gitlab.json', sections.gitlab),
      '--json',
    ]);
    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'bind',
      'feishu',
      '--project',
      'proj-a',
      '--file',
      await writeJsonFixture(fixtureDir, 'feishu.json', sections.feishu),
      '--json',
    ]);
    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'bind',
      'repo',
      '--project',
      'proj-a',
      '--file',
      await writeJsonFixture(fixtureDir, 'repo.json', sections.repo),
      '--json',
    ]);

    const storedProfilePath = getProjectProfilePath('proj-a', fakeHome);
    const beforeInspect = await readFile(storedProfilePath, 'utf8');

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'inspect',
      'graph',
      '--project',
      'proj-a',
      '--json',
    ]);
    const graphOutput = JSON.parse(collector.getStdout().trim().split('\n').at(-1) ?? '{}');

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'inspect',
      'connectors',
      '--project',
      'proj-a',
      '--json',
    ]);
    const connectorsOutput = JSON.parse(
      collector.getStdout().trim().split('\n').at(-1) ?? '{}',
    );

    await program.parseAsync([
      'node',
      'bugfix-orchestrator',
      'inspect',
      'config',
      '--project',
      'proj-a',
      '--json',
    ]);
    const configOutput = JSON.parse(collector.getStdout().trim().split('\n').at(-1) ?? '{}');
    const afterInspect = await readFile(storedProfilePath, 'utf8');

    expect(graphOutput).toMatchObject({
      command: 'inspect graph',
      projectId: 'proj-a',
      graph: {
        jiraProjectKey: 'BUG',
        requirementSourceRef: 'doc://feishu/project-a',
        gitlabProjectId: 'group/project-a',
        feishuDocId: 'doc-1',
        repoLocalPath: '/workspace/project-a',
      },
    });
    expect(connectorsOutput).toMatchObject({
      command: 'inspect connectors',
      projectId: 'proj-a',
      connectors: {
        jira: { status: 'ready' },
        requirements: { status: 'ready' },
        gitlab: { status: 'ready' },
        feishu: { status: 'ready' },
        repo: { status: 'missing_dependency' },
      },
    });
    expect(configOutput).toMatchObject({
      command: 'inspect config',
      projectId: 'proj-a',
      validation: {
        ready: true,
        missingFields: [],
      },
    });
    expect(beforeInspect).toBe(afterInspect);
  });
});
