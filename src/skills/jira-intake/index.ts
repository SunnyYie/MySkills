import {
  JiraIntakeStageResultSchema,
  JiraIssueSnapshotSchema,
  type JiraIntakeStageResult,
  type JiraIssueSnapshot,
} from '../../domain/index.js';

const defaultGeneratedAt = () => new Date().toISOString();

export const loadJiraIssueSnapshotArtifact = ({
  snapshotArtifact,
}: {
  snapshotArtifact: unknown;
}): JiraIssueSnapshot => JiraIssueSnapshotSchema.parse(snapshotArtifact);

export const runJiraIntake = ({
  issueSnapshot,
  generatedAt = defaultGeneratedAt(),
}: {
  issueSnapshot: JiraIssueSnapshot;
  generatedAt?: string;
}): JiraIntakeStageResult => {
  const snapshot = JiraIssueSnapshotSchema.parse(issueSnapshot);
  const requirementHintCount = snapshot.requirement_hints.length;

  return JiraIntakeStageResultSchema.parse({
    status: 'completed',
    summary: `Loaded Jira issue ${snapshot.issue_key} with ${requirementHintCount} requirement hint source${requirementHintCount === 1 ? '' : 's'}.`,
    data: {
      issue_key: snapshot.issue_key,
      issue_status: snapshot.status_name,
      requirement_hint_count: requirementHintCount,
      writeback_target_count: snapshot.writeback_targets.length,
    },
    warnings: [],
    errors: [],
    waiting_for: null,
    source_refs: [`jira:${snapshot.issue_key}`, `jira-snapshot:${snapshot.issue_key}`],
    generated_at: generatedAt,
  });
};

export const runJiraIntakeFromArtifact = ({
  snapshotArtifact,
  generatedAt = defaultGeneratedAt(),
}: {
  snapshotArtifact: unknown;
  generatedAt?: string;
}): JiraIntakeStageResult =>
  runJiraIntake({
    issueSnapshot: loadJiraIssueSnapshotArtifact({ snapshotArtifact }),
    generatedAt,
  });
