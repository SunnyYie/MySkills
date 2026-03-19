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
      .action(
        async (options: {
          project: string;
          issue: string;
          json?: boolean;
          dryRun?: boolean;
          nonInteractive?: boolean;
          output?: string;
        }) => {
          const payload = await createCliRecordRun({
            workflow: 'jira',
            projectId: options.project,
            issueKey: options.issue,
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
      .action(
        async (options: {
          project: string;
          json?: boolean;
          dryRun?: boolean;
          nonInteractive?: boolean;
          output?: string;
        }) => {
          const payload = await createCliRecordRun({
            workflow: 'feishu',
            projectId: options.project,
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
