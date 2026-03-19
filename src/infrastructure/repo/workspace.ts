import path from 'node:path';
import { access } from 'node:fs/promises';

import {
  RepoSelectionSchema,
  StructuredErrorSchema,
  type JiraIssueSnapshot,
  type ProjectProfile,
  type RepoSelection,
  type StructuredError,
} from '../../domain/index.js';

const normalizeText = (value: string) => value.trim().toLowerCase();

const collectModuleCandidates = ({
  issueSnapshot,
  projectProfile,
}: {
  issueSnapshot: JiraIssueSnapshot;
  projectProfile: ProjectProfile;
}) => {
  const explicitModules = issueSnapshot.labels
    .map((label) => {
      const normalized = normalizeText(label);
      return normalized.startsWith('module:') ? normalized.slice('module:'.length) : null;
    })
    .filter((moduleId): moduleId is string => Boolean(moduleId));

  if (explicitModules.length > 0) {
    return projectProfile.repo.module_rules
      .map((rule) => rule.module_id.trim())
      .filter((moduleId) =>
        explicitModules.includes(normalizeText(moduleId)),
      );
  }

  const signalText = [
    issueSnapshot.summary,
    issueSnapshot.description,
    ...issueSnapshot.labels,
  ]
    .map((value) => normalizeText(value))
    .join(' ');

  return projectProfile.repo.module_rules
    .map((rule) => rule.module_id.trim())
    .filter((moduleId) => signalText.includes(normalizeText(moduleId)));
};

export const createRepoResolutionError = ({
  repoPath,
  detail,
  timestamp,
}: {
  repoPath: string;
  detail: string;
  timestamp: string;
}): StructuredError =>
  StructuredErrorSchema.parse({
    code: 'repo_path_unavailable',
    category: 'repo_resolution_failed',
    stage: 'Context Resolution',
    system: 'repo_workspace',
    operation: 'inspect_workspace',
    target_ref: `repo:${repoPath}`,
    message: `Configured repository path ${repoPath} is not available for Context Resolution.`,
    detail,
    retryable: false,
    outcome_unknown: false,
    user_action:
      'Re-bind repo.local_path to an accessible absolute path, then rerun Context Resolution.',
    raw_cause_ref: null,
    partial_state_ref: null,
    timestamp,
  });

export const inspectRepoWorkspace = async ({
  projectProfile,
  issueSnapshot,
  generatedAt,
}: {
  projectProfile: ProjectProfile;
  issueSnapshot: JiraIssueSnapshot;
  generatedAt: string;
}): Promise<{ repoSelection: RepoSelection; warnings: string[] } | { error: StructuredError }> => {
  const repoPath = projectProfile.repo.local_path.trim();

  if (!path.isAbsolute(repoPath)) {
    return {
      error: createRepoResolutionError({
        repoPath,
        detail: 'repo.local_path must be an absolute filesystem path.',
        timestamp: generatedAt,
      }),
    };
  }

  try {
    await access(repoPath);
  } catch {
    return {
      error: createRepoResolutionError({
        repoPath,
        detail: 'The configured local repository path could not be opened from this machine.',
        timestamp: generatedAt,
      }),
    };
  }

  const moduleCandidates = collectModuleCandidates({
    issueSnapshot,
    projectProfile,
  });
  const warnings =
    moduleCandidates.length === 0
      ? [
          'No module-specific signal matched the configured module rules; carrying repository context forward without narrowing modules.',
        ]
      : [];

  return {
    repoSelection: RepoSelectionSchema.parse({
      repo_path: repoPath,
      module_candidates: moduleCandidates,
    }),
    warnings,
  };
};
