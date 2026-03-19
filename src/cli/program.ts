import { Command } from 'commander';

import { registerBindCommands } from './bind/register.js';
import { registerInspectCommands } from './inspect/register.js';

type CliIo = {
  writeStdout: (chunk: string) => void;
  writeStderr: (chunk: string) => void;
};

export type CliRuntimeOptions = {
  io: CliIo;
  env: NodeJS.ProcessEnv;
  homeDir?: string;
};

type CreateProgramOptions = {
  io?: CliIo;
  env?: NodeJS.ProcessEnv;
};

const defaultIo: CliIo = {
  writeStdout: (chunk) => {
    process.stdout.write(chunk);
  },
  writeStderr: (chunk) => {
    process.stderr.write(chunk);
  },
};

export function createProgram(options: CreateProgramOptions = {}) {
  const runtime: CliRuntimeOptions = {
    io: options.io ?? defaultIo,
    env: options.env ?? process.env,
    homeDir: (options.env ?? process.env).BUGFIX_ORCHESTRATOR_HOME,
  };

  const program = new Command()
    .name('bugfix-orchestrator')
    .description('CLI-first bugfix orchestration scaffold for v1.')
    .showHelpAfterError();

  program.configureOutput({
    writeOut: (chunk) => runtime.io.writeStdout(chunk),
    writeErr: (chunk) => runtime.io.writeStderr(chunk),
  });

  registerBindCommands(program, runtime);
  registerInspectCommands(program, runtime);

  return program;
}
