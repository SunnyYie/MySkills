import { access, readFile } from 'node:fs/promises';

import {
  inspectStoredProjectProfile,
  type ProjectProfileInspection,
  type ProjectProfileSectionName,
  upsertProjectProfileSection,
} from '../skills/config-loader/index.js';

type HomeDirOptions = {
  homeDir?: string;
};

type BindSectionInput = HomeDirOptions & {
  projectId: string;
  section: ProjectProfileSectionName;
  filePath: string;
};

type InspectInput = HomeDirOptions & {
  projectId: string;
};

type ConnectorStatus = 'ready' | 'missing_configuration' | 'missing_dependency';

type ConnectorHealth = {
  status: ConnectorStatus;
  detail: string;
};

type InspectConfigGuidance = {
  command: `bind ${ProjectProfileSectionName}`;
  missingFields: string[];
  issuePaths: string[];
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseJsonFile = async (filePath: string) =>
  JSON.parse(await readFile(filePath, 'utf8')) as unknown;

const fieldExists = (inspection: ProjectProfileInspection, fieldPath: string) =>
  !inspection.missingFields.includes(fieldPath) &&
  !inspection.issues.some((issue) => issue.path === fieldPath);

const hasAllFields = (
  inspection: ProjectProfileInspection,
  fieldPaths: readonly string[],
) => fieldPaths.every((fieldPath) => fieldExists(inspection, fieldPath));

const getDraftValue = (draft: Record<string, unknown>, fieldPath: string) =>
  fieldPath.split('.').reduce<unknown>((current, segment) => {
    if (!isObject(current)) {
      return undefined;
    }

    return current[segment];
  }, draft);

const SECTION_COMMANDS: Record<ProjectProfileSectionName, InspectConfigGuidance['command']> = {
  project: 'bind project',
  jira: 'bind jira',
  requirements: 'bind requirements',
  gitlab: 'bind gitlab',
  feishu: 'bind feishu',
  repo: 'bind repo',
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

const buildInspectConfigGuidance = (
  inspection: ProjectProfileInspection,
): InspectConfigGuidance[] => {
  const orderedSections: ProjectProfileSectionName[] = [
    'project',
    'jira',
    'requirements',
    'gitlab',
    'feishu',
    'repo',
  ];
  const grouped = new Map<ProjectProfileSectionName, InspectConfigGuidance>();

  for (const section of orderedSections) {
    grouped.set(section, {
      command: SECTION_COMMANDS[section],
      missingFields: [],
      issuePaths: [],
    });
  }

  for (const fieldPath of inspection.missingFields) {
    grouped.get(getFieldSection(fieldPath))?.missingFields.push(fieldPath);
  }

  for (const issue of inspection.issues) {
    grouped.get(getFieldSection(issue.path))?.issuePaths.push(issue.path);
  }

  return orderedSections
    .map((section) => grouped.get(section) as InspectConfigGuidance)
    .filter((entry) => entry.missingFields.length > 0 || entry.issuePaths.length > 0);
};

const buildConnectorHealth = async (
  inspection: ProjectProfileInspection,
) => {
  const repoPath = getDraftValue(inspection.draft, 'repo.local_path');
  let repoHealth: ConnectorHealth;

  if (!hasAllFields(inspection, ['repo.local_path', 'repo.module_rules'])) {
    repoHealth = {
      status: 'missing_configuration',
      detail: 'Repo binding is incomplete.',
    };
  } else {
    try {
      await access(String(repoPath));
      repoHealth = {
        status: 'ready',
        detail: 'Local repository path is accessible.',
      };
    } catch {
      repoHealth = {
        status: 'missing_dependency',
        detail: 'Configured local repository path is not accessible from the current machine.',
      };
    }
  }

  return {
    jira: hasAllFields(inspection, [
      'jira.base_url',
      'jira.project_key',
      'jira.issue_type_ids',
      'jira.requirement_link_rules',
      'jira.writeback_targets',
      'jira.subtask.issue_type_id',
      'jira.subtask.summary_template',
      'jira.branch_binding.target_issue_source',
      'jira.commit_binding.target_issue_source',
      'jira.credential_ref',
    ])
      ? {
          status: 'ready' as const,
          detail: 'Jira project binding and credential reference are configured.',
        }
      : {
          status: 'missing_configuration' as const,
          detail: 'Jira binding is incomplete.',
        },
    requirements: hasAllFields(inspection, [
      'requirements.source_type',
      'requirements.source_ref',
    ])
      ? {
          status: 'ready' as const,
          detail: 'Requirement source binding is configured.',
        }
      : {
          status: 'missing_configuration' as const,
          detail: 'Requirement source binding is incomplete.',
        },
    gitlab: hasAllFields(inspection, [
      'gitlab.base_url',
      'gitlab.project_id',
      'gitlab.default_branch',
      'gitlab.branch_naming_rule',
      'gitlab.branch_binding.input_mode',
      'gitlab.credential_ref',
    ])
      ? {
          status: 'ready' as const,
          detail: 'GitLab binding and credential reference are configured.',
        }
      : {
          status: 'missing_configuration' as const,
          detail: 'GitLab binding is incomplete.',
        },
    feishu: hasAllFields(inspection, [
      'feishu.space_id',
      'feishu.doc_id',
      'feishu.block_path_or_anchor',
      'feishu.template_id',
      'feishu.template_version',
      'feishu.credential_ref',
    ])
      ? {
          status: 'ready' as const,
          detail: 'Feishu target and template binding are configured.',
        }
      : {
          status: 'missing_configuration' as const,
          detail: 'Feishu binding is incomplete.',
        },
    repo: repoHealth,
  };
};

export const bindProjectProfileSectionFromFile = async ({
  projectId,
  section,
  filePath,
  homeDir,
}: BindSectionInput) => {
  const payload = await parseJsonFile(filePath);
  const inspection = await upsertProjectProfileSection({
    projectId,
    section,
    payload,
    homeDir,
  });

  return {
    command: `bind ${section}`,
    projectId,
    profilePath: inspection.profilePath,
    validation: {
      ready: inspection.ready,
      missingFields: inspection.missingFields,
      issues: inspection.issues,
    },
  };
};

export const inspectProjectConfig = async ({
  projectId,
  homeDir,
}: InspectInput) => {
  const inspection = await inspectStoredProjectProfile({ projectId, homeDir });

  return {
    command: 'inspect config',
    projectId,
    profilePath: inspection.profilePath,
    validation: {
      ready: inspection.ready,
      missingFields: inspection.missingFields,
      issues: inspection.issues,
    },
    guidance: buildInspectConfigGuidance(inspection),
  };
};

export const inspectProjectGraph = async ({
  projectId,
  homeDir,
}: InspectInput) => {
  const inspection = await inspectStoredProjectProfile({ projectId, homeDir });

  return {
    command: 'inspect graph',
    projectId,
    graph: {
      jiraProjectKey: getDraftValue(inspection.draft, 'jira.project_key') ?? null,
      requirementSourceRef: getDraftValue(inspection.draft, 'requirements.source_ref') ?? null,
      gitlabProjectId: getDraftValue(inspection.draft, 'gitlab.project_id') ?? null,
      feishuDocId: getDraftValue(inspection.draft, 'feishu.doc_id') ?? null,
      repoLocalPath: getDraftValue(inspection.draft, 'repo.local_path') ?? null,
      moduleCount: Array.isArray(getDraftValue(inspection.draft, 'repo.module_rules'))
        ? (getDraftValue(inspection.draft, 'repo.module_rules') as unknown[]).length
        : 0,
    },
    validation: {
      ready: inspection.ready,
      missingFields: inspection.missingFields,
    },
  };
};

export const inspectProjectConnectors = async ({
  projectId,
  homeDir,
}: InspectInput) => {
  const inspection = await inspectStoredProjectProfile({ projectId, homeDir });

  return {
    command: 'inspect connectors',
    projectId,
    connectors: await buildConnectorHealth(inspection),
  };
};
