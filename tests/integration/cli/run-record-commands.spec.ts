import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { bootstrapCli } from '../../../src/app/index.js';
import { DRY_RUN_PERSISTENCE_POLICY, getRunPaths } from '../../../src/storage/index.js';

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
    expect(runCommand?.helpInformation()).toContain('preview-write');
    expect(runCommand?.helpInformation()).toContain('execute-write');

    expect(recordCommand?.helpInformation()).toContain('jira');
    expect(recordCommand?.helpInformation()).toContain('feishu');
    expect(recordCommand?.helpInformation()).not.toContain('brief');
  });

  it('creates brief-only and jira-writeback-only runs without bypassing shared workflow state', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-cli-run-record-'));
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
      waitingReason: 'gitlab_artifacts,verification_results',
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

  it('surfaces shared recovery and status semantics for record runs', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-cli-run-status-'));
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
      waitingReason: 'gitlab_artifacts,verification_results',
    });
    expect(statusOutput.allowedActions).toContain('run provide-artifact');
    expect(statusOutput.allowedActions).toContain('run provide-verification');

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
});
