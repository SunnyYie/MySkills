import { describe, expect, it } from 'vitest';

import { type ProjectProfile } from '../../../src/domain/index.js';
import {
  buildJiraIssueSnapshot,
  createJiraPermissionDeniedError,
} from '../../../src/infrastructure/connectors/jira/index.js';
import { runJiraIntake } from '../../../src/skills/jira-intake/index.js';

const createProjectProfile = (): ProjectProfile => ({
  project_id: 'proj-a',
  project_name: 'Project A',
  config_version: '2026-03-19',
  jira: {
    base_url: 'https://jira.example.com',
    project_key: 'BUG',
    issue_type_ids: ['10001'],
    requirement_link_rules: [
      {
        source_type: 'issue_link',
        priority: 1,
        fallback_action: 'manual',
      },
      {
        source_type: 'label',
        priority: 20,
        fallback_action: 'unresolved',
      },
    ],
    writeback_targets: ['comment', 'customfield_12345'],
    credential_ref: 'cred:jira/project-a',
  },
  requirements: {
    source_type: 'feishu_doc',
    source_ref: 'doc://feishu/project-a',
  },
  gitlab: {
    base_url: 'https://gitlab.example.com',
    project_id: 'group/project-a',
    default_branch: 'main',
    branch_naming_rule: 'bugfix/{issue_key}',
    credential_ref: 'cred:gitlab/project-a',
  },
  feishu: {
    space_id: 'space-1',
    doc_id: 'doc-1',
    block_path_or_anchor: 'root/bugs',
    template_id: 'tpl-1',
    template_version: 'v1',
    credential_ref: 'cred:feishu/project-a',
  },
  repo: {
    local_path: '/workspace/project-a',
    module_rules: [
      { module_id: 'payments', path_pattern: 'src/payments/**' },
      { module_id: 'checkout', path_pattern: 'src/checkout/**' },
    ],
  },
  approval_policy: {
    requirement_binding_required: true,
  },
  serialization_policy: {
    persist_dry_run_previews: true,
  },
  sensitivity_policy: {
    sensitive_field_paths: ['jira.credential_ref'],
    prohibited_plaintext_fields: ['token'],
  },
});

describe('jira intake', () => {
  it('builds a structured Jira snapshot so skills only consume normalized issue data', () => {
    const profile = createProjectProfile();

    const snapshot = buildJiraIssueSnapshot({
      projectProfile: profile,
      rawIssue: {
        issue_key: 'BUG-123',
        issue_id: '10001',
        issue_type_id: '10001',
        project_key: 'BUG',
        summary: 'Payments module rejects coupon combinations',
        description: 'The checkout flow fails when loyalty and campaign coupons are combined.',
        status_name: 'In Progress',
        labels: ['bug', 'module:payments', 'req:req-200'],
        requirement_sources: {
          issue_link: ['REQ-100'],
          label: ['REQ-200'],
          text_pattern: ['REQ-300'],
        },
        source_url: 'https://jira.example.com/browse/BUG-123',
      },
    });

    expect(snapshot).toMatchObject({
      issue_key: 'BUG-123',
      issue_id: '10001',
      issue_type_id: '10001',
      project_key: 'BUG',
      summary: 'Payments module rejects coupon combinations',
      status_name: 'In Progress',
      labels: ['bug', 'module:payments', 'req:req-200'],
      requirement_hints: [
        {
          source_type: 'issue_link',
          values: ['REQ-100'],
          source_field: 'jira.issue_link',
        },
        {
          source_type: 'label',
          values: ['REQ-200'],
          source_field: 'jira.labels',
        },
        {
          source_type: 'text_pattern',
          values: ['REQ-300'],
          source_field: 'jira.description',
        },
      ],
      writeback_targets: [
        {
          target_type: 'comment',
          target_field_id_or_comment_mode: 'comment',
        },
        {
          target_type: 'field',
          target_field_id_or_comment_mode: 'customfield_12345',
        },
      ],
    });
  });

  it('summarizes normalized intake output with stable source refs for downstream workflow stages', () => {
    const snapshot = buildJiraIssueSnapshot({
      projectProfile: createProjectProfile(),
      rawIssue: {
        issue_key: 'BUG-123',
        issue_id: '10001',
        issue_type_id: '10001',
        project_key: 'BUG',
        summary: 'Payments module rejects coupon combinations',
        description: 'The checkout flow fails when loyalty and campaign coupons are combined.',
        status_name: 'In Progress',
        labels: ['bug', 'module:payments'],
        requirement_sources: {
          issue_link: ['REQ-100'],
        },
        source_url: 'https://jira.example.com/browse/BUG-123',
      },
    });

    const result = runJiraIntake({
      issueSnapshot: snapshot,
      generatedAt: '2026-03-19T03:00:00.000Z',
    });

    expect(result).toMatchObject({
      status: 'completed',
      summary: 'Loaded Jira issue BUG-123 with 1 requirement hint source.',
      data: {
        issue_key: 'BUG-123',
        writeback_target_count: 2,
        requirement_hint_count: 1,
      },
      warnings: [],
      errors: [],
      source_refs: ['jira:BUG-123', 'jira-snapshot:BUG-123'],
      generated_at: '2026-03-19T03:00:00.000Z',
    });
  });

  it('maps permission failures to a stable Intake structured error instead of a generic exception', () => {
    const error = createJiraPermissionDeniedError({
      issueKey: 'BUG-403',
      timestamp: '2026-03-19T03:00:00.000Z',
    });

    expect(error).toMatchObject({
      code: 'jira_permission_denied',
      category: 'permission_denied',
      stage: 'Intake',
      system: 'jira',
      operation: 'read_issue',
      target_ref: 'jira:BUG-403',
      retryable: false,
      outcome_unknown: false,
      user_action: 'Verify the Jira credential reference and issue permissions, then retry the Intake stage.',
    });
  });
});
