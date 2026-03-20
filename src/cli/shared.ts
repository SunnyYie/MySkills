import { writeFile } from 'node:fs/promises';

import { BugfixReportSchema, RequirementBriefSchema } from '../domain/index.js';
import {
  renderBugfixReportCli,
  renderBugfixReportMarkdown,
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
  const bugfixReport =
    typeof payload === 'object' &&
    payload !== null &&
    'bugfixReport' in payload
      ? BugfixReportSchema.safeParse(payload.bugfixReport).data ?? null
      : null;
  const rendered =
    asJson
      ? `${JSON.stringify(payload)}\n`
      : bugfixReport
        ? `${renderBugfixReportCli(bugfixReport)}\n`
      : requirementBrief
        ? `${renderRequirementBriefCli(requirementBrief)}\n`
        : `${JSON.stringify(payload, null, 2)}\n`;
  const renderedForOutput =
    asJson
      ? rendered
      : bugfixReport
        ? `${renderBugfixReportMarkdown(bugfixReport)}\n`
      : requirementBrief
        ? `${renderRequirementBriefMarkdown(requirementBrief)}\n`
        : rendered;

  if (outputPath) {
    await writeFile(outputPath, renderedForOutput, 'utf8');
  }

  runtime.io.writeStdout(rendered);
};
