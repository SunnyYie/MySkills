import {
  CodeLocalizationStageResultSchema,
  type CodeLocalizationData,
  type CodeLocalizationStageResult,
  type JiraIssueSnapshot,
  type ProjectContextData,
  type ProjectProfile,
  type RequirementBrief,
} from '../../domain/index.js';
import { searchRepoWorkspace } from '../../infrastructure/repo/index.js';

type LocateCodeTargetsInput = {
  projectProfile: ProjectProfile;
  issueSnapshot: JiraIssueSnapshot;
  projectContext: ProjectContextData;
  requirementBrief: RequirementBrief;
  generatedAt?: string;
};

const defaultGeneratedAt = () => new Date().toISOString();

const buildRootCauseHypotheses = ({
  impact_modules: impactModules,
  code_targets: codeTargets,
}: Pick<CodeLocalizationData, 'impact_modules' | 'code_targets'>) => {
  if (codeTargets.length === 0) {
    return [];
  }

  const firstTarget = codeTargets[0];
  const primaryModule = impactModules[0] ?? 'the current repository area';
  const matchedKeyword = firstTarget.reason
    .replace(/^Matched /, '')
    .split(' in module ')[0]
    .split(',')[0]
    ?.trim();

  return [
    `The regression is likely concentrated in ${primaryModule} around ${matchedKeyword || 'the current issue signals'}.`,
  ];
};

export const locateCodeTargets = async ({
  projectProfile,
  issueSnapshot,
  projectContext,
  requirementBrief,
  generatedAt = defaultGeneratedAt(),
}: LocateCodeTargetsInput): Promise<CodeLocalizationStageResult> => {
  const matchedCandidates = await searchRepoWorkspace({
    projectProfile,
    repoSelection: projectContext.repo_selection,
    issueSnapshot,
    requirementBrief,
  });
  const impactModules =
    projectContext.repo_selection.module_candidates.length > 0
      ? projectContext.repo_selection.module_candidates
      : [...new Set(matchedCandidates.map((candidate) => candidate.module_id))];
  const localizationData: CodeLocalizationData = {
    impact_modules: impactModules,
    code_targets: matchedCandidates.map(({ file_path, reason }) => ({
      file_path,
      reason,
    })),
    root_cause_hypotheses: buildRootCauseHypotheses({
      impact_modules: impactModules,
      code_targets: matchedCandidates.map(({ file_path, reason }) => ({
        file_path,
        reason,
      })),
    }),
  };
  const sourceRefs = [
    `jira:${issueSnapshot.issue_key}`,
    `project-profile:${projectProfile.project_id}`,
    `repo:${projectContext.repo_selection.repo_path}`,
    `brief:${requirementBrief.issue_key}`,
  ];

  if (matchedCandidates.length === 0) {
    return CodeLocalizationStageResultSchema.parse({
      status: 'waiting',
      summary: `No candidate code target could be localized for ${issueSnapshot.issue_key} from current issue signals.`,
      data: localizationData,
      warnings: [
        'No repository file matched the current issue signals; manual code inspection is required before Fix Planning.',
      ],
      errors: [],
      waiting_for: 'manual_code_localization',
      source_refs: sourceRefs,
      generated_at: generatedAt,
    });
  }

  if (matchedCandidates.length > 1) {
    return CodeLocalizationStageResultSchema.parse({
      status: 'waiting',
      summary: `Located ${matchedCandidates.length} candidate code targets for ${issueSnapshot.issue_key}; manual narrowing is required.`,
      data: localizationData,
      warnings: [
        'Multiple repository files matched the current issue signals; manual narrowing is required before Fix Planning.',
      ],
      errors: [],
      waiting_for: 'manual_code_target_selection',
      source_refs: sourceRefs,
      generated_at: generatedAt,
    });
  }

  return CodeLocalizationStageResultSchema.parse({
    status: 'completed',
    summary: `Localized 1 candidate code target for ${issueSnapshot.issue_key}.`,
    data: localizationData,
    warnings: [],
    errors: [],
    waiting_for: null,
    source_refs: sourceRefs,
    generated_at: generatedAt,
  });
};
