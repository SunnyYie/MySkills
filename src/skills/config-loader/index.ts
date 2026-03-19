import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import {
  getProjectProfilePath,
  writeJsonAtomically,
} from '../../storage/index.js';
import {
  type ProjectProfile,
  ProjectProfileSchema,
} from '../../domain/index.js';

type ProjectProfileSectionName =
  | 'project'
  | 'jira'
  | 'requirements'
  | 'gitlab'
  | 'feishu'
  | 'repo';

type ProjectProfileIssueCode =
  | 'missing_field'
  | 'invalid_version'
  | 'invalid_reference'
  | 'invalid_value';

type ProjectProfileIssue = {
  code: ProjectProfileIssueCode;
  path: string;
  message: string;
  nextAction: string;
};

type ProjectProfileInspection = {
  projectId: string;
  profilePath: string;
  exists: boolean;
  draft: Record<string, unknown>;
  ready: boolean;
  missingFields: string[];
  issues: ProjectProfileIssue[];
  normalizedProfile?: ProjectProfile;
};

type LoadProjectProfileInput = {
  projectId: string;
  homeDir?: string;
};

type UpsertProjectProfileSectionInput = {
  projectId: string;
  section: ProjectProfileSectionName;
  payload: unknown;
  homeDir?: string;
};

const CONFIG_VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const REQUIRED_FIELD_PATHS = [
  'project_id',
  'project_name',
  'config_version',
  'jira.base_url',
  'jira.project_key',
  'jira.issue_type_ids',
  'jira.requirement_link_rules',
  'jira.writeback_targets',
  'jira.credential_ref',
  'requirements.source_type',
  'requirements.source_ref',
  'gitlab.base_url',
  'gitlab.project_id',
  'gitlab.default_branch',
  'gitlab.branch_naming_rule',
  'gitlab.credential_ref',
  'feishu.space_id',
  'feishu.doc_id',
  'feishu.block_path_or_anchor',
  'feishu.template_id',
  'feishu.template_version',
  'feishu.credential_ref',
  'repo.local_path',
  'repo.module_rules',
  'approval_policy',
  'serialization_policy',
  'sensitivity_policy',
] as const;

const REFERENCE_FIELD_PATHS = [
  'jira.credential_ref',
  'requirements.source_ref',
  'gitlab.credential_ref',
  'feishu.credential_ref',
] as const;

const CREDENTIAL_REF_HINTS: Record<string, string> = {
  'jira.credential_ref': 'cred:jira/project-a',
  'gitlab.credential_ref': 'cred:gitlab/project-a',
  'feishu.credential_ref': 'cred:feishu/project-a',
};

const SECTION_COMMANDS: Record<ProjectProfileSectionName, string> = {
  project: 'bind project',
  jira: 'bind jira',
  requirements: 'bind requirements',
  gitlab: 'bind gitlab',
  feishu: 'bind feishu',
  repo: 'bind repo',
};

const PROJECT_SECTION_SCHEMA = z
  .object({
    project_id: z.string().trim().min(1).optional(),
    project_name: z.string().trim().min(1),
    config_version: z.string().trim().min(1),
    approval_policy: ProjectProfileSchema.shape.approval_policy,
    serialization_policy: ProjectProfileSchema.shape.serialization_policy,
    sensitivity_policy: ProjectProfileSchema.shape.sensitivity_policy,
  })
  .strict();

const SECTION_SCHEMAS: Record<ProjectProfileSectionName, z.ZodType<unknown>> = {
  project: PROJECT_SECTION_SCHEMA,
  jira: ProjectProfileSchema.shape.jira,
  requirements: ProjectProfileSchema.shape.requirements,
  gitlab: ProjectProfileSchema.shape.gitlab,
  feishu: ProjectProfileSchema.shape.feishu,
  repo: ProjectProfileSchema.shape.repo,
};

const CONFIG_SECTION_TO_PATHS: Record<ProjectProfileSectionName, readonly string[]> = {
  project: [
    'project_name',
    'config_version',
    'approval_policy',
    'serialization_policy',
    'sensitivity_policy',
  ],
  jira: [
    'jira.base_url',
    'jira.project_key',
    'jira.issue_type_ids',
    'jira.requirement_link_rules',
    'jira.writeback_targets',
    'jira.credential_ref',
  ],
  requirements: ['requirements.source_type', 'requirements.source_ref'],
  gitlab: [
    'gitlab.base_url',
    'gitlab.project_id',
    'gitlab.default_branch',
    'gitlab.branch_naming_rule',
    'gitlab.credential_ref',
  ],
  feishu: [
    'feishu.space_id',
    'feishu.doc_id',
    'feishu.block_path_or_anchor',
    'feishu.template_id',
    'feishu.template_version',
    'feishu.credential_ref',
  ],
  repo: ['repo.local_path', 'repo.module_rules'],
};

export class ProjectProfileValidationError extends Error {
  constructor(readonly inspection: ProjectProfileInspection) {
    super(`Project profile ${inspection.projectId} is incomplete or invalid.`);
    this.name = 'ProjectProfileValidationError';
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isMissingValue = (value: unknown) => {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim().length === 0;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return false;
};

const getValueAtPath = (target: Record<string, unknown>, fieldPath: string) =>
  fieldPath.split('.').reduce<unknown>((current, segment) => {
    if (!isObject(current)) {
      return undefined;
    }

    return current[segment];
  }, target);

const setValueAtPath = (
  target: Record<string, unknown>,
  fieldPath: string,
  value: unknown,
) => {
  const segments = fieldPath.split('.');
  let current = target;

  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    if (!isObject(existing)) {
      current[segment] = {};
    }

    current = current[segment] as Record<string, unknown>;
  }

  current[segments.at(-1) as string] = value;
};

const normalizeUnknownValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeUnknownValue(item));
  }

  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        normalizeUnknownValue(entryValue),
      ]),
    );
  }

  return value;
};

const uniqueSortedStrings = (values: string[]) =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );

const normalizeProjectProfile = (profile: ProjectProfile): ProjectProfile => ({
  ...profile,
  project_name: profile.project_name.trim(),
  jira: {
    ...profile.jira,
    requirement_link_rules: [...profile.jira.requirement_link_rules].sort(
      (left, right) =>
        left.priority - right.priority ||
        left.source_type.localeCompare(right.source_type),
    ),
  },
  repo: {
    ...profile.repo,
    local_path: path.resolve(profile.repo.local_path),
    module_rules: [...profile.repo.module_rules].sort(
      (left, right) =>
        left.module_id.localeCompare(right.module_id) ||
        left.path_pattern.localeCompare(right.path_pattern),
    ),
  },
  sensitivity_policy: {
    ...profile.sensitivity_policy,
    sensitive_field_paths: uniqueSortedStrings(
      profile.sensitivity_policy.sensitive_field_paths,
    ),
    prohibited_plaintext_fields: uniqueSortedStrings(
      profile.sensitivity_policy.prohibited_plaintext_fields,
    ),
  },
});

const readStoredDraft = async ({
  projectId,
  homeDir,
}: LoadProjectProfileInput) => {
  const profilePath = getProjectProfilePath(projectId, homeDir);

  try {
    const contents = await readFile(profilePath, 'utf8');
    const parsed = JSON.parse(contents);
    return {
      profilePath,
      exists: true,
      draft: isObject(parsed) ? (normalizeUnknownValue(parsed) as Record<string, unknown>) : {},
    };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return {
        profilePath,
        exists: false,
        draft: { project_id: projectId },
      };
    }

    throw error;
  }
};

const getFieldSection = (fieldPath: string): ProjectProfileSectionName => {
  const [head] = fieldPath.split('.');

  switch (head) {
    case 'project_name':
    case 'config_version':
    case 'approval_policy':
    case 'serialization_policy':
    case 'sensitivity_policy':
    case 'project_id':
      return 'project';
    case 'jira':
      return 'jira';
    case 'requirements':
      return 'requirements';
    case 'gitlab':
      return 'gitlab';
    case 'feishu':
      return 'feishu';
    case 'repo':
      return 'repo';
    default:
      return 'project';
  }
};

const validateMissingFields = (draft: Record<string, unknown>, projectId: string) =>
  REQUIRED_FIELD_PATHS.filter((fieldPath) => isMissingValue(getValueAtPath(draft, fieldPath))).map(
    (fieldPath) => ({
      fieldPath,
      issue: {
        code: 'missing_field' as const,
        path: fieldPath,
        message: `${fieldPath} is required before the project profile can be used for workflow execution.`,
        nextAction: `Use ${SECTION_COMMANDS[getFieldSection(fieldPath)]} to补录该字段，然后重新执行 inspect config --project ${projectId}。`,
      },
    }),
  );

const isRefLike = (value: string) =>
  /^(?:[a-z][a-z0-9+.-]*:\/\/.+|cred:[\w./-]+)$/i.test(value);

const validateReferenceFields = (draft: Record<string, unknown>) => {
  const issues: ProjectProfileIssue[] = [];

  for (const fieldPath of REFERENCE_FIELD_PATHS) {
    const value = getValueAtPath(draft, fieldPath);

    if (typeof value !== 'string' || value.length === 0) {
      continue;
    }

    if (!isRefLike(value)) {
      issues.push({
        code: 'invalid_reference',
        path: fieldPath,
        message:
          fieldPath === 'requirements.source_ref'
            ? 'requirements.source_ref must be an explicit source reference so requirement provenance stays traceable.'
            : `${fieldPath} must be an explicit credential reference instead of inline secret material.`,
        nextAction:
          fieldPath === 'requirements.source_ref'
            ? 'Replace requirements.source_ref with a ref-like value such as doc://feishu/project-a。'
            : `Replace ${fieldPath} with a credential ref such as ${CREDENTIAL_REF_HINTS[fieldPath]}。`,
      });
    }
  }

  const repoLocalPath = getValueAtPath(draft, 'repo.local_path');
  if (typeof repoLocalPath === 'string' && repoLocalPath.length > 0 && !path.isAbsolute(repoLocalPath)) {
    issues.push({
      code: 'invalid_reference',
      path: 'repo.local_path',
      message:
        'repo.local_path must be an absolute path so inspect and run operate on the intended repository.',
      nextAction: 'Bind repo.local_path again with an absolute filesystem path.',
    });
  }

  return issues;
};

const validateConfigVersion = (draft: Record<string, unknown>) => {
  const value = getValueAtPath(draft, 'config_version');

  if (typeof value !== 'string' || value.length === 0 || CONFIG_VERSION_PATTERN.test(value)) {
    return [];
  }

  return [
    {
      code: 'invalid_version' as const,
      path: 'config_version',
      message:
        'config_version must use YYYY-MM-DD so project profiles stay versionable and auditable.',
      nextAction: `Update the stored config_version and rerun inspect config --project ${draft.project_id ?? 'unknown'}。`,
    },
  ];
};

const validateSectionSchemas = (
  draft: Record<string, unknown>,
  missingFieldPaths: Set<string>,
  projectId: string,
) => {
  const issues: ProjectProfileIssue[] = [];

  for (const [section, schema] of Object.entries(SECTION_SCHEMAS) as Array<
    [ProjectProfileSectionName, z.ZodType<unknown>]
  >) {
    const value =
      section === 'project'
        ? Object.fromEntries(
            CONFIG_SECTION_TO_PATHS.project.map((fieldPath) => [
              fieldPath,
              getValueAtPath(draft, fieldPath),
            ]),
          )
        : getValueAtPath(draft, section);

    const relevantPaths = CONFIG_SECTION_TO_PATHS[section];
    if (relevantPaths.every((fieldPath) => isMissingValue(getValueAtPath(draft, fieldPath)))) {
      continue;
    }

    const parsed = schema.safeParse(value);
    if (parsed.success) {
      continue;
    }

    for (const issue of parsed.error.issues) {
      const issuePath = [
        section === 'project' ? undefined : section,
        ...issue.path.map(String),
      ]
        .filter(Boolean)
        .join('.');

      if (missingFieldPaths.has(issuePath)) {
        continue;
      }

      issues.push({
        code: 'invalid_value',
        path: issuePath,
        message: `${issuePath} is invalid: ${issue.message}`,
        nextAction: `Update ${issuePath} via ${SECTION_COMMANDS[section]} and rerun inspect config --project ${projectId}。`,
      });
    }
  }

  return issues;
};

export const inspectStoredProjectProfile = async ({
  projectId,
  homeDir,
}: LoadProjectProfileInput): Promise<ProjectProfileInspection> => {
  const { profilePath, exists, draft } = await readStoredDraft({ projectId, homeDir });
  const normalizedDraft = {
    ...draft,
    project_id: typeof draft.project_id === 'string' ? draft.project_id : projectId,
  };
  const missingFieldEntries = validateMissingFields(normalizedDraft, projectId);
  const missingFields = missingFieldEntries.map((entry) => entry.fieldPath);
  const issues = [
    ...missingFieldEntries.map((entry) => entry.issue),
    ...validateConfigVersion(normalizedDraft),
    ...validateReferenceFields(normalizedDraft),
    ...validateSectionSchemas(normalizedDraft, new Set(missingFields), projectId),
  ];
  const ready = missingFields.length === 0 && issues.length === 0;

  if (!ready) {
    return {
      projectId,
      profilePath,
      exists,
      draft: normalizedDraft,
      ready,
      missingFields,
      issues,
    };
  }

  const normalizedProfile = normalizeProjectProfile(
    ProjectProfileSchema.parse(normalizedDraft),
  );

  return {
    projectId,
    profilePath,
    exists,
    draft: normalizedDraft,
    ready,
    missingFields,
    issues: [],
    normalizedProfile,
  };
};

export const loadProjectProfile = async ({
  projectId,
  homeDir,
}: LoadProjectProfileInput) => {
  const inspection = await inspectStoredProjectProfile({ projectId, homeDir });

  if (!inspection.ready || !inspection.normalizedProfile) {
    throw new ProjectProfileValidationError(inspection);
  }

  return inspection.normalizedProfile;
};

export const upsertProjectProfileSection = async ({
  projectId,
  section,
  payload,
  homeDir,
}: UpsertProjectProfileSectionInput) => {
  const schema = SECTION_SCHEMAS[section];
  const parsed = schema.parse(normalizeUnknownValue(payload));
  const { profilePath, draft } = await readStoredDraft({ projectId, homeDir });
  const nextDraft = {
    ...draft,
    project_id: projectId,
  };

  if (section === 'project') {
    const projectSection = parsed as z.infer<typeof PROJECT_SECTION_SCHEMA>;
    if (projectSection.project_id && projectSection.project_id !== projectId) {
      throw new Error(
        `Project id mismatch: payload declares ${projectSection.project_id} but command targets ${projectId}.`,
      );
    }

    for (const fieldPath of CONFIG_SECTION_TO_PATHS.project) {
      setValueAtPath(nextDraft, fieldPath, projectSection[fieldPath as keyof typeof projectSection]);
    }
  } else {
    setValueAtPath(nextDraft, section, parsed);
  }

  await writeJsonAtomically(profilePath, nextDraft);

  return inspectStoredProjectProfile({ projectId, homeDir });
};

export type {
  ProjectProfileInspection,
  ProjectProfileIssue,
  ProjectProfileIssueCode,
  ProjectProfileSectionName,
};
