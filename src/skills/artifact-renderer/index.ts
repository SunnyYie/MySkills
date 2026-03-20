import {
  BugfixReportSchema,
  RequirementBriefSchema,
} from '../../domain/index.js';
import {
  renderBugfixReportCli,
  renderBugfixReportJson,
  renderBugfixReportMarkdown,
  renderRequirementBriefCli,
  renderRequirementBriefMarkdown,
} from '../../renderers/index.js';

export const ARTIFACT_RENDERER_SKILL = 'artifact-renderer' as const;

export const renderArtifactDocument = ({
  artifactType,
  format,
  payload,
}: {
  artifactType: 'requirement_brief' | 'bugfix_report';
  format: 'cli' | 'markdown' | 'json';
  payload: unknown;
}) => {
  if (artifactType === 'requirement_brief') {
    const brief = RequirementBriefSchema.parse(payload);

    if (format === 'cli') {
      return renderRequirementBriefCli(brief);
    }

    if (format === 'markdown') {
      return renderRequirementBriefMarkdown(brief);
    }

    return JSON.stringify(brief, null, 2);
  }

  const report = BugfixReportSchema.parse(payload);

  if (format === 'cli') {
    return renderBugfixReportCli(report);
  }

  if (format === 'markdown') {
    return renderBugfixReportMarkdown(report);
  }

  return renderBugfixReportJson(report);
};
