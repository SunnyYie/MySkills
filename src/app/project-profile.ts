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
