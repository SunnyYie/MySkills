import { Command } from 'commander';

import { bindProjectProfileSectionFromFile } from '../../app/project-profile.js';
import type { CliRuntimeOptions } from '../program.js';

const BIND_SECTIONS = [
  'project',
  'jira',
  'requirements',
  'gitlab',
  'feishu',
  'repo',
] as const;

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

export const registerBindCommands = (
  program: Command,
  runtime: CliRuntimeOptions,
) => {
  const bind = program.command('bind').description('Maintain project profile bindings.');

  for (const section of BIND_SECTIONS) {
    bind
      .command(section)
      .requiredOption('--project <id>', 'project id')
      .requiredOption('--file <path>', 'JSON file containing the section payload')
      .option('--json', 'emit JSON output')
      .action(async (options: { project: string; file: string; json?: boolean }) => {
        const result = await bindProjectProfileSectionFromFile({
          projectId: options.project,
          section,
          filePath: options.file,
          homeDir: runtime.homeDir,
        });

        writeOutput(runtime, result, Boolean(options.json));
      });
  }
};
