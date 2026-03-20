import { createHash } from 'node:crypto';

import {
  FeishuRecordDraftSchema,
  FeishuRecordResultSchema,
  JiraIssueSnapshotSchema,
  type FeishuRecordDraft,
  type FeishuRecordResult,
  type GitLabArtifact,
  type JiraIssueSnapshot,
  type ProjectProfile,
  type RequirementReference,
} from '../../../domain/index.js';

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, nestedValue]) =>
          `${JSON.stringify(key)}:${stableStringify(nestedValue)}`,
      )
      .join(',')}}`;
  }

  return JSON.stringify(value);
};

const sha256 = (value: unknown) =>
  `sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`;

const createFeishuMarker = ({
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

const createFeishuTargetRef = ({
  spaceId,
  docId,
  blockIdOrAnchor,
}: {
  spaceId: string;
  docId: string;
  blockIdOrAnchor: string;
}) => `feishu://${spaceId}/doc/${docId}/anchor/${blockIdOrAnchor}`;

const createFeishuDedupeScope = ({
  spaceId,
  docId,
  blockIdOrAnchor,
  writeMode,
}: {
  spaceId: string;
  docId: string;
  blockIdOrAnchor: string;
  writeMode: 'append' | 'replace_block';
}) => `feishu:${spaceId}:${docId}:anchor:${blockIdOrAnchor}:${writeMode}`;

const renderRequirementLine = (requirementRefs: RequirementReference[]) =>
  requirementRefs.find(
    (reference) => reference.requirement_binding_status === 'resolved',
  )?.requirement_ref ?? '未绑定需求';

const renderGitLabLines = (gitlabArtifacts: GitLabArtifact[]) =>
  gitlabArtifacts.length === 0
    ? ['- GitLab links: none recorded']
    : gitlabArtifacts.map((artifact) => {
        if (artifact.artifact_type === 'commit') {
          return `- Commit: ${artifact.commit_sha} (${artifact.commit_url})`;
        }

        if (artifact.artifact_type === 'branch') {
          return `- Branch: ${artifact.branch_name}`;
        }

        return `- Merge request: !${artifact.mr_iid} (${artifact.mr_url})`;
      });

const renderFeishuPreview = ({
  issueSnapshot,
  requirementRefs,
  gitlabArtifacts,
  verificationResultsRef,
  rootCauseHypotheses,
  fixPlan,
  marker,
}: {
  issueSnapshot: JiraIssueSnapshot;
  requirementRefs: RequirementReference[];
  gitlabArtifacts: GitLabArtifact[];
  verificationResultsRef: string | null;
  rootCauseHypotheses: string[];
  fixPlan: string[];
  marker: string;
}) =>
  [
    `Bugfix record for ${issueSnapshot.issue_key}`,
    '',
    `所属需求: ${renderRequirementLine(requirementRefs)}`,
    `Jira 编号: ${issueSnapshot.issue_key}`,
    `问题现象: ${issueSnapshot.summary}`,
    `根因分析: ${rootCauseHypotheses[0] ?? '待补充'}`,
    `解决方案: ${fixPlan[0] ?? '待补充'}`,
    `验证结果: ${verificationResultsRef ?? 'not-recorded'}`,
    'GitLab 链接:',
    ...renderGitLabLines(gitlabArtifacts),
    '',
    `<!-- ${marker} -->`,
  ].join('\n');

export const buildFeishuRecordPreviewDraft = ({
  projectProfile,
  issueSnapshot,
  requirementRefs,
  gitlabArtifacts,
  verificationResultsRef,
  rootCauseHypotheses,
  fixPlan,
  generatedAt,
}: {
  projectProfile: ProjectProfile;
  issueSnapshot: JiraIssueSnapshot;
  requirementRefs: RequirementReference[];
  gitlabArtifacts: GitLabArtifact[];
  verificationResultsRef: string | null;
  rootCauseHypotheses: string[];
  fixPlan: string[];
  generatedAt: string;
}): FeishuRecordDraft => {
  const normalizedIssueSnapshot = JiraIssueSnapshotSchema.parse(issueSnapshot);
  const marker = createFeishuMarker({
    issueKey: normalizedIssueSnapshot.issue_key,
    gitlabArtifacts,
  });
  const targetRef = createFeishuTargetRef({
    spaceId: projectProfile.feishu.space_id,
    docId: projectProfile.feishu.doc_id,
    blockIdOrAnchor: projectProfile.feishu.block_path_or_anchor,
  });
  const renderedPreview = renderFeishuPreview({
    issueSnapshot: normalizedIssueSnapshot,
    requirementRefs,
    gitlabArtifacts,
    verificationResultsRef,
    rootCauseHypotheses,
    fixPlan,
    marker,
  });
  const requestPayload = {
    write_mode: 'append' as const,
    target_ref: targetRef,
    template_id: projectProfile.feishu.template_id,
    template_version: projectProfile.feishu.template_version,
    body: renderedPreview,
    marker,
    generated_at: generatedAt,
  };

  return FeishuRecordDraftSchema.parse({
    space_id: projectProfile.feishu.space_id,
    doc_id: projectProfile.feishu.doc_id,
    block_id_or_anchor: projectProfile.feishu.block_path_or_anchor,
    template_id: projectProfile.feishu.template_id,
    template_version: projectProfile.feishu.template_version,
    write_mode: 'append',
    target_ref: targetRef,
    rendered_preview: renderedPreview,
    request_payload: requestPayload,
    request_payload_hash: sha256(requestPayload),
    idempotency_key: `${createFeishuDedupeScope({
      spaceId: projectProfile.feishu.space_id,
      docId: projectProfile.feishu.doc_id,
      blockIdOrAnchor: projectProfile.feishu.block_path_or_anchor,
      writeMode: 'append',
    })}:${sha256(requestPayload).slice('sha256:'.length, 'sha256:'.length + 16)}`,
    dedupe_scope: createFeishuDedupeScope({
      spaceId: projectProfile.feishu.space_id,
      docId: projectProfile.feishu.doc_id,
      blockIdOrAnchor: projectProfile.feishu.block_path_or_anchor,
      writeMode: 'append',
    }),
    expected_target_version: null,
  });
};

export const createFeishuExecuteResult = ({
  resultId,
  targetRef,
  targetVersion,
  resultUrl,
  externalRequestId,
  updatedAt,
}: {
  resultId: string;
  targetRef: string;
  targetVersion: string;
  resultUrl: string;
  externalRequestId: string | null;
  updatedAt: string;
}): FeishuRecordResult =>
  FeishuRecordResultSchema.parse({
    result_id: resultId,
    target_ref: targetRef,
    target_version: targetVersion,
    result_url: resultUrl,
    already_applied: false,
    external_request_id: externalRequestId,
    updated_at: updatedAt,
  });

export const createFeishuAlreadyAppliedResult = ({
  resultId,
  targetRef,
  targetVersion,
  resultUrl,
  externalRequestId,
  updatedAt,
}: {
  resultId: string;
  targetRef: string;
  targetVersion: string;
  resultUrl: string;
  externalRequestId: string | null;
  updatedAt: string;
}): FeishuRecordResult =>
  FeishuRecordResultSchema.parse({
    result_id: resultId,
    target_ref: targetRef,
    target_version: targetVersion,
    result_url: resultUrl,
    already_applied: true,
    external_request_id: externalRequestId,
    updated_at: updatedAt,
  });

export const executeFeishuRecordWithStub = ({
  draft,
  updatedAt,
  externalRequestId,
}: {
  draft: FeishuRecordDraft;
  updatedAt: string;
  externalRequestId?: string | null;
}): FeishuRecordResult => {
  const requestHashSuffix = draft.request_payload_hash.slice(
    'sha256:'.length,
    'sha256:'.length + 12,
  );

  return createFeishuExecuteResult({
    resultId: `feishu-record:${draft.doc_id}:${requestHashSuffix}`,
    targetRef: draft.target_ref,
    targetVersion: `stub-${requestHashSuffix}`,
    resultUrl: `https://feishu.example.com/doc/${draft.doc_id}`,
    externalRequestId:
      externalRequestId ?? `stub:feishu:${draft.doc_id}:${requestHashSuffix}`,
    updatedAt,
  });
};
