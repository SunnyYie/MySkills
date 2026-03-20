import {
  type ProjectContextData,
  type CodeLocalizationStageResult,
  type ExecutionContext,
  type FixPlanningStageResult,
  type JiraIssueSnapshot,
  type JiraIntakeStageResult,
  type ProjectContextStageResult,
  type ProjectProfile,
  type RequirementBrief,
  type RequirementSynthesisStageResult,
} from '../domain/index.js';
import { locateCodeTargets } from '../skills/code-locator/index.js';
import { createFixPlan } from '../skills/fix-planner/index.js';
import { runJiraIntake } from '../skills/jira-intake/index.js';
import { resolveProjectContext } from '../skills/project-context/index.js';
import { synthesizeRequirementBrief } from '../skills/requirement-summarizer/index.js';

type AnalysisStage =
  | 'Intake'
  | 'Context Resolution'
  | 'Requirement Synthesis'
  | 'Code Localization'
  | 'Fix Planning';

type AnalysisStageResults = Partial<{
  Intake: JiraIntakeStageResult;
  'Context Resolution': ProjectContextStageResult;
  'Requirement Synthesis': RequirementSynthesisStageResult;
  'Code Localization': CodeLocalizationStageResult;
  'Fix Planning': FixPlanningStageResult;
}>;

type AnalysisStageContextPatch = Partial<
  Pick<
    ExecutionContext,
    | 'requirement_refs'
    | 'repo_selection'
    | 'code_targets'
    | 'root_cause_hypotheses'
    | 'fix_plan'
    | 'verification_plan'
  >
>;

type AnalysisStageExecution = {
  stage: AnalysisStage;
  result:
    | JiraIntakeStageResult
    | ProjectContextStageResult
    | RequirementSynthesisStageResult
    | CodeLocalizationStageResult
    | FixPlanningStageResult;
  contextPatch: AnalysisStageContextPatch;
};

export type InitialAnalysisFlowResult = {
  currentStage: AnalysisStage;
  stageResults: AnalysisStageResults;
  stageExecutions: AnalysisStageExecution[];
};

type RunInitialAnalysisFlowInput = {
  projectProfile: ProjectProfile;
  issueSnapshot: JiraIssueSnapshot;
  generatedAt?: string;
};

const defaultGeneratedAt = () => new Date().toISOString();

export const runInitialAnalysisFlow = async ({
  projectProfile,
  issueSnapshot,
  generatedAt = defaultGeneratedAt(),
}: RunInitialAnalysisFlowInput): Promise<InitialAnalysisFlowResult> => {
  const stageResults: AnalysisStageResults = {};
  const stageExecutions: AnalysisStageExecution[] = [];

  const intakeResult = runJiraIntake({
    issueSnapshot,
    generatedAt,
  });
  stageResults.Intake = intakeResult;
  stageExecutions.push({
    stage: 'Intake',
    result: intakeResult,
    contextPatch: {},
  });

  const projectContext = await resolveProjectContext({
    projectProfile,
    issueSnapshot,
    generatedAt,
  });
  stageResults['Context Resolution'] = projectContext;
  const projectContextPatch: AnalysisStageContextPatch =
    projectContext.status === 'completed' && projectContext.data
      ? {
          requirement_refs: [projectContext.data.requirement],
          repo_selection: projectContext.data.repo_selection,
        }
      : {};
  stageExecutions.push({
    stage: 'Context Resolution',
    result: projectContext,
    contextPatch: projectContextPatch,
  });

  if (projectContext.status !== 'completed' || !projectContext.data) {
    return {
      currentStage: 'Context Resolution',
      stageResults,
      stageExecutions,
    };
  }

  const requirementSynthesis = synthesizeRequirementBrief({
    projectProfile,
    issueSnapshot,
    projectContext: projectContext.data,
    generatedAt,
  });
  stageResults['Requirement Synthesis'] = requirementSynthesis;
  stageExecutions.push({
    stage: 'Requirement Synthesis',
    result: requirementSynthesis,
    contextPatch: {},
  });

  return {
    currentStage: 'Requirement Synthesis',
    stageResults,
    stageExecutions,
  };
};

type PostRequirementApprovalFlowInput = {
  projectProfile: ProjectProfile;
  issueSnapshot: JiraIssueSnapshot;
  projectContext: ProjectContextData;
  requirementBrief: RequirementBrief;
  generatedAt?: string;
};

export const runPostRequirementApprovalFlow = async ({
  projectProfile,
  issueSnapshot,
  projectContext,
  requirementBrief,
  generatedAt = defaultGeneratedAt(),
}: PostRequirementApprovalFlowInput): Promise<InitialAnalysisFlowResult> => {
  const stageResults: AnalysisStageResults = {};
  const stageExecutions: AnalysisStageExecution[] = [];

  const codeLocalization = await locateCodeTargets({
    projectProfile,
    issueSnapshot,
    projectContext,
    requirementBrief,
    generatedAt,
  });
  stageResults['Code Localization'] = codeLocalization;
  const codeLocalizationPatch: AnalysisStageContextPatch =
    codeLocalization.status === 'completed' && codeLocalization.data
      ? {
          code_targets: codeLocalization.data.code_targets,
          root_cause_hypotheses: codeLocalization.data.root_cause_hypotheses,
        }
      : {};
  stageExecutions.push({
    stage: 'Code Localization',
    result: codeLocalization,
    contextPatch: codeLocalizationPatch,
  });

  if (codeLocalization.status !== 'completed' || !codeLocalization.data) {
    return {
      currentStage: 'Code Localization',
      stageResults,
      stageExecutions,
    };
  }

  const fixPlanning = createFixPlan({
    projectProfile,
    issueSnapshot,
    projectContext,
    requirementBrief,
    codeLocalization,
    generatedAt,
  });
  stageResults['Fix Planning'] = fixPlanning;
  const fixPlanningPatch: AnalysisStageContextPatch =
    fixPlanning.status === 'completed' && fixPlanning.data
      ? {
          fix_plan: [fixPlanning.data.fix_summary, ...fixPlanning.data.open_risks],
          verification_plan: fixPlanning.data.verification_plan,
        }
      : {};
  stageExecutions.push({
    stage: 'Fix Planning',
    result: fixPlanning,
    contextPatch: fixPlanningPatch,
  });

  return {
    currentStage: 'Fix Planning',
    stageResults,
    stageExecutions,
  };
};
