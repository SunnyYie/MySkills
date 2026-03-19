import {
  FixPlanningStageResultSchema,
  type CodeLocalizationStageResult,
  type FixPlanningData,
  type FixPlanningStageResult,
  type JiraIssueSnapshot,
  type ProjectContextData,
  type ProjectProfile,
  type RequirementBrief,
} from '../../domain/index.js';

type CreateFixPlanInput = {
  projectProfile: ProjectProfile;
  issueSnapshot: JiraIssueSnapshot;
  projectContext: ProjectContextData;
  requirementBrief: RequirementBrief;
  codeLocalization: CodeLocalizationStageResult;
  generatedAt?: string;
};

const defaultGeneratedAt = () => new Date().toISOString();

const uniqueValues = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

const buildFixPlanningData = ({
  issueSnapshot,
  projectContext,
  requirementBrief,
  codeLocalization,
}: Pick<
  CreateFixPlanInput,
  'issueSnapshot' | 'projectContext' | 'requirementBrief' | 'codeLocalization'
>): FixPlanningData => {
  const localizationData = codeLocalization.data!;
  const primaryTarget = localizationData.code_targets[0];
  const impactScope = uniqueValues([
    ...localizationData.impact_modules.map(
      (moduleId) => `${moduleId} module coupon validation flow`,
    ),
    ...localizationData.code_targets.map((target) => target.file_path),
  ]);
  const verificationPlan = uniqueValues([
    `Re-run the ${issueSnapshot.issue_key} regression path after the manual fix is applied.`,
    `Capture verification evidence for ${primaryTarget.file_path} before advancing beyond Execution.`,
    ...requirementBrief.pending_questions.map(
      (question) => `Confirm: ${question}`,
    ),
  ]);
  const openRisks = uniqueValues([
    'The final manual fix has not been applied yet, so this plan remains a proposal until Execution receives external results.',
    ...(
      requirementBrief.requirement_binding_status === 'unresolved'
        ? [
            `Requirement binding is unresolved: ${requirementBrief.binding_reason ?? 'manual confirmation is still required.'}`,
          ]
        : []
    ),
    ...requirementBrief.pending_questions.map(
      (question) => `Pending question: ${question}`,
    ),
  ]);

  return {
    fix_summary:
      `Prepare a manual fix for ${issueSnapshot.issue_key} by updating ${primaryTarget.file_path} in ${projectContext.project_id} and guarding the localized regression path before downstream artifact linking.`,
    impact_scope: impactScope,
    verification_plan: verificationPlan,
    open_risks: openRisks,
    pending_external_inputs: [
      'Provide the final GitLab artifact reference after the manual fix is applied.',
      'Record the final verification evidence after the manual fix is applied.',
    ],
    referenced_code_targets: localizationData.code_targets,
    referenced_root_cause_hypotheses: localizationData.root_cause_hypotheses,
  };
};

export const createFixPlan = ({
  projectProfile,
  issueSnapshot,
  projectContext,
  requirementBrief,
  codeLocalization,
  generatedAt = defaultGeneratedAt(),
}: CreateFixPlanInput): FixPlanningStageResult => {
  const sourceRefs = uniqueValues([
    `jira:${issueSnapshot.issue_key}`,
    `brief:${requirementBrief.issue_key}`,
    `code-localization:${issueSnapshot.issue_key}`,
    `repo:${projectContext.repo_selection.repo_path}`,
    ...codeLocalization.source_refs,
  ]);
  const localizationData = codeLocalization.data;

  if (
    codeLocalization.status !== 'completed' ||
    !localizationData ||
    localizationData.code_targets.length === 0 ||
    localizationData.root_cause_hypotheses.length === 0
  ) {
    return FixPlanningStageResultSchema.parse({
      status: 'waiting',
      summary:
        `Fix Planning for ${issueSnapshot.issue_key} is waiting for Code Localization to resolve before a reviewable plan can be produced.`,
      data: null,
      warnings: uniqueValues([
        'Fix Planning is blocked until Code Localization resolves to a single actionable code target.',
        ...codeLocalization.warnings,
      ]),
      errors: codeLocalization.errors,
      waiting_for: codeLocalization.waiting_for ?? 'code_localization',
      source_refs: sourceRefs,
      generated_at: generatedAt,
    });
  }

  const data = buildFixPlanningData({
    issueSnapshot,
    projectContext,
    requirementBrief,
    codeLocalization: {
      ...codeLocalization,
      data: localizationData,
    },
  });
  const warnings =
    requirementBrief.requirement_binding_status === 'unresolved' &&
    projectProfile.approval_policy.requirement_binding_required
      ? [
          'Requirement binding still needs manual confirmation before downstream writeback stages can proceed.',
        ]
      : [];

  return FixPlanningStageResultSchema.parse({
    status: 'completed',
    summary:
      `Prepared an approval-ready fix plan for ${issueSnapshot.issue_key} from ${data.referenced_code_targets.length} localized code target.`,
    data,
    warnings,
    errors: [],
    waiting_for: null,
    source_refs: sourceRefs,
    generated_at: generatedAt,
  });
};
