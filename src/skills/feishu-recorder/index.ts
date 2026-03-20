import type {
  FeishuRecordDraft,
  FeishuRecordResult,
  GitLabArtifact,
  JiraIssueSnapshot,
  ProjectProfile,
  RequirementReference,
} from '../../domain/index.js';
import {
  buildFeishuRecordPreviewDraft,
  executeFeishuRecordWithStub,
} from '../../infrastructure/connectors/index.js';

export const FEISHU_RECORDER_SKILL = 'feishu-recorder' as const;

export const prepareFeishuRecord = ({
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
}): FeishuRecordDraft =>
  buildFeishuRecordPreviewDraft({
    projectProfile,
    issueSnapshot,
    requirementRefs,
    gitlabArtifacts,
    verificationResultsRef,
    rootCauseHypotheses,
    fixPlan,
    generatedAt,
  });

export const executeFeishuRecord = ({
  draft,
  updatedAt,
}: {
  draft: FeishuRecordDraft;
  updatedAt: string;
}): FeishuRecordResult =>
  executeFeishuRecordWithStub({
    draft,
    updatedAt,
  });
