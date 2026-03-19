import path from 'node:path';
import { access, readFile, readdir } from 'node:fs/promises';

import {
  CodeTargetSchema,
  RepoSelectionSchema,
  StructuredErrorSchema,
  type JiraIssueSnapshot,
  type RequirementBrief,
  type ProjectProfile,
  type RepoSelection,
  type StructuredError,
} from '../../domain/index.js';

const normalizeText = (value: string) => value.trim().toLowerCase();
const normalizeRelativePath = (value: string) => value.split(path.sep).join('/');
const STOP_WORDS = new Set([
  'the',
  'and',
  'when',
  'with',
  'from',
  'into',
  'that',
  'this',
  'flow',
  'fails',
  'rejects',
  'module',
  'submit',
  'time',
]);

const extractSearchRoot = (rule: ProjectProfile['repo']['module_rules'][number]) => {
  const normalizedPattern = rule.path_pattern.replace(/\\/g, '/');
  const globIndex = normalizedPattern.search(/[\*\{\[]/);
  const prefix =
    globIndex === -1 ? normalizedPattern : normalizedPattern.slice(0, globIndex);
  return prefix.replace(/\/+$/, '') || '.';
};

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

const tokenizeSearchTerms = ({
  issueSnapshot,
  requirementBrief,
  moduleCandidates,
}: {
  issueSnapshot: JiraIssueSnapshot;
  requirementBrief: RequirementBrief;
  moduleCandidates: string[];
}) => {
  const excludedTokens = new Set(moduleCandidates.map((value) => normalizeText(value)));
  const corpus = [
    issueSnapshot.summary,
    issueSnapshot.description,
    requirementBrief.fix_goal,
  ].join(' ');

  const rankedTokens = corpus
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 4 &&
        !STOP_WORDS.has(token) &&
        !excludedTokens.has(token),
    );

  return [...new Set(rankedTokens)].slice(0, 12);
};

const listFilesRecursively = async (directoryPath: string): Promise<string[]> => {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(entryPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
};

const collectSearchRoots = ({
  projectProfile,
  repoSelection,
}: {
  projectProfile: ProjectProfile;
  repoSelection: RepoSelection;
}) => {
  const allowedModules =
    repoSelection.module_candidates.length > 0
      ? new Set(repoSelection.module_candidates.map((value) => value.trim()))
      : null;

  const rules = projectProfile.repo.module_rules.filter((rule) =>
    allowedModules ? allowedModules.has(rule.module_id.trim()) : true,
  );

  return rules.map((rule) => ({
    moduleId: rule.module_id.trim(),
    absoluteRoot: path.join(repoSelection.repo_path, extractSearchRoot(rule)),
  }));
};

const scoreCandidate = ({
  relativePath,
  contents,
  searchTerms,
}: {
  relativePath: string;
  contents: string;
  searchTerms: string[];
}) => {
  const haystack = `${relativePath} ${contents}`.toLowerCase();
  const matchedTerms = searchTerms.filter((term) => haystack.includes(term));

  return {
    matchedTerms,
    score: matchedTerms.length,
  };
};

export const searchRepoWorkspace = async ({
  projectProfile,
  repoSelection,
  issueSnapshot,
  requirementBrief,
}: {
  projectProfile: ProjectProfile;
  repoSelection: RepoSelection;
  issueSnapshot: JiraIssueSnapshot;
  requirementBrief: RequirementBrief;
}) => {
  const searchTerms = tokenizeSearchTerms({
    issueSnapshot,
    requirementBrief,
    moduleCandidates: repoSelection.module_candidates,
  });
  const searchRoots = collectSearchRoots({
    projectProfile,
    repoSelection,
  });
  const candidates: Array<{
    file_path: string;
    reason: string;
    score: number;
    module_id: string;
    matched_terms: string[];
  }> = [];

  for (const searchRoot of searchRoots) {
    try {
      await access(searchRoot.absoluteRoot);
    } catch {
      continue;
    }

    const files = await listFilesRecursively(searchRoot.absoluteRoot);
    for (const absolutePath of files) {
      const relativePath = normalizeRelativePath(
        path.relative(repoSelection.repo_path, absolutePath),
      );

      let contents = '';
      try {
        contents = await readFile(absolutePath, 'utf8');
      } catch {
        continue;
      }

      const scored = scoreCandidate({
        relativePath,
        contents,
        searchTerms,
      });

      if (scored.score === 0) {
        continue;
      }

      candidates.push({
        file_path: CodeTargetSchema.shape.file_path.parse(relativePath),
        reason: `Matched ${scored.matchedTerms.join(', ')} in module ${searchRoot.moduleId}.`,
        score: scored.score,
        module_id: searchRoot.moduleId,
        matched_terms: scored.matchedTerms,
      });
    }
  }

  return candidates.sort(
    (left, right) =>
      right.score - left.score ||
      left.file_path.localeCompare(right.file_path),
  );
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
