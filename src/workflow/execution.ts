import {
  type ExecutionContext,
  type GitLabArtifact,
  type StructuredError,
} from '../domain/index.js';

type ExecutionExternalInputKey =
  | 'gitlab_artifacts'
  | 'verification_results'
  | 'branch_binding';

type ExecutionExternalInputState = {
  stageStatus: 'waiting_external_input' | 'completed';
  runLifecycleStatus: 'waiting_external_input' | 'active';
  waitingReason: string | null;
  missingInputs: ExecutionExternalInputKey[];
  summary: string;
};

type RecordExecutionExternalInputsInput = {
  context: ExecutionContext;
  updatedAt: string;
  gitlabArtifacts?: GitLabArtifact[];
  verificationResultsRef?: string | null;
  branchBindingRef?: string | null;
};

type RecordExecutionExternalInputsResult = {
  accepted: boolean;
  context: ExecutionContext;
  state: ExecutionExternalInputState;
  warnings: string[];
  errors: StructuredError[];
};

const EXECUTION_STAGE = 'Execution';

const getArtifactIdentity = (artifact: GitLabArtifact) => {
  if (artifact.artifact_type === 'commit') {
    return `commit:${artifact.project_id}:${artifact.commit_sha}`;
  }

  if (artifact.artifact_type === 'branch') {
    return `branch:${artifact.project_id}:${artifact.branch_name}`;
  }

  return `mr:${artifact.project_id}:${artifact.mr_iid}`;
};

const buildConflictError = (
  targetRef: string,
  timestamp: string,
): StructuredError => ({
  code: 'EXECUTION_EXTERNAL_INPUT_CONFLICT',
  category: 'state_conflict',
  stage: EXECUTION_STAGE,
  system: 'workflow',
  operation: 'record-external-input',
  target_ref: targetRef,
  message:
    'The supplied external input conflicts with the current effective Execution artifact set.',
  detail:
    'Use a new artifact identity or roll back to Execution before replacing the current effective artifact.',
  retryable: false,
  outcome_unknown: false,
  user_action:
    'Keep the current artifact set or revise the run before recording a conflicting replacement.',
  raw_cause_ref: null,
  partial_state_ref: null,
  timestamp,
});

const getMissingExecutionInputs = (
  context: Pick<
    ExecutionContext,
    'gitlab_artifacts' | 'verification_results_ref' | 'git_branch_binding_ref'
  >,
): ExecutionExternalInputKey[] => {
  const missing: ExecutionExternalInputKey[] = [];

  if (context.gitlab_artifacts.length === 0) {
    missing.push('gitlab_artifacts');
  }

  if (!context.verification_results_ref) {
    missing.push('verification_results');
  }

  if (!context.git_branch_binding_ref) {
    missing.push('branch_binding');
  }

  return missing;
};

const buildExecutionWaitingSummary = (
  missingInputs: ExecutionExternalInputKey[],
): string => {
  if (missingInputs.length === 0) {
    return 'Execution has received the required GitLab artifacts and verification results.';
  }

  if (missingInputs.length === 3) {
    return 'Execution is waiting for GitLab artifacts, verification results, and a bound development branch before downstream writeback can start.';
  }

  if (
    missingInputs.length === 2 &&
    missingInputs.includes('gitlab_artifacts') &&
    missingInputs.includes('verification_results')
  ) {
    return 'Execution is waiting for GitLab artifacts and verification results before downstream writeback can start.';
  }

  if (
    missingInputs.length === 2 &&
    missingInputs.includes('gitlab_artifacts') &&
    missingInputs.includes('branch_binding')
  ) {
    return 'Execution is waiting for GitLab artifacts and a bound development branch before downstream writeback can start.';
  }

  if (
    missingInputs.length === 2 &&
    missingInputs.includes('verification_results') &&
    missingInputs.includes('branch_binding')
  ) {
    return 'Execution is waiting for verification results and a bound development branch before downstream writeback can start.';
  }

  if (missingInputs[0] === 'gitlab_artifacts') {
    return 'Execution is waiting for GitLab artifacts before downstream writeback can start.';
  }

  if (missingInputs[0] === 'verification_results') {
    return 'Execution is waiting for verification results before downstream writeback can start.';
  }

  return 'Execution is waiting for a bound development branch before downstream writeback can start.';
};

const mergeGitLabArtifacts = ({
  existingArtifacts,
  incomingArtifacts,
}: {
  existingArtifacts: GitLabArtifact[];
  incomingArtifacts: GitLabArtifact[];
}) => {
  const mergedArtifacts = [...existingArtifacts];

  for (const artifact of incomingArtifacts) {
    const identity = getArtifactIdentity(artifact);
    const existingArtifact = mergedArtifacts.find(
      (candidate) => getArtifactIdentity(candidate) === identity,
    );

    if (!existingArtifact) {
      mergedArtifacts.push(artifact);
      continue;
    }

    if (JSON.stringify(existingArtifact) === JSON.stringify(artifact)) {
      continue;
    }

    return {
      conflictIdentity: identity,
      mergedArtifacts: existingArtifacts,
    };
  }

  return {
    conflictIdentity: null,
    mergedArtifacts,
  };
};

export const getExecutionExternalInputState = (
  context: Pick<
    ExecutionContext,
    'gitlab_artifacts' | 'verification_results_ref' | 'git_branch_binding_ref'
  >,
): ExecutionExternalInputState => {
  const missingInputs = getMissingExecutionInputs(context);

  if (missingInputs.length === 0) {
    return {
      stageStatus: 'completed',
      runLifecycleStatus: 'active',
      waitingReason: null,
      missingInputs,
      summary: buildExecutionWaitingSummary(missingInputs),
    };
  }

  return {
    stageStatus: 'waiting_external_input',
    runLifecycleStatus: 'waiting_external_input',
    waitingReason: missingInputs.join(','),
    missingInputs,
    summary: buildExecutionWaitingSummary(missingInputs),
  };
};

export const recordExecutionExternalInputs = ({
  context,
  updatedAt,
  gitlabArtifacts = [],
  verificationResultsRef,
  branchBindingRef,
}: RecordExecutionExternalInputsInput): RecordExecutionExternalInputsResult => {
  const normalizedVerificationResultsRef = verificationResultsRef?.trim() || null;
  const normalizedBranchBindingRef = branchBindingRef?.trim() || null;
  const mergedArtifacts = mergeGitLabArtifacts({
    existingArtifacts: context.gitlab_artifacts,
    incomingArtifacts: gitlabArtifacts,
  });

  if (mergedArtifacts.conflictIdentity) {
    return {
      accepted: false,
      context,
      state: getExecutionExternalInputState(context),
      warnings: [],
      errors: [
        buildConflictError(mergedArtifacts.conflictIdentity, updatedAt),
      ],
    };
  }

  const nextContext: ExecutionContext = {
    ...context,
    updated_at: updatedAt,
    gitlab_artifacts: mergedArtifacts.mergedArtifacts,
    verification_results_ref:
      normalizedVerificationResultsRef ?? context.verification_results_ref,
    git_branch_binding_ref:
      normalizedBranchBindingRef ?? context.git_branch_binding_ref,
    stage_status_map: {
      ...context.stage_status_map,
    },
  };
  const state = getExecutionExternalInputState(nextContext);

  nextContext.stage_status_map[EXECUTION_STAGE] = state.stageStatus;
  nextContext.run_lifecycle_status = state.runLifecycleStatus;
  nextContext.waiting_reason = state.waitingReason;

  return {
    accepted: true,
    context: nextContext,
    state,
    warnings: [],
    errors: [],
  };
};
