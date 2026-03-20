import { Command } from 'commander';

import { createCliRecordRun } from '../../app/cli-orchestration.js';
import type { CliRuntimeOptions } from '../program.js';
import { emitCliPayload } from '../shared.js';

const addSharedOptions = (command: Command) =>
  command
    .option('--json', 'emit JSON output')
    .option('--dry-run', 'mark the command as dry-run')
    .option('--non-interactive', 'disable interactive confirmations')
    .option('--output <path>', 'write the rendered output to a file');

export const registerRecordCommands = (
  program: Command,
  runtime: CliRuntimeOptions,
) => {
  const record = program.command('record').description('Create minimal subworkflow runs.');

  addSharedOptions(
    record
      .command('jira')
      .requiredOption('--project <id>', 'project id')
      .requiredOption('--issue <key>', 'issue key')
      .option('--branch <name>', 'development branch name to pre-bind')
      .option('--artifacts-file <path>', 'JSON file with GitLab artifact payload')
      .option('--verification-file <path>', 'JSON file with verification result payload')
      .action(
        async (options: {
          project: string;
          issue: string;
          branch?: string;
          artifactsFile?: string;
          verificationFile?: string;
          json?: boolean;
          dryRun?: boolean;
          nonInteractive?: boolean;
          output?: string;
        }) => {
          const payload = await createCliRecordRun({
            workflow: 'jira',
            projectId: options.project,
            issueKey: options.issue,
            branchName: options.branch,
            artifactFile: options.artifactsFile,
            verificationFile: options.verificationFile,
            homeDir: runtime.homeDir,
            dryRun: Boolean(options.dryRun),
            nonInteractive: Boolean(options.nonInteractive),
          });

          await emitCliPayload({
            runtime,
            payload,
            asJson: Boolean(options.json),
            outputPath: options.output,
          });
        },
      ),
  );

  addSharedOptions(
    record
      .command('feishu')
      .requiredOption('--project <id>', 'project id')
      .option('--issue <key>', 'manual issue key for the knowledge record')
      .option('--requirement-ref <ref>', 'resolved requirement reference override')
      .option('--problem <text>', 'problem summary for manual record mode')
      .option('--root-cause <text>', 'root cause summary for manual record mode')
      .option('--fix-summary <text>', 'fix summary for manual record mode')
      .option(
        '--verification-summary <text>',
        'verification summary for manual record mode',
      )
      .option(
        '--verification-outcome <outcome>',
        'verification outcome for manual record mode (passed|failed|mixed)',
      )
      .action(
        async (options: {
          project: string;
          issue?: string;
          requirementRef?: string;
          problem?: string;
          rootCause?: string;
          fixSummary?: string;
          verificationSummary?: string;
          verificationOutcome?: 'passed' | 'failed' | 'mixed';
          json?: boolean;
          dryRun?: boolean;
          nonInteractive?: boolean;
          output?: string;
        }) => {
          const payload = await createCliRecordRun({
            workflow: 'feishu',
            projectId: options.project,
            issueKey: options.issue,
            requirementRef: options.requirementRef,
            problemSummary: options.problem,
            rootCauseSummary: options.rootCause,
            fixSummary: options.fixSummary,
            verificationSummary: options.verificationSummary,
            verificationOutcome: options.verificationOutcome,
            homeDir: runtime.homeDir,
            dryRun: Boolean(options.dryRun),
            nonInteractive: Boolean(options.nonInteractive),
          });

          await emitCliPayload({
            runtime,
            payload,
            asJson: Boolean(options.json),
            outputPath: options.output,
          });
        },
      ),
  );
};
