import { Command } from 'commander';

import {
  inspectProjectConfig,
  inspectProjectConnectors,
  inspectProjectGraph,
} from '../../app/project-profile.js';
import type { CliRuntimeOptions } from '../program.js';

const writeOutput = (
  runtime: CliRuntimeOptions,
  payload: unknown,
  asJson: boolean,
) => {
  if (asJson) {
    runtime.io.writeStdout(`${JSON.stringify(payload)}\n`);
    return;
  }

  runtime.io.writeStdout(`${JSON.stringify(payload, null, 2)}\n`);
};

export const registerInspectCommands = (
  program: Command,
  runtime: CliRuntimeOptions,
) => {
  const inspect = program.command('inspect').description('Inspect configuration health.');

  inspect
    .command('config')
    .requiredOption('--project <id>', 'project id')
    .option('--json', 'emit JSON output')
    .action(async (options: { project: string; json?: boolean }) => {
      const result = await inspectProjectConfig({
        projectId: options.project,
        homeDir: runtime.homeDir,
      });

      writeOutput(runtime, result, Boolean(options.json));
    });

  inspect
    .command('graph')
    .requiredOption('--project <id>', 'project id')
    .option('--json', 'emit JSON output')
    .action(async (options: { project: string; json?: boolean }) => {
      const result = await inspectProjectGraph({
        projectId: options.project,
        homeDir: runtime.homeDir,
      });

      writeOutput(runtime, result, Boolean(options.json));
    });

  inspect
    .command('connectors')
    .requiredOption('--project <id>', 'project id')
    .option('--json', 'emit JSON output')
    .action(async (options: { project: string; json?: boolean }) => {
      const result = await inspectProjectConnectors({
        projectId: options.project,
        homeDir: runtime.homeDir,
      });

      writeOutput(runtime, result, Boolean(options.json));
    });
};
