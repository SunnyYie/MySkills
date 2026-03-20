import { writeFile } from 'node:fs/promises';

import { RequirementBriefSchema } from '../domain/index.js';
import {
  renderRequirementBriefCli,
  renderRequirementBriefMarkdown,
} from '../renderers/index.js';
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
  const requirementBrief =
    typeof payload === 'object' &&
    payload !== null &&
    'requirementBrief' in payload
      ? RequirementBriefSchema.safeParse(payload.requirementBrief).data ?? null
      : null;
  const rendered =
    asJson
      ? `${JSON.stringify(payload)}\n`
      : requirementBrief
        ? `${renderRequirementBriefCli(requirementBrief)}\n`
        : `${JSON.stringify(payload, null, 2)}\n`;
  const renderedForOutput =
    asJson
      ? rendered
      : requirementBrief
        ? `${renderRequirementBriefMarkdown(requirementBrief)}\n`
        : rendered;

  if (outputPath) {
    await writeFile(outputPath, renderedForOutput, 'utf8');
  }

  runtime.io.writeStdout(rendered);
};
