import {
  ProjectContextStageResultSchema,
  RequirementReferenceSchema,
  type JiraIssueSnapshot,
  type ProjectContextStageResult,
  type ProjectProfile,
  type RequirementCandidate,
} from '../../domain/index.js';
import { inspectRepoWorkspace } from '../../infrastructure/repo/index.js';

type ResolveProjectContextInput = {
  projectProfile: ProjectProfile;
  issueSnapshot: JiraIssueSnapshot;
  manualRequirementRef?: string;
  generatedAt?: string;
};

const defaultGeneratedAt = () => new Date().toISOString();

const uniqueValues = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

const resolveRequirement = ({
  projectProfile,
  issueSnapshot,
  manualRequirementRef,
}: Pick<
  ResolveProjectContextInput,
  'projectProfile' | 'issueSnapshot' | 'manualRequirementRef'
>) => {
  if (manualRequirementRef?.trim()) {
    return {
      status: 'completed' as const,
      waitingFor: null,
      requirement: RequirementReferenceSchema.parse({
        requirement_id: null,
        requirement_ref: manualRequirementRef.trim(),
        requirement_binding_status: 'resolved',
        binding_reason: 'Resolved from explicit manual override.',
      }),
      candidates: [] as RequirementCandidate[],
      summary: `Requirement binding resolved manually as ${manualRequirementRef.trim()}.`,
      warnings: [] as string[],
      errors: [],
    };
  }

  const hintsBySource = new Map(
    issueSnapshot.requirement_hints.map((hint) => [hint.source_type, hint.values]),
  );
  const sortedRules = [...projectProfile.jira.requirement_link_rules].sort(
    (left, right) =>
      left.priority - right.priority ||
      left.source_type.localeCompare(right.source_type),
  );

  for (const rule of sortedRules) {
    const values = uniqueValues(hintsBySource.get(rule.source_type) ?? []);
    if (values.length === 0) {
      continue;
    }

    const candidates = values.map((requirementRef) => ({
      requirement_ref: requirementRef,
      source_type: rule.source_type,
      priority: rule.priority,
      reason: `Candidate extracted from ${rule.source_type} at priority ${rule.priority}.`,
    })) satisfies RequirementCandidate[];

    if (values.length === 1) {
      return {
        status: 'completed' as const,
        waitingFor: null,
        requirement: RequirementReferenceSchema.parse({
          requirement_id: null,
          requirement_ref: values[0],
          requirement_binding_status: 'resolved',
          binding_reason:
            'Resolved from issue_link using the highest-priority configured rule.'
              .replace('issue_link', rule.source_type),
        }),
        candidates,
        summary: `Requirement binding resolved from ${rule.source_type}.`,
        warnings: [] as string[],
        errors: [],
      };
    }

    return {
      status: 'waiting' as const,
      waitingFor: 'manual_requirement_selection',
      requirement: RequirementReferenceSchema.parse({
        requirement_id: null,
        requirement_ref: null,
        requirement_binding_status: 'unresolved',
        binding_reason:
          'Multiple requirement candidates matched the highest-priority rule; manual selection is required.',
      }),
      candidates,
      summary: `Multiple ${rule.source_type} requirement candidates need manual confirmation.`,
      warnings: [] as string[],
      errors: [],
    };
  }

  const fallbackRule = sortedRules[0];
  if (fallbackRule?.fallback_action === 'unresolved') {
    return {
      status: 'completed' as const,
      waitingFor: null,
      requirement: RequirementReferenceSchema.parse({
        requirement_id: null,
        requirement_ref: null,
        requirement_binding_status: 'unresolved',
        binding_reason:
          'No requirement hint matched the configured rules; continuing as unresolved because the fallback action allows it.',
      }),
      candidates: [] as RequirementCandidate[],
      summary: 'Requirement binding remains unresolved but is allowed to continue.',
      warnings: [] as string[],
      errors: [],
    };
  }

  return {
    status: 'waiting' as const,
    waitingFor: 'manual_requirement_binding',
    requirement: RequirementReferenceSchema.parse({
      requirement_id: null,
      requirement_ref: null,
      requirement_binding_status: 'unresolved',
      binding_reason:
        fallbackRule?.fallback_action === 'block'
          ? 'No requirement hint matched the configured rules; execution is blocked until a requirement is bound.'
          : 'No requirement hint matched the configured rules; manual binding is required before continuing.',
    }),
    candidates: [] as RequirementCandidate[],
    summary: 'Requirement binding needs manual input.',
    warnings: [] as string[],
    errors: [],
  };
};

export const resolveProjectContext = async ({
  projectProfile,
  issueSnapshot,
  manualRequirementRef,
  generatedAt = defaultGeneratedAt(),
}: ResolveProjectContextInput): Promise<ProjectContextStageResult> => {
  const requirementResolution = resolveRequirement({
    projectProfile,
    issueSnapshot,
    manualRequirementRef,
  });
  const repoWorkspace = await inspectRepoWorkspace({
    projectProfile,
    issueSnapshot,
    generatedAt,
  });

  const sourceRefs = [
    `jira:${issueSnapshot.issue_key}`,
    `project-profile:${projectProfile.project_id}`,
    `repo:${projectProfile.repo.local_path}`,
  ];

  if ('error' in repoWorkspace) {
    return ProjectContextStageResultSchema.parse({
      status: 'failed',
      summary: 'Context Resolution failed while opening the configured local repository.',
      data: null,
      warnings: [],
      errors: [repoWorkspace.error],
      waiting_for: null,
      source_refs: sourceRefs,
      generated_at: generatedAt,
    });
  }

  return ProjectContextStageResultSchema.parse({
    status: requirementResolution.status,
    summary: requirementResolution.summary,
    data: {
      project_id: projectProfile.project_id,
      requirement: requirementResolution.requirement,
      requirement_candidates: requirementResolution.candidates,
      repo_selection: repoWorkspace.repoSelection,
      requirement_source_ref: projectProfile.requirements.source_ref,
      gitlab_project_id: projectProfile.gitlab.project_id,
      gitlab_default_branch: projectProfile.gitlab.default_branch,
    },
    warnings: [...requirementResolution.warnings, ...repoWorkspace.warnings],
    errors: requirementResolution.errors,
    waiting_for: requirementResolution.waitingFor,
    source_refs: sourceRefs,
    generated_at: generatedAt,
  });
};
