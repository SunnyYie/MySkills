import { createHash } from 'node:crypto';

import {
  JiraIssueSnapshotSchema,
  JiraWritebackDraftSchema,
  JiraWritebackResultSchema,
  StructuredErrorSchema,
  type GitLabArtifact,
  type JiraIssueSnapshot,
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
