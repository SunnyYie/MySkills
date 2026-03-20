import {
  BugfixReportSchema,
  type ApprovalRecord,
  type BugfixReport,
  type ExecutionContext,
} from '../../domain/index.js';

type CreateBugfixReportInput = {
  context: ExecutionContext;
  approvalHistory?: ApprovalRecord[];
  verificationSummary?: string | null;
  externalOutcomes?: string[];
  openRisks?: string[];
  generatedAt?: string;
  reportId?: string;
};

const defaultGeneratedAt = () => new Date().toISOString();

const uniqueValues = (values: Array<string | null | undefined>) =>
  [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];

const formatRequirementRefs = (context: ExecutionContext) =>
  context.requirement_refs.map((reference) =>
    reference.requirement_ref ??
    `unresolved requirement (${reference.binding_reason ?? 'manual follow-up required'})`,
  );

const formatCodeLocations = (context: ExecutionContext) =>
  context.code_targets.map(
    (target) => `${target.file_path} - ${target.reason}`,
  );

const formatRootCauseSummary = (context: ExecutionContext) =>
  uniqueValues(context.root_cause_hypotheses).join(' ') ||
  'Root cause analysis has not been recorded yet.';

const formatFixSummary = (context: ExecutionContext) =>
  uniqueValues(context.fix_plan).join(' ') ||
  'Fix summary has not been recorded yet.';

const formatVerificationSummary = ({
  context,
  verificationSummary,
}: Pick<CreateBugfixReportInput, 'context' | 'verificationSummary'>) =>
  verificationSummary?.trim() ||
  (context.verification_results_ref
    ? `Verification results recorded at ${context.verification_results_ref}.`
    : 'Verification results have not been recorded yet.');

const formatGitLabArtifactRef = (context: ExecutionContext) =>
  context.gitlab_artifacts.map((artifact) => {
    if (artifact.artifact_type === 'commit') {
      return `gitlab:commit:${artifact.commit_sha}`;
    }

    if (artifact.artifact_type === 'branch') {
      return `gitlab:branch:${artifact.branch_name}`;
    }

    return `gitlab:mr:${artifact.mr_iid}`;
  });

const formatArtifacts = (context: ExecutionContext) =>
  uniqueValues([
    ...formatGitLabArtifactRef(context),
    context.verification_results_ref,
    context.jira_writeback_draft_ref,
    context.jira_writeback_result_ref,
    context.feishu_record_draft_ref,
    context.feishu_record_result_ref,
  ]);

const formatApprovalHistory = (approvalHistory: ApprovalRecord[]) =>
  approvalHistory.map((approval) => {
    const decisionLabel =
      approval.decision === 'revise' && approval.rollback_to_stage
        ? `revise to ${approval.rollback_to_stage}`
        : approval.decision;
    const decidedAt = approval.decided_at ?? 'pending-decision';

    return `${approval.stage} ${decisionLabel}d by ${approval.decider} at ${decidedAt} (preview: ${approval.preview_ref})`;
  });

const deriveJiraWritebackSummary = (context: ExecutionContext) => {
  if (context.jira_writeback_result_ref) {
    return `Jira writeback executed successfully (result ref: ${context.jira_writeback_result_ref}).`;
  }

  if (context.jira_writeback_draft_ref) {
    return 'Jira writeback preview exists but execution has not completed yet.';
  }

  return 'Jira writeback has not produced any preview or execution result in this run.';
};

const deriveFeishuRecordSummary = (context: ExecutionContext) => {
  if (context.feishu_record_result_ref) {
    return `Feishu knowledge record executed successfully (result ref: ${context.feishu_record_result_ref}).`;
  }

  if (context.feishu_record_draft_ref) {
    return 'Feishu knowledge record preview exists but execution has not completed yet.';
  }

  return 'Feishu knowledge record has not produced any preview or execution result in this run.';
};

const deriveExternalOutcomes = (context: ExecutionContext) =>
  uniqueValues([
    context.jira_writeback_result_ref
      ? 'Jira writeback executed successfully.'
      : context.jira_writeback_draft_ref
        ? 'Jira writeback preview is ready.'
        : null,
    context.feishu_record_result_ref
      ? 'Feishu knowledge record executed successfully.'
      : context.feishu_record_draft_ref
        ? 'Feishu knowledge record preview is ready.'
        : null,
  ]);

const deriveOpenRisks = ({
  context,
  openRisks,
}: Pick<CreateBugfixReportInput, 'context' | 'openRisks'>) =>
  uniqueValues([
    ...(openRisks ?? []),
    ...context.requirement_refs
      .filter(
        (reference) => reference.requirement_binding_status === 'unresolved',
      )
      .map(
        (reference) =>
          `Requirement binding remains unresolved: ${reference.binding_reason ?? 'manual follow-up required.'}`,
      ),
    context.waiting_reason ? `Run is waiting on: ${context.waiting_reason}` : null,
    context.active_error_ref
      ? `Active error reference remains open: ${context.active_error_ref}`
      : null,
  ]);

const deriveFailureSummary = (context: ExecutionContext) => {
  if (context.run_outcome_status === 'success') {
    return null;
  }

  if (context.run_outcome_status === 'partial_success') {
    return `Run completed with partial success; review active error ref ${context.active_error_ref ?? 'unknown'} before retrying remaining writeback steps.`;
  }

  if (context.run_outcome_status === 'failed') {
    return `Run failed before all downstream outputs completed; inspect active error ref ${context.active_error_ref ?? 'unknown'} for recovery details.`;
  }

  if (context.run_outcome_status === 'cancelled') {
    return `Run was cancelled before completion; latest waiting reason: ${context.waiting_reason ?? 'not recorded'}.`;
  }

  return `Run has not reached a clean terminal success state yet; current outcome is ${context.run_outcome_status}.`;
};

export const createBugfixReport = ({
  context,
  approvalHistory = [],
  verificationSummary = null,
  externalOutcomes,
  openRisks = [],
  generatedAt = defaultGeneratedAt(),
  reportId = `report://${context.run_id}`,
}: CreateBugfixReportInput): BugfixReport =>
  BugfixReportSchema.parse({
    report_id: reportId,
    run_id: context.run_id,
    final_status: context.run_outcome_status,
    issue_ref: context.jira_issue_snapshot_ref,
    requirement_refs: formatRequirementRefs(context),
    code_locations: formatCodeLocations(context),
    root_cause_summary: formatRootCauseSummary(context),
    fix_summary: formatFixSummary(context),
    verification_summary: formatVerificationSummary({
      context,
      verificationSummary,
    }),
    artifacts: formatArtifacts(context),
    jira_writeback_summary: deriveJiraWritebackSummary(context),
    feishu_record_summary: deriveFeishuRecordSummary(context),
    external_outcomes:
      externalOutcomes && externalOutcomes.length > 0
        ? uniqueValues(externalOutcomes)
        : deriveExternalOutcomes(context),
    approval_history: formatApprovalHistory(approvalHistory),
    open_risks: deriveOpenRisks({
      context,
      openRisks,
    }),
    failure_summary: deriveFailureSummary(context),
    generated_at: generatedAt,
    config_version: context.config_version,
  });
