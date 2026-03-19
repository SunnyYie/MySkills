import { GitLabArtifactSchema, type GitLabArtifact } from '../../domain/index.js';

type GitLabConfigInput = {
  project_id: string;
  default_branch: string;
  base_url: string;
};

type GitLabArtifactDraft = {
  artifact_source: GitLabArtifact['artifact_source'];
  artifact_type: GitLabArtifact['artifact_type'];
  project_id?: string;
  project_path?: string;
  default_branch?: string;
  branch_name?: string;
  commit_sha?: string;
  commit_url?: string;
  mr_iid?: number;
  mr_url?: string;
  created_at?: string;
};

type NormalizeGitLabArtifactsInput = {
  gitlabConfig: GitLabConfigInput;
  artifacts: GitLabArtifactDraft[];
  recordedAt?: string;
};

const defaultTimestamp = () => new Date().toISOString();

const normalizeString = (value: string | undefined) => value?.trim();

const normalizeArtifact = ({
  gitlabConfig,
  artifact,
  recordedAt,
}: {
  gitlabConfig: GitLabConfigInput;
  artifact: GitLabArtifactDraft;
  recordedAt: string;
}): GitLabArtifact =>
  GitLabArtifactSchema.parse({
    artifact_source: artifact.artifact_source,
    artifact_type: artifact.artifact_type,
    project_id: normalizeString(artifact.project_id) ?? gitlabConfig.project_id.trim(),
    project_path:
      normalizeString(artifact.project_path) ?? gitlabConfig.project_id.trim(),
    default_branch:
      normalizeString(artifact.default_branch) ?? gitlabConfig.default_branch.trim(),
    branch_name: normalizeString(artifact.branch_name),
    commit_sha: normalizeString(artifact.commit_sha)?.toLowerCase(),
    commit_url: normalizeString(artifact.commit_url),
    mr_iid: artifact.mr_iid,
    mr_url: normalizeString(artifact.mr_url),
    created_at: normalizeString(artifact.created_at) ?? recordedAt,
  });

export const normalizeGitLabArtifacts = ({
  gitlabConfig,
  artifacts,
  recordedAt = defaultTimestamp(),
}: NormalizeGitLabArtifactsInput): GitLabArtifact[] =>
  artifacts.map((artifact) =>
    normalizeArtifact({
      gitlabConfig,
      artifact,
      recordedAt,
    }),
  );
