import {
  RequirementBriefSchema,
  type RequirementBrief,
} from '../domain/index.js';

const renderList = (items: string[], emptyLabel = 'None') =>
  items.length === 0 ? emptyLabel : items.map((item) => `- ${item}`).join('\n');

const getRequirementLabel = (brief: RequirementBrief) =>
  brief.linked_requirement?.requirement_ref ??
  brief.linked_requirement?.requirement_id ??
  'Unresolved';

export const renderRequirementBriefCli = (input: RequirementBrief) => {
  const brief = RequirementBriefSchema.parse(input);

  return [
    'Requirement Brief',
    `Issue: ${brief.issue_key}`,
    `Project: ${brief.project_id}`,
    `Requirement: ${getRequirementLabel(brief)}`,
    `Requirement Binding Status: ${brief.requirement_binding_status}`,
    `Binding Reason: ${brief.binding_reason ?? 'None'}`,
    `Generated At: ${brief.generated_at}`,
    '',
    'Known Context',
    renderList(brief.known_context),
    '',
    'Fix Goal',
    brief.fix_goal,
    '',
    'Pending Questions',
    renderList(brief.pending_questions),
    '',
    'Source Refs',
    renderList(brief.source_refs),
  ].join('\n');
};

export const renderRequirementBriefMarkdown = (input: RequirementBrief) => {
  const brief = RequirementBriefSchema.parse(input);

  return [
    '# Requirement Brief',
    '',
    `- Issue Key: ${brief.issue_key}`,
    `- Project ID: ${brief.project_id}`,
    `- Requirement: ${getRequirementLabel(brief)}`,
    `- Requirement Binding Status: ${brief.requirement_binding_status}`,
    `- Binding Reason: ${brief.binding_reason ?? 'None'}`,
    `- Generated At: ${brief.generated_at}`,
    '',
    '## Known Context',
    renderList(brief.known_context),
    '',
    '## Fix Goal',
    '',
    brief.fix_goal,
    '',
    '## Pending Questions',
    renderList(brief.pending_questions),
    '',
    '## Source Refs',
    renderList(brief.source_refs),
  ].join('\n');
};
