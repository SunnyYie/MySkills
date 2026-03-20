import { createHash } from 'node:crypto';

import {
  JiraBindingDraftSchema,
  JiraBindingResultSchema,
  JiraIssueSnapshotSchema,
  JiraSubtaskDraftSchema,
  JiraSubtaskResultSchema,
  JiraWritebackDraftSchema,
  JiraWritebackResultSchema,
  StructuredErrorSchema,
  type GitLabArtifact,
  type JiraBindingDraft,
  type JiraBindingResult,
  type JiraIssueSnapshot,
  type JiraSubtaskDraft,
  type JiraSubtaskResult,
  type JiraIssueWritebackTarget,
  type JiraWritebackDraft,
  type JiraWritebackResult,
  type ProjectProfile,
  type RequirementReference,
  type StructuredError,
} from '../../../domain/index.js';

type RawRequirementSources = Partial<
  Record<
    'issue_link' | 'custom_field' | 'label' | 'text_pattern' | 'manual',
    string[]
  >
>;

type RawJiraIssue = {
  issue_key: string;
  issue_id: string;
  issue_type_id: string;
  project_key: string;
  summary: string;
  description: string;
  status_name: string;
  labels?: string[];
  requirement_sources?: RawRequirementSources;
  source_url?: string;
};

type JiraIssueFetcher = (issueKey: string) => Promise<RawJiraIssue>;

type ConnectorErrorLike = NodeJS.ErrnoException & {
  status?: number;
};

const REQUIREMENT_SOURCE_FIELDS = {
  issue_link: 'jira.issue_link',
  custom_field: 'jira.custom_field',
  label: 'jira.labels',
  text_pattern: 'jira.description',
  manual: 'manual',
} as const;

const uniquePreservingOrder = (values: string[] = []) => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
};

const REQUIRED_RAW_ISSUE_FIELDS = [
  'issue_key',
  'issue_id',
  'issue_type_id',
  'project_key',
  'summary',
  'description',
  'status_name',
] as const;

const isStructuredError = (error: unknown): error is StructuredError =>
  StructuredErrorSchema.safeParse(error).success;

const isPermissionReadError = (error: ConnectorErrorLike) =>
  error.status === 401 ||
  error.status === 403 ||
  error.code === 'EACCES' ||
  error.code === 'EPERM';

const isIssueNotFoundError = (error: ConnectorErrorLike) =>
  error.status === 404 || error.code === 'ENOENT';

const isNetworkReadError = (error: ConnectorErrorLike) =>
  error.code === 'ECONNRESET' ||
  error.code === 'ECONNREFUSED' ||
  error.code === 'ETIMEDOUT' ||
  error.code === 'ENOTFOUND' ||
  error.code === 'EAI_AGAIN';

const getInvalidRawIssueDetail = (rawIssue: RawJiraIssue) => {
  const invalidFields = REQUIRED_RAW_ISSUE_FIELDS.filter((field) => {
    const value = rawIssue[field];
    return typeof value !== 'string' || value.trim().length === 0;
  });

  if (invalidFields.length === 0) {
    return null;
  }

  return `Missing or empty Jira issue fields: ${invalidFields.join(', ')}.`;
};

const mapWritebackTarget = (target: string) =>
  target === 'comment'
    ? {
        target_type: 'comment' as const,
        target_field_id_or_comment_mode: 'comment',
      }
    : {
        target_type: 'field' as const,
        target_field_id_or_comment_mode: target.trim(),
    };

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
};

const sha256 = (value: unknown) =>
  `sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`;

const createTargetRef = ({
  issueKey,
  target,
}: {
  issueKey: string;
  target: JiraIssueWritebackTarget;
}) =>
  target.target_type === 'comment'
    ? `jira://${issueKey}/comment`
    : `jira://${issueKey}/field/${target.target_field_id_or_comment_mode}`;

const createSubtaskTargetRef = (parentIssueKey: string) =>
  `jira://${parentIssueKey}/subtasks`;

const createBindingTargetRef = ({
  targetIssueKey,
  bindingType,
}: {
  targetIssueKey: string;
  bindingType: 'branch' | 'commit';
}) => `jira://${targetIssueKey}/development/${bindingType}`;

const createDedupeScope = ({
  issueKey,
  target,
}: {
  issueKey: string;
  target: JiraIssueWritebackTarget;
}) =>
  target.target_type === 'comment'
    ? `jira:${issueKey}:comment`
    : `jira:${issueKey}:field:${target.target_field_id_or_comment_mode}`;

const createSubtaskDedupeScope = (parentIssueKey: string) =>
  `jira:${parentIssueKey}:subtask`;

const createBindingDedupeScope = ({
  targetIssueKey,
  bindingType,
  bindingValue,
}: {
  targetIssueKey: string;
  bindingType: 'branch' | 'commit';
  bindingValue: string;
}) => `jira:${targetIssueKey}:${bindingType}:${bindingValue}`;

const applyIssueTemplate = ({
  template,
  issueSnapshot,
}: {
  template: string;
  issueSnapshot: JiraIssueSnapshot;
}) =>
  template
    .replaceAll('{issue_key}', issueSnapshot.issue_key)
    .replaceAll('{summary}', issueSnapshot.summary)
    .replaceAll('{description}', issueSnapshot.description);

const createWritebackMarker = ({
  issueKey,
  gitlabArtifacts,
}: {
  issueKey: string;
  gitlabArtifacts: GitLabArtifact[];
}) => {
  const primaryArtifact = gitlabArtifacts[0];
  const artifactHint =
    primaryArtifact?.artifact_type === 'commit'
      ? primaryArtifact.commit_sha.slice(0, 12)
      : primaryArtifact?.artifact_type === 'branch'
        ? primaryArtifact.branch_name
        : primaryArtifact?.mr_iid?.toString() ?? 'no-artifact';

  return `bo-orchestrator:${issueKey}:${artifactHint}`;
};

const renderPreviewBody = ({
  issueSnapshot,
  gitlabArtifacts,
  verificationResultsRef,
  requirementRefs,
  marker,
}: {
  issueSnapshot: JiraIssueSnapshot;
  gitlabArtifacts: GitLabArtifact[];
  verificationResultsRef: string | null;
  requirementRefs: RequirementReference[];
  marker: string;
}) => {
  const artifactLines =
    gitlabArtifacts.length === 0
      ? ['- GitLab artifacts: none recorded']
      : gitlabArtifacts.map((artifact) => {
          if (artifact.artifact_type === 'commit') {
            return `- Commit: ${artifact.commit_sha} (${artifact.commit_url})`;
          }

          if (artifact.artifact_type === 'branch') {
            return `- Branch: ${artifact.branch_name}`;
          }

          return `- Merge request: !${artifact.mr_iid} (${artifact.mr_url})`;
        });
  const requirementLine =
    requirementRefs.find(
      (reference) => reference.requirement_binding_status === 'resolved',
    )?.requirement_ref ?? 'unresolved';

  return [
    `Bugfix orchestrator update for ${issueSnapshot.issue_key}`,
    '',
    `Summary: ${issueSnapshot.summary}`,
    `Requirement: ${requirementLine}`,
    ...artifactLines,
    `Verification ref: ${verificationResultsRef ?? 'not-recorded'}`,
    '',
    `<!-- ${marker} -->`,
  ].join('\n');
};

const renderSubtaskPreview = ({
  issueSnapshot,
  renderedSummary,
  renderedDescription,
  issueTypeId,
}: {
  issueSnapshot: JiraIssueSnapshot;
  renderedSummary: string;
  renderedDescription: string | null;
  issueTypeId: string;
}) =>
  [
    `Create Jira subtask for ${issueSnapshot.issue_key}`,
    '',
    `Parent issue: ${issueSnapshot.issue_key}`,
    `Issue type id: ${issueTypeId}`,
    `Summary: ${renderedSummary}`,
    `Description: ${renderedDescription ?? 'not provided'}`,
  ].join('\n');

const renderBindingPreview = ({
  operation,
  targetIssueKey,
  targetIssueSource,
  bindingValue,
}: {
  operation: 'jira.bind_branch' | 'jira.bind_commit';
  targetIssueKey: string;
  targetIssueSource: 'bug' | 'subtask';
  bindingValue: string;
}) =>
  [
    `${operation} for ${targetIssueKey}`,
    '',
    `Target issue: ${targetIssueKey}`,
    `Target source: ${targetIssueSource}`,
    `Binding value: ${bindingValue}`,
  ].join('\n');

const resolveBindingTarget = ({
  issueSnapshot,
  subtaskIssueKey,
  preferredSource,
  allowFallbackToBug,
  operation,
  timestamp,
}: {
  issueSnapshot: JiraIssueSnapshot;
  subtaskIssueKey?: string;
  preferredSource: 'bug' | 'subtask';
  allowFallbackToBug: boolean;
  operation: 'jira.bind_branch' | 'jira.bind_commit';
  timestamp?: string;
}): {
  targetIssueKey: string;
  targetIssueSource: 'bug' | 'subtask';
} => {
  if (preferredSource === 'bug') {
    return {
      targetIssueKey: issueSnapshot.issue_key,
      targetIssueSource: 'bug',
    };
  }

  if (subtaskIssueKey?.trim()) {
    return {
      targetIssueKey: subtaskIssueKey.trim(),
      targetIssueSource: 'subtask',
    };
  }

  if (allowFallbackToBug) {
    return {
      targetIssueKey: issueSnapshot.issue_key,
      targetIssueSource: 'bug',
    };
  }

  throw StructuredErrorSchema.parse({
    code: 'jira_binding_target_missing',
    category: 'validation_error',
    stage: 'Artifact Linking',
    system: 'jira',
    operation,
    target_ref: `jira:${issueSnapshot.issue_key}`,
    message:
      `${operation} requires an explicit subtask issue key because the current project profile does not allow fallback to the bug issue.`,
    detail:
      'Provide the subtask issue key explicitly or update the project profile binding policy before retrying.',
    retryable: false,
    outcome_unknown: false,
    user_action:
      'Re-run the operation with an explicit subtask issue key, or relax the project profile fallback policy first.',
    raw_cause_ref: null,
    partial_state_ref: null,
    timestamp: timestamp ?? new Date().toISOString(),
  });
};

export const buildJiraIssueSnapshot = ({
  projectProfile,
  rawIssue,
}: {
  projectProfile: ProjectProfile;
  rawIssue: RawJiraIssue;
}): JiraIssueSnapshot => {
  const requirementHints = (
    Object.keys(REQUIREMENT_SOURCE_FIELDS) as Array<
      keyof typeof REQUIREMENT_SOURCE_FIELDS
    >
  )
    .map((sourceType) => {
      const values = uniquePreservingOrder(rawIssue.requirement_sources?.[sourceType]);
      if (values.length === 0) {
        return null;
      }

      return {
        source_type: sourceType,
        values,
        source_field: REQUIREMENT_SOURCE_FIELDS[sourceType],
      };
    })
    .filter((hint): hint is NonNullable<typeof hint> => hint !== null);

  return JiraIssueSnapshotSchema.parse({
    issue_key: rawIssue.issue_key.trim(),
    issue_id: rawIssue.issue_id.trim(),
    issue_type_id: rawIssue.issue_type_id.trim(),
    project_key: rawIssue.project_key.trim(),
    summary: rawIssue.summary.trim(),
    description: rawIssue.description.trim(),
    status_name: rawIssue.status_name.trim(),
    labels: uniquePreservingOrder(rawIssue.labels),
    source_url: rawIssue.source_url?.trim() || null,
    requirement_hints: requirementHints,
    writeback_targets: projectProfile.jira.writeback_targets.map(mapWritebackTarget),
  });
};

export const readJiraIssueSnapshot = async ({
  projectProfile,
  issueKey,
  fetchIssue,
}: {
  projectProfile: ProjectProfile;
  issueKey: string;
  fetchIssue: JiraIssueFetcher;
}): Promise<JiraIssueSnapshot> => {
  const normalizedIssueKey = issueKey.trim();
  const timestamp = new Date().toISOString();

  try {
    const rawIssue = await fetchIssue(normalizedIssueKey);
    const invalidDetail = getInvalidRawIssueDetail(rawIssue);

    if (invalidDetail) {
      throw createInvalidJiraIssueError({
        issueKey: normalizedIssueKey,
        detail: invalidDetail,
        timestamp,
      });
    }

    return buildJiraIssueSnapshot({
      projectProfile,
      rawIssue,
    });
  } catch (error) {
    if (isStructuredError(error)) {
      throw error;
    }

    const connectorError = error as ConnectorErrorLike;

    if (isPermissionReadError(connectorError)) {
      throw createJiraPermissionDeniedError({
        issueKey: normalizedIssueKey,
        timestamp,
      });
    }

    if (isIssueNotFoundError(connectorError)) {
      throw createJiraIssueNotFoundError({
        issueKey: normalizedIssueKey,
        timestamp,
      });
    }

    if (isNetworkReadError(connectorError)) {
      throw createJiraNetworkError({
        issueKey: normalizedIssueKey,
        detail: connectorError.message,
        timestamp,
      });
    }

    throw createInvalidJiraIssueError({
      issueKey: normalizedIssueKey,
      detail:
        error instanceof Error
          ? error.message
          : 'Jira issue payload could not be normalized.',
      timestamp,
    });
  }
};

export const buildJiraWritebackPreviewDraft = ({
  issueSnapshot,
  target,
  gitlabArtifacts,
  verificationResultsRef,
  requirementRefs,
  generatedAt,
}: {
  issueSnapshot: JiraIssueSnapshot;
  target: JiraIssueWritebackTarget;
  gitlabArtifacts: GitLabArtifact[];
  verificationResultsRef: string | null;
  requirementRefs: RequirementReference[];
  generatedAt: string;
}): JiraWritebackDraft => {
  const normalizedIssueSnapshot = JiraIssueSnapshotSchema.parse(issueSnapshot);
  const marker = createWritebackMarker({
    issueKey: normalizedIssueSnapshot.issue_key,
    gitlabArtifacts,
  });
  const renderedPreview = renderPreviewBody({
    issueSnapshot: normalizedIssueSnapshot,
    gitlabArtifacts,
    verificationResultsRef,
    requirementRefs,
    marker,
  });
  const targetRef = createTargetRef({
    issueKey: normalizedIssueSnapshot.issue_key,
    target,
  });
  const requestPayload =
    target.target_type === 'comment'
      ? {
          body: renderedPreview,
          marker,
          generated_at: generatedAt,
        }
      : {
          fields: {
            [target.target_field_id_or_comment_mode]: renderedPreview,
          },
          marker,
          generated_at: generatedAt,
        };

  return JiraWritebackDraftSchema.parse({
    issue_key: normalizedIssueSnapshot.issue_key,
    target_type: target.target_type,
    target_field_id_or_comment_mode: target.target_field_id_or_comment_mode,
    target_ref: targetRef,
    rendered_preview: renderedPreview,
    request_payload: requestPayload,
    request_payload_hash: sha256(requestPayload),
    idempotency_key: `${createDedupeScope({
      issueKey: normalizedIssueSnapshot.issue_key,
      target,
    })}:${sha256(requestPayload).slice('sha256:'.length, 'sha256:'.length + 16)}`,
    dedupe_scope: createDedupeScope({
      issueKey: normalizedIssueSnapshot.issue_key,
      target,
    }),
    expected_target_version: null,
  });
};

export const buildJiraSubtaskPreviewDraft = ({
  projectProfile,
  issueSnapshot,
  generatedAt,
}: {
  projectProfile: ProjectProfile;
  issueSnapshot: JiraIssueSnapshot;
  generatedAt: string;
}): JiraSubtaskDraft => {
  const normalizedIssueSnapshot = JiraIssueSnapshotSchema.parse(issueSnapshot);
  const renderedSummary = applyIssueTemplate({
    template: projectProfile.jira.subtask.summary_template,
    issueSnapshot: normalizedIssueSnapshot,
  }).trim();
  const renderedDescription = projectProfile.jira.subtask.description_template
    ? applyIssueTemplate({
        template: projectProfile.jira.subtask.description_template,
        issueSnapshot: normalizedIssueSnapshot,
      }).trim()
    : null;
  const targetRef = createSubtaskTargetRef(normalizedIssueSnapshot.issue_key);
  const requestPayload = {
    fields: {
      project: {
        key: normalizedIssueSnapshot.project_key,
      },
      parent: {
        key: normalizedIssueSnapshot.issue_key,
      },
      issuetype: {
        id: projectProfile.jira.subtask.issue_type_id,
      },
      summary: renderedSummary,
      ...(renderedDescription ? { description: renderedDescription } : {}),
    },
    generated_at: generatedAt,
  };
  const dedupeScope = createSubtaskDedupeScope(normalizedIssueSnapshot.issue_key);

  return JiraSubtaskDraftSchema.parse({
    operation: 'jira.create_subtask',
    parent_issue_key: normalizedIssueSnapshot.issue_key,
    issue_type_id: projectProfile.jira.subtask.issue_type_id,
    target_ref: targetRef,
    rendered_summary: renderedSummary,
    rendered_preview: renderSubtaskPreview({
      issueSnapshot: normalizedIssueSnapshot,
      renderedSummary,
      renderedDescription,
      issueTypeId: projectProfile.jira.subtask.issue_type_id,
    }),
    request_payload: requestPayload,
    request_payload_hash: sha256(requestPayload),
    idempotency_key: `${dedupeScope}:${sha256(requestPayload).slice(
      'sha256:'.length,
      'sha256:'.length + 16,
    )}`,
    dedupe_scope: dedupeScope,
    dedupe_query: {
      parent_issue_key: normalizedIssueSnapshot.issue_key,
      issue_type_id: projectProfile.jira.subtask.issue_type_id,
      summary: renderedSummary,
    },
    expected_target_version: null,
  });
};

const createJiraResultUrl = (issueKey: string) =>
  `https://jira.example.com/browse/${issueKey}`;

export const createJiraExecuteResult = ({
  resultId,
  targetRef,
  targetVersion,
  issueKey,
  updatedAt,
  externalRequestId,
}: {
  resultId: string;
  targetRef: string;
  targetVersion: string;
  issueKey: string;
  updatedAt: string;
  externalRequestId: string | null;
}): JiraWritebackResult =>
  JiraWritebackResultSchema.parse({
    result_id: resultId,
    target_ref: targetRef,
    target_version: targetVersion,
    result_url: createJiraResultUrl(issueKey),
    already_applied: false,
    external_request_id: externalRequestId,
    updated_at: updatedAt,
  });

export const createJiraAlreadyAppliedResult = ({
  issueKey,
  targetRef,
  marker,
  externalRequestId,
  updatedAt,
}: {
  issueKey: string;
  targetRef: string;
  marker: string;
  externalRequestId: string | null;
  updatedAt: string;
}): JiraWritebackResult =>
  JiraWritebackResultSchema.parse({
    result_id: `already-applied:${sha256(marker).slice('sha256:'.length, 'sha256:'.length + 12)}`,
    target_ref: targetRef,
    target_version: 'already_applied',
    result_url: createJiraResultUrl(issueKey),
    already_applied: true,
    external_request_id: externalRequestId,
    updated_at: updatedAt,
  });

export const createJiraSubtaskExecuteResult = ({
  resultId,
  parentIssueKey,
  subtaskIssueKey,
  subtaskIssueId,
  targetVersion,
  updatedAt,
  externalRequestId,
}: {
  resultId: string;
  parentIssueKey: string;
  subtaskIssueKey: string;
  subtaskIssueId: string;
  targetVersion: string;
  updatedAt: string;
  externalRequestId: string | null;
}): JiraSubtaskResult =>
  JiraSubtaskResultSchema.parse({
    result_id: resultId,
    target_ref: createSubtaskTargetRef(parentIssueKey),
    target_version: targetVersion,
    result_url: createJiraResultUrl(subtaskIssueKey),
    already_applied: false,
    external_request_id: externalRequestId,
    updated_at: updatedAt,
    created_issue_key: subtaskIssueKey,
    created_issue_id: subtaskIssueId,
  });

export const createJiraSubtaskAlreadyAppliedResult = ({
  parentIssueKey,
  subtaskIssueKey,
  dedupeKey,
  externalRequestId,
  updatedAt,
}: {
  parentIssueKey: string;
  subtaskIssueKey: string;
  dedupeKey: string;
  externalRequestId: string | null;
  updatedAt: string;
}): JiraSubtaskResult =>
  JiraSubtaskResultSchema.parse({
    result_id: `already-applied:${sha256(dedupeKey).slice(
      'sha256:'.length,
      'sha256:'.length + 12,
    )}`,
    target_ref: createSubtaskTargetRef(parentIssueKey),
    target_version: 'already_applied',
    result_url: createJiraResultUrl(subtaskIssueKey),
    already_applied: true,
    external_request_id: externalRequestId,
    updated_at: updatedAt,
    created_issue_key: subtaskIssueKey,
    created_issue_id: null,
  });

const buildJiraBindingPreviewDraft = ({
  operation,
  bindingType,
  bindingValue,
  issueSnapshot,
  subtaskIssueKey,
  preferredSource,
  allowFallbackToBug,
  generatedAt,
}: {
  operation: 'jira.bind_branch' | 'jira.bind_commit';
  bindingType: 'branch' | 'commit';
  bindingValue: string;
  issueSnapshot: JiraIssueSnapshot;
  subtaskIssueKey?: string;
  preferredSource: 'bug' | 'subtask';
  allowFallbackToBug: boolean;
  generatedAt: string;
}): JiraBindingDraft => {
  const normalizedIssueSnapshot = JiraIssueSnapshotSchema.parse(issueSnapshot);
  const normalizedBindingValue = bindingValue.trim();
  const target = resolveBindingTarget({
    issueSnapshot: normalizedIssueSnapshot,
    subtaskIssueKey,
    preferredSource,
    allowFallbackToBug,
    operation,
    timestamp: generatedAt,
  });
  const requestPayload = {
    target_issue_key: target.targetIssueKey,
    target_issue_source: target.targetIssueSource,
    binding_type: bindingType,
    binding_value: normalizedBindingValue,
    generated_at: generatedAt,
  };
  const dedupeScope = createBindingDedupeScope({
    targetIssueKey: target.targetIssueKey,
    bindingType,
    bindingValue: normalizedBindingValue,
  });

  return JiraBindingDraftSchema.parse({
    operation,
    target_issue_key: target.targetIssueKey,
    target_issue_source: target.targetIssueSource,
    target_ref: createBindingTargetRef({
      targetIssueKey: target.targetIssueKey,
      bindingType,
    }),
    binding_value: normalizedBindingValue,
    rendered_preview: renderBindingPreview({
      operation,
      targetIssueKey: target.targetIssueKey,
      targetIssueSource: target.targetIssueSource,
      bindingValue: normalizedBindingValue,
    }),
    request_payload: requestPayload,
    request_payload_hash: sha256(requestPayload),
    idempotency_key: `${dedupeScope}:${sha256(requestPayload).slice(
      'sha256:'.length,
      'sha256:'.length + 16,
    )}`,
    dedupe_scope: dedupeScope,
    expected_target_version: null,
  });
};

const createJiraBindingExecuteResult = ({
  operation,
  bindingType,
  targetIssueKey,
  targetIssueSource,
  bindingValue,
  targetVersion,
  updatedAt,
  externalRequestId,
}: {
  operation: 'jira.bind_branch' | 'jira.bind_commit';
  bindingType: 'branch' | 'commit';
  targetIssueKey: string;
  targetIssueSource: 'bug' | 'subtask';
  bindingValue: string;
  targetVersion: string;
  updatedAt: string;
  externalRequestId: string | null;
}): JiraBindingResult =>
  {
    const normalizedBindingValue = bindingValue.trim();
    return JiraBindingResultSchema.parse({
      result_id: `${operation}:${sha256({
        targetIssueKey,
        bindingType,
        bindingValue: normalizedBindingValue,
        updatedAt,
      }).slice('sha256:'.length, 'sha256:'.length + 12)}`,
      target_ref: createBindingTargetRef({
        targetIssueKey,
        bindingType,
      }),
      target_version: targetVersion,
      result_url: createJiraResultUrl(targetIssueKey),
      already_applied: false,
      external_request_id: externalRequestId,
      updated_at: updatedAt,
      target_issue_key: targetIssueKey,
      target_issue_source: targetIssueSource,
      linked_value: normalizedBindingValue,
    });
  };

export const buildJiraBranchBindingPreviewDraft = ({
  projectProfile,
  issueSnapshot,
  branchName,
  subtaskIssueKey,
  generatedAt,
}: {
  projectProfile: ProjectProfile;
  issueSnapshot: JiraIssueSnapshot;
  branchName: string;
  subtaskIssueKey?: string;
  generatedAt: string;
}): JiraBindingDraft =>
  buildJiraBindingPreviewDraft({
    operation: 'jira.bind_branch',
    bindingType: 'branch',
    bindingValue: branchName,
    issueSnapshot,
    subtaskIssueKey,
    preferredSource: projectProfile.jira.branch_binding.target_issue_source,
    allowFallbackToBug:
      projectProfile.jira.branch_binding.fallback_to_bug ?? false,
    generatedAt,
  });

export const buildJiraCommitBindingPreviewDraft = ({
  projectProfile,
  issueSnapshot,
  commitSha,
  subtaskIssueKey,
  generatedAt,
}: {
  projectProfile: ProjectProfile;
  issueSnapshot: JiraIssueSnapshot;
  commitSha: string;
  subtaskIssueKey?: string;
  generatedAt: string;
}): JiraBindingDraft =>
  buildJiraBindingPreviewDraft({
    operation: 'jira.bind_commit',
    bindingType: 'commit',
    bindingValue: commitSha,
    issueSnapshot,
    subtaskIssueKey,
    preferredSource: projectProfile.jira.commit_binding.target_issue_source,
    allowFallbackToBug:
      projectProfile.jira.commit_binding.fallback_to_bug ?? false,
    generatedAt,
  });

export const createJiraBranchBindingExecuteResult = ({
  targetIssueKey,
  targetIssueSource,
  branchName,
  targetVersion,
  updatedAt,
  externalRequestId,
}: {
  targetIssueKey: string;
  targetIssueSource: 'bug' | 'subtask';
  branchName: string;
  targetVersion: string;
  updatedAt: string;
  externalRequestId: string | null;
}): JiraBindingResult =>
  createJiraBindingExecuteResult({
    operation: 'jira.bind_branch',
    bindingType: 'branch',
    targetIssueKey,
    targetIssueSource,
    bindingValue: branchName,
    targetVersion,
    updatedAt,
    externalRequestId,
  });

export const createJiraCommitBindingExecuteResult = ({
  targetIssueKey,
  targetIssueSource,
  commitSha,
  targetVersion,
  updatedAt,
  externalRequestId,
}: {
  targetIssueKey: string;
  targetIssueSource: 'bug' | 'subtask';
  commitSha: string;
  targetVersion: string;
  updatedAt: string;
  externalRequestId: string | null;
}): JiraBindingResult =>
  createJiraBindingExecuteResult({
    operation: 'jira.bind_commit',
    bindingType: 'commit',
    targetIssueKey,
    targetIssueSource,
    bindingValue: commitSha,
    targetVersion,
    updatedAt,
    externalRequestId,
  });

export const createJiraPermissionDeniedError = ({
  issueKey,
  timestamp,
}: {
  issueKey: string;
  timestamp: string;
}): StructuredError =>
  StructuredErrorSchema.parse({
    code: 'jira_permission_denied',
    category: 'permission_denied',
    stage: 'Intake',
    system: 'jira',
    operation: 'read_issue',
    target_ref: `jira:${issueKey}`,
    message: `Jira issue ${issueKey} cannot be read with the current credential or permission scope.`,
    detail: null,
    retryable: false,
    outcome_unknown: false,
    user_action:
      'Verify the Jira credential reference and issue permissions, then retry the Intake stage.',
    raw_cause_ref: null,
    partial_state_ref: null,
    timestamp,
  });

export const createInvalidJiraIssueError = ({
  issueKey,
  detail,
  timestamp,
}: {
  issueKey: string;
  detail: string;
  timestamp: string;
}): StructuredError =>
  StructuredErrorSchema.parse({
    code: 'jira_issue_invalid',
    category: 'validation_error',
    stage: 'Intake',
    system: 'jira',
    operation: 'read_issue',
    target_ref: `jira:${issueKey}`,
    message: `Jira issue ${issueKey} is missing required fields for Intake.`,
    detail,
    retryable: false,
    outcome_unknown: false,
    user_action:
      'Inspect the Jira issue payload mapping and confirm the issue belongs to the configured Jira project and issue type.',
    raw_cause_ref: null,
    partial_state_ref: null,
    timestamp,
  });

export const createJiraIssueNotFoundError = ({
  issueKey,
  timestamp,
}: {
  issueKey: string;
  timestamp: string;
}): StructuredError =>
  StructuredErrorSchema.parse({
    code: 'jira_issue_not_found',
    category: 'validation_error',
    stage: 'Intake',
    system: 'jira',
    operation: 'read_issue',
    target_ref: `jira:${issueKey}`,
    message: `Jira issue ${issueKey} does not exist or is not visible to the current project configuration.`,
    detail: null,
    retryable: false,
    outcome_unknown: false,
    user_action:
      'Confirm the issue key is correct and that it belongs to the configured Jira project, then retry the Intake stage.',
    raw_cause_ref: null,
    partial_state_ref: null,
    timestamp,
  });

export const createJiraNetworkError = ({
  issueKey,
  detail,
  timestamp,
}: {
  issueKey: string;
  detail: string | null;
  timestamp: string;
}): StructuredError =>
  StructuredErrorSchema.parse({
    code: 'jira_network_error',
    category: 'network_error',
    stage: 'Intake',
    system: 'jira',
    operation: 'read_issue',
    target_ref: `jira:${issueKey}`,
    message: `Jira issue ${issueKey} could not be read because the connector transport failed.`,
    detail,
    retryable: true,
    outcome_unknown: false,
    user_action:
      'Retry when the Jira connector transport is healthy, or verify the connector network path before retrying.',
    raw_cause_ref: null,
    partial_state_ref: null,
    timestamp,
  });
