import {
  JiraIssueSnapshotSchema,
  StructuredErrorSchema,
  type JiraIssueSnapshot,
  type ProjectProfile,
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
