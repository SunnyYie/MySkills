import { createProgram } from '../cli/program.js';

type BootstrapCliOptions = Parameters<typeof createProgram>[0];

export function bootstrapCli(options?: BootstrapCliOptions) {
  return createProgram(options);
}
