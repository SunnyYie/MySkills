import {
  VerificationRecordingStageResultSchema,
  type VerificationCheck,
  type VerificationRecordingStageResult,
  type VerificationResult,
} from '../../domain/index.js';

type RecordVerificationResultInput = {
  issueKey: string;
  outcome: VerificationResult['outcome'];
  inputSource: VerificationResult['input_source'];
  sourceRefs: string[];
  checks: VerificationCheck[];
  recordedAt?: string;
  generatedAt?: string;
};

const defaultTimestamp = () => new Date().toISOString();

const uniqueValues = (values: string[]) =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))];

const buildVerificationSummary = ({
  outcome,
  checks,
}: Pick<RecordVerificationResultInput, 'outcome' | 'checks'>) => {
  const passedCount = checks.filter((check) => check.status === 'passed').length;
  const failedCount = checks.filter((check) => check.status === 'failed').length;
  const primaryFailure = checks.find((check) => check.status === 'failed')?.name;
  const primaryEvidence = checks[0]?.name ?? 'recorded verification evidence';

  if (outcome === 'passed') {
    return `Verification passed with ${passedCount}/${checks.length} successful checks. Primary evidence: ${primaryEvidence}.`;
  }

  if (outcome === 'failed') {
    return `Verification failed with ${failedCount} failing checks. Primary failure: ${primaryFailure ?? primaryEvidence}.`;
  }

  return `Verification is mixed with ${passedCount} passed and ${failedCount} failed checks. Primary failure: ${primaryFailure ?? primaryEvidence}.`;
};

export const recordVerificationResult = ({
  issueKey,
  outcome,
  inputSource,
  sourceRefs,
  checks,
  recordedAt = defaultTimestamp(),
  generatedAt = recordedAt,
}: RecordVerificationResultInput): VerificationRecordingStageResult => {
  const normalizedChecks = checks.map((check) => ({
    ...check,
    name: check.name.trim(),
  }));
  const data: VerificationResult = {
    outcome,
    verification_summary: buildVerificationSummary({
      outcome,
      checks: normalizedChecks,
    }),
    checks: normalizedChecks,
    input_source: inputSource,
    recorded_at: recordedAt,
  };

  return VerificationRecordingStageResultSchema.parse({
    status: 'completed',
    summary: `Recorded ${outcome} verification evidence for ${issueKey}.`,
    data,
    warnings: [],
    errors: [],
    waiting_for: null,
    source_refs: uniqueValues(sourceRefs),
    generated_at: generatedAt,
  });
};
