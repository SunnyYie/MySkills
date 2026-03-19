import { writeFile } from 'node:fs/promises';

import type { CliRuntimeOptions } from './program.js';

export const emitCliPayload = async ({
  runtime,
  payload,
  asJson,
  outputPath,
}: {
  runtime: CliRuntimeOptions;
  payload: unknown;
  asJson: boolean;
  outputPath?: string;
}) => {
  const rendered = asJson
    ? `${JSON.stringify(payload)}\n`
    : `${JSON.stringify(payload, null, 2)}\n`;

  if (outputPath) {
    await writeFile(outputPath, rendered, 'utf8');
  }

  runtime.io.writeStdout(rendered);
};
