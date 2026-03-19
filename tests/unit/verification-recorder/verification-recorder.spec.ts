import { describe, expect, it } from 'vitest';

import { recordVerificationResult } from '../../../src/skills/verification-recorder/index.js';

describe('verification recorder', () => {
  it('normalizes external verification evidence into a concise summary and structured payload', () => {
    const result = recordVerificationResult({
      issueKey: 'BUG-123',
      outcome: 'mixed',
      inputSource: 'external_agent',
      sourceRefs: ['artifact://verification/agent-run-1'],
      recordedAt: '2026-03-19T12:00:00.000Z',
      checks: [
        {
          name: 'coupon regression',
          status: 'passed',
        },
        {
          name: 'manual smoke test',
          status: 'failed',
        },
      ],
    });

    expect(result.status).toBe('completed');
    expect(result.summary).toBe(
      'Recorded mixed verification evidence for BUG-123.',
    );
    expect(result.data).toMatchObject({
      outcome: 'mixed',
      input_source: 'external_agent',
      recorded_at: '2026-03-19T12:00:00.000Z',
    });
    expect(result.data?.verification_summary).toBe(
      'Verification is mixed with 1 passed and 1 failed checks. Primary failure: manual smoke test.',
    );
    expect(result.source_refs).toEqual(['artifact://verification/agent-run-1']);
  });
});
