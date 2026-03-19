import { describe, expect, it } from 'vitest';

import {
  REDACTION_PLACEHOLDER,
  redactForStorage,
} from '../../../src/security/index.js';

describe('redaction rules', () => {
  it('redacts auth material, credential refs, raw payloads, and configured sensitive text paths without mutating the source object', () => {
    const source = {
      headers: {
        Authorization: 'Bearer secret-token',
        Cookie: 'session=abc123',
      },
      jira: {
        credential_ref: 'cred:jira/project-a',
      },
      request_payload: {
        body: 'contains raw external write payload',
      },
      safe_summary: 'keep me',
      report: {
        root_cause_summary: 'Contains a tenant name that should be hidden.',
      },
      nested: {
        note: 'still visible',
      },
    };

    const redacted = redactForStorage(source, {
      sensitiveFieldPaths: ['report.root_cause_summary'],
    });

    expect(redacted).toEqual({
      headers: {
        Authorization: REDACTION_PLACEHOLDER,
        Cookie: REDACTION_PLACEHOLDER,
      },
      jira: {
        credential_ref: REDACTION_PLACEHOLDER,
      },
      request_payload: REDACTION_PLACEHOLDER,
      safe_summary: 'keep me',
      report: {
        root_cause_summary: REDACTION_PLACEHOLDER,
      },
      nested: {
        note: 'still visible',
      },
    });

    expect(source.headers.Authorization).toBe('Bearer secret-token');
    expect(source.request_payload.body).toBe('contains raw external write payload');
  });
});
