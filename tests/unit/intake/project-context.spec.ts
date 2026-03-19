import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { type ProjectProfile } from '../../../src/domain/index.js';
import { buildJiraIssueSnapshot } from '../../../src/infrastructure/connectors/jira/index.js';
import { resolveProjectContext } from '../../../src/skills/project-context/index.js';

const createProjectProfile = (repoPath: string): ProjectProfile => ({
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
    writeback_targets: ['comment'],
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
    local_path: repoPath,
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

describe('project context', () => {
  it('resolves the highest-priority requirement hint and narrows repo modules from issue signals', async () => {
    const repoPath = await mkdtemp(path.join(tmpdir(), 'bfo-project-context-repo-'));
    const snapshot = buildJiraIssueSnapshot({
      projectProfile: createProjectProfile(repoPath),
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
        },
        source_url: 'https://jira.example.com/browse/BUG-123',
      },
    });

    const result = await resolveProjectContext({
      projectProfile: createProjectProfile(repoPath),
      issueSnapshot: snapshot,
      generatedAt: '2026-03-19T03:00:00.000Z',
    });

    expect(result).toMatchObject({
      status: 'completed',
      waiting_for: null,
      data: {
        project_id: 'proj-a',
        requirement: {
          requirement_binding_status: 'resolved',
          requirement_ref: 'REQ-100',
          binding_reason: 'Resolved from issue_link using the highest-priority configured rule.',
        },
        repo_selection: {
          repo_path: repoPath,
          module_candidates: ['payments'],
        },
      },
      errors: [],
    });
  });

  it('waits for a manual requirement choice when the highest-priority rule produces multiple candidates', async () => {
    const repoPath = await mkdtemp(path.join(tmpdir(), 'bfo-project-context-manual-'));
    const profile = createProjectProfile(repoPath);
    const snapshot = buildJiraIssueSnapshot({
      projectProfile: profile,
      rawIssue: {
        issue_key: 'BUG-456',
        issue_id: '10002',
        issue_type_id: '10001',
        project_key: 'BUG',
        summary: 'Checkout totals are wrong',
        description: 'Linked requirements cannot be chosen automatically.',
        status_name: 'Open',
        labels: ['bug'],
        requirement_sources: {
          issue_link: ['REQ-100', 'REQ-101'],
        },
        source_url: 'https://jira.example.com/browse/BUG-456',
      },
    });

    const result = await resolveProjectContext({
      projectProfile: profile,
      issueSnapshot: snapshot,
      generatedAt: '2026-03-19T03:00:00.000Z',
    });

    expect(result).toMatchObject({
      status: 'waiting',
      waiting_for: 'manual_requirement_selection',
      data: {
        requirement: {
          requirement_binding_status: 'unresolved',
          binding_reason: 'Multiple requirement candidates matched the highest-priority rule; manual selection is required.',
        },
      },
      errors: [],
    });
  });

  it('keeps the workflow moving with an unresolved requirement when the fallback action explicitly allows it', async () => {
    const repoPath = await mkdtemp(path.join(tmpdir(), 'bfo-project-context-unresolved-'));
    const profile = createProjectProfile(repoPath);
    profile.jira.requirement_link_rules = [
      {
        source_type: 'custom_field',
        priority: 1,
        fallback_action: 'unresolved',
      },
    ];
    const snapshot = buildJiraIssueSnapshot({
      projectProfile: profile,
      rawIssue: {
        issue_key: 'BUG-789',
        issue_id: '10003',
        issue_type_id: '10001',
        project_key: 'BUG',
        summary: 'Checkout totals are wrong',
        description: 'No requirement hint is present on the issue.',
        status_name: 'Open',
        labels: ['bug'],
        requirement_sources: {},
        source_url: 'https://jira.example.com/browse/BUG-789',
      },
    });

    const result = await resolveProjectContext({
      projectProfile: profile,
      issueSnapshot: snapshot,
      generatedAt: '2026-03-19T03:00:00.000Z',
    });

    expect(result).toMatchObject({
      status: 'completed',
      waiting_for: null,
      data: {
        requirement: {
          requirement_binding_status: 'unresolved',
          requirement_ref: null,
          binding_reason: 'No requirement hint matched the configured rules; continuing as unresolved because the fallback action allows it.',
        },
      },
      errors: [],
    });
  });

  it('fails with a repo resolution error when the configured local repository cannot be opened', async () => {
    const missingRepoPath = path.join(tmpdir(), 'bfo-project-context-missing-repo');
    const profile = createProjectProfile(missingRepoPath);
    const snapshot = buildJiraIssueSnapshot({
      projectProfile: profile,
      rawIssue: {
        issue_key: 'BUG-999',
        issue_id: '10004',
        issue_type_id: '10001',
        project_key: 'BUG',
        summary: 'Payments module rejects coupon combinations',
        description: 'Repo path is invalid.',
        status_name: 'Open',
        labels: ['bug', 'module:payments'],
        requirement_sources: {
          issue_link: ['REQ-100'],
        },
        source_url: 'https://jira.example.com/browse/BUG-999',
      },
    });

    const result = await resolveProjectContext({
      projectProfile: profile,
      issueSnapshot: snapshot,
      generatedAt: '2026-03-19T03:00:00.000Z',
    });

    expect(result).toMatchObject({
      status: 'failed',
      waiting_for: null,
      data: null,
      errors: [
        {
          code: 'repo_path_unavailable',
          category: 'repo_resolution_failed',
          stage: 'Context Resolution',
          system: 'repo_workspace',
          operation: 'inspect_workspace',
          target_ref: `repo:${missingRepoPath}`,
        },
      ],
    });
  });
});
