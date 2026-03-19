import {
  RequirementBriefSchema,
  RequirementReferenceSchema,
  RequirementSynthesisStageResultSchema,
  type JiraIssueSnapshot,
  type ProjectContextData,
  type ProjectProfile,
  type RequirementBrief,
  type RequirementSynthesisStageResult,
} from '../../domain/index.js';

type SynthesizeRequirementBriefInput = {
  projectProfile: ProjectProfile;
  issueSnapshot: JiraIssueSnapshot;
  projectContext: ProjectContextData;
  generatedAt?: string;
};

const defaultGeneratedAt = () => new Date().toISOString();

const buildKnownContext = ({
  issueSnapshot,
  projectContext,
}: Pick<SynthesizeRequirementBriefInput, 'issueSnapshot' | 'projectContext'>) => {
  const moduleSummary =
    projectContext.repo_selection.module_candidates.length > 0
      ? projectContext.repo_selection.module_candidates.join(', ')
      : 'none identified yet';

  return [
    `Issue summary: ${issueSnapshot.summary}`,
    `Issue status: ${issueSnapshot.status_name}`,
    `Requirement source: ${projectContext.requirement_source_ref}`,
    `Repo path: ${projectContext.repo_selection.repo_path}`,
    `Module candidates: ${moduleSummary}`,
    `GitLab target: ${projectContext.gitlab_project_id}@${projectContext.gitlab_default_branch}`,
  ];
};

const buildPendingQuestions = ({
  issueSnapshot,
  projectContext,
}: Pick<SynthesizeRequirementBriefInput, 'issueSnapshot' | 'projectContext'>) => {
  const questions: string[] = [];

  if (projectContext.requirement.requirement_binding_status === 'unresolved') {
    questions.push(
      `Which requirement should ${issueSnapshot.issue_key} bind to before Jira or Feishu writeback is attempted?`,
    );
  }

  if (projectContext.repo_selection.module_candidates.length === 0) {
    questions.push(
      `Which module should be investigated first for ${issueSnapshot.issue_key}?`,
    );
  }

  return questions;
};

const buildRequirementBrief = ({
  issueSnapshot,
  projectContext,
  generatedAt,
}: Pick<
  SynthesizeRequirementBriefInput,
  'issueSnapshot' | 'projectContext' | 'generatedAt'
>): RequirementBrief =>
  RequirementBriefSchema.parse({
    issue_key: issueSnapshot.issue_key,
    project_id: projectContext.project_id,
    linked_requirement:
      projectContext.requirement.requirement_binding_status === 'resolved'
        ? RequirementReferenceSchema.parse(projectContext.requirement)
        : null,
    requirement_binding_status: projectContext.requirement.requirement_binding_status,
    binding_reason: projectContext.requirement.binding_reason,
    known_context: buildKnownContext({ issueSnapshot, projectContext }),
    fix_goal:
      `Clarify the bug scope for ${issueSnapshot.issue_key} and prepare a reviewable repair brief before downstream code analysis.`,
    pending_questions: buildPendingQuestions({ issueSnapshot, projectContext }),
    generated_at: generatedAt,
    source_refs: [
      `jira:${issueSnapshot.issue_key}`,
      `project-profile:${projectContext.project_id}`,
      `requirements-source:${projectContext.requirement_source_ref}`,
      `repo:${projectContext.repo_selection.repo_path}`,
    ],
  });

export const synthesizeRequirementBrief = ({
  projectProfile,
  issueSnapshot,
  projectContext,
  generatedAt = defaultGeneratedAt(),
}: SynthesizeRequirementBriefInput): RequirementSynthesisStageResult => {
  const brief = buildRequirementBrief({
    issueSnapshot,
    projectContext,
    generatedAt,
  });
  const unresolved = brief.requirement_binding_status === 'unresolved';
  const warnings =
    unresolved && projectProfile.approval_policy.requirement_binding_required
      ? [
          'Requirement binding remains unresolved; external write stages must block until a requirement is explicitly bound for this project.',
        ]
      : [];

  return RequirementSynthesisStageResultSchema.parse({
    status: 'completed',
    summary: `Generated Requirement Brief for ${brief.issue_key} with ${brief.requirement_binding_status} requirement binding.`,
    data: brief,
    warnings,
    errors: [],
    waiting_for: null,
    source_refs: brief.source_refs,
    generated_at: generatedAt,
  });
};
