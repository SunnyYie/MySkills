import { describe, expect, it } from 'vitest';

import { type ProjectProfile } from '../../../src/domain/index.js';
import {
  buildJiraIssueSnapshot,
  createJiraPermissionDeniedError,
  readJiraIssueSnapshot,
} from '../../../src/infrastructure/connectors/jira/index.js';
import {
  loadJiraIssueSnapshotArtifact,
  runJiraIntake,
  runJiraIntakeFromArtifact,
} from '../../../src/skills/jira-intake/index.js';

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
    subtask: {
      issue_type_id: '10002',
      summary_template: '[{issue_key}] {summary}',
    },
    branch_binding: {
      target_issue_source: 'subtask',
      fallback_to_bug: true,
    },
    commit_binding: {
      target_issue_source: 'subtask',
    },
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
    branch_binding: {
      input_mode: 'current_branch',
    },
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
  it('reads a Jira issue by issue key and normalizes the snapshot fields Intake needs', async () => {
    const requestedIssueKeys: string[] = [];
    const snapshot = await readJiraIssueSnapshot({
      projectProfile: createProjectProfile(),
      issueKey: 'BUG-123',
      fetchIssue: async (issueKey) => {
        requestedIssueKeys.push(issueKey);
        return {
          issue_key: issueKey,
          issue_id: '10001',
          issue_type_id: '10001',
          project_key: 'BUG',
          summary: 'Payments module rejects coupon combinations',
          description:
            'The checkout flow fails when loyalty and campaign coupons are combined.',
          status_name: 'In Progress',
          labels: ['bug', 'module:payments', 'req:req-200'],
          requirement_sources: {
            issue_link: ['REQ-100'],
            label: ['REQ-200'],
          },
          source_url: 'https://jira.example.com/browse/BUG-123',
        };
      },
    });

    expect(requestedIssueKeys).toEqual(['BUG-123']);
    expect(snapshot).toMatchObject({
      issue_key: 'BUG-123',
      issue_id: '10001',
      status_name: 'In Progress',
      description:
        'The checkout flow fails when loyalty and campaign coupons are combined.',
      labels: ['bug', 'module:payments', 'req:req-200'],
      requirement_hints: [
        {
          source_type: 'issue_link',
          values: ['REQ-100'],
        },
        {
          source_type: 'label',
          values: ['REQ-200'],
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

  it('normalizes permission, missing issue, invalid payload, and network failures into stable Intake errors', async () => {
    const profile = createProjectProfile();

    await expect(
      readJiraIssueSnapshot({
        projectProfile: profile,
        issueKey: 'BUG-403',
        fetchIssue: async () => {
          const error = new Error('Forbidden');
          Object.assign(error, { status: 403 });
          throw error;
        },
      }),
    ).rejects.toMatchObject({
      code: 'jira_permission_denied',
      category: 'permission_denied',
      target_ref: 'jira:BUG-403',
    });

    await expect(
      readJiraIssueSnapshot({
        projectProfile: profile,
        issueKey: 'BUG-404',
        fetchIssue: async () => {
          const error = new Error('Not found');
          Object.assign(error, { status: 404 });
          throw error;
        },
      }),
    ).rejects.toMatchObject({
      code: 'jira_issue_not_found',
      category: 'validation_error',
      target_ref: 'jira:BUG-404',
    });

    await expect(
      readJiraIssueSnapshot({
        projectProfile: profile,
        issueKey: 'BUG-422',
        fetchIssue: async (issueKey) => ({
          issue_key: issueKey,
          issue_id: '10022',
          issue_type_id: '10001',
          project_key: 'BUG',
          summary: 'Missing description field',
          description: '',
          status_name: 'Open',
          labels: ['bug'],
        }),
      }),
    ).rejects.toMatchObject({
      code: 'jira_issue_invalid',
      category: 'validation_error',
      target_ref: 'jira:BUG-422',
    });

    await expect(
      readJiraIssueSnapshot({
        projectProfile: profile,
        issueKey: 'BUG-502',
        fetchIssue: async () => {
          const error = new Error('socket hang up');
          Object.assign(error, { code: 'ECONNRESET' });
          throw error;
        },
      }),
    ).rejects.toMatchObject({
      code: 'jira_network_error',
      category: 'network_error',
      target_ref: 'jira:BUG-502',
      retryable: true,
    });
  });

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

  it('loads Intake input from a structured snapshot artifact instead of raw Jira payloads', () => {
    const structuredSnapshot = buildJiraIssueSnapshot({
      projectProfile: createProjectProfile(),
      rawIssue: {
        issue_key: 'BUG-124',
        issue_id: '10002',
        issue_type_id: '10001',
        project_key: 'BUG',
        summary: 'Checkout blocks coupon combinations',
        description: 'The checkout flow rejects loyalty plus campaign coupons.',
        status_name: 'To Do',
        labels: ['bug', 'module:checkout'],
        requirement_sources: {
          issue_link: ['REQ-201'],
        },
        source_url: 'https://jira.example.com/browse/BUG-124',
      },
    });

    const loadedSnapshot = loadJiraIssueSnapshotArtifact({
      snapshotArtifact: structuredSnapshot,
    });
    const result = runJiraIntakeFromArtifact({
      snapshotArtifact: structuredSnapshot,
      generatedAt: '2026-03-19T03:05:00.000Z',
    });

    expect(loadedSnapshot.issue_key).toBe('BUG-124');
    expect(result).toMatchObject({
      data: {
        issue_key: 'BUG-124',
        requirement_hint_count: 1,
      },
      source_refs: ['jira:BUG-124', 'jira-snapshot:BUG-124'],
    });

    expect(() =>
      loadJiraIssueSnapshotArtifact({
        snapshotArtifact: {
          issue_key: 'BUG-124',
          issue_id: '10002',
          issue_type_id: '10001',
          project_key: 'BUG',
          summary: 'raw payload',
          description: 'raw payload',
          status_name: 'To Do',
          labels: ['bug'],
        },
      }),
    ).toThrow();
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
