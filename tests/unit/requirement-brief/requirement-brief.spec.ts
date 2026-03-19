import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { type ProjectProfile } from '../../../src/domain/index.js';
import { renderRequirementBriefCli, renderRequirementBriefMarkdown } from '../../../src/renderers/index.js';
import { buildJiraIssueSnapshot } from '../../../src/infrastructure/connectors/jira/index.js';
import { resolveProjectContext } from '../../../src/skills/project-context/index.js';
import { synthesizeRequirementBrief } from '../../../src/skills/requirement-summarizer/index.js';

const createProjectProfile = (
  repoPath: string,
  overrides: Partial<ProjectProfile['approval_policy']> = {},
): ProjectProfile => ({
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
    ...overrides,
  },
  serialization_policy: {
    persist_dry_run_previews: true,
  },
  sensitivity_policy: {
    sensitive_field_paths: ['jira.credential_ref'],
    prohibited_plaintext_fields: ['token'],
  },
});

describe('requirement brief synthesis', () => {
  it('builds a Requirement Brief from Intake and Context Resolution outputs with stable source refs', async () => {
    const repoPath = await mkdtemp(path.join(tmpdir(), 'bfo-brief-resolved-'));
    const projectProfile = createProjectProfile(repoPath);
    const issueSnapshot = buildJiraIssueSnapshot({
      projectProfile,
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

    const contextResult = await resolveProjectContext({
      projectProfile,
      issueSnapshot,
      generatedAt: '2026-03-19T04:00:00.000Z',
    });

    const result = synthesizeRequirementBrief({
      projectProfile,
      issueSnapshot,
      projectContext: contextResult.data!,
      generatedAt: '2026-03-19T05:00:00.000Z',
    });

    expect(result).toMatchObject({
      status: 'completed',
      waiting_for: null,
      summary: 'Generated Requirement Brief for BUG-123 with resolved requirement binding.',
      warnings: [],
      errors: [],
      source_refs: [
        'jira:BUG-123',
        'project-profile:proj-a',
        'requirements-source:doc://feishu/project-a',
        `repo:${repoPath}`,
      ],
      data: {
        issue_key: 'BUG-123',
        project_id: 'proj-a',
        requirement_binding_status: 'resolved',
        binding_reason: 'Resolved from issue_link using the highest-priority configured rule.',
        linked_requirement: {
          requirement_ref: 'REQ-100',
          requirement_binding_status: 'resolved',
        },
        fix_goal:
          'Clarify the bug scope for BUG-123 and prepare a reviewable repair brief before downstream code analysis.',
        pending_questions: [],
      },
    });
    expect(result.data?.known_context).toContain('Issue summary: Payments module rejects coupon combinations');
    expect(result.data?.known_context).toContain(`Repo path: ${repoPath}`);
    expect(result.data?.known_context).toContain('Module candidates: payments');
  });

  it('keeps unresolved requirements explicit and adds follow-up questions when the project policy requires eventual binding', async () => {
    const repoPath = await mkdtemp(path.join(tmpdir(), 'bfo-brief-unresolved-'));
    const projectProfile = createProjectProfile(repoPath);
    projectProfile.jira.requirement_link_rules = [
      {
        source_type: 'custom_field',
        priority: 1,
        fallback_action: 'unresolved',
      },
    ];
    const issueSnapshot = buildJiraIssueSnapshot({
      projectProfile,
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

    const contextResult = await resolveProjectContext({
      projectProfile,
      issueSnapshot,
      generatedAt: '2026-03-19T04:00:00.000Z',
    });

    const result = synthesizeRequirementBrief({
      projectProfile,
      issueSnapshot,
      projectContext: contextResult.data!,
      generatedAt: '2026-03-19T05:00:00.000Z',
    });

    expect(result).toMatchObject({
      status: 'completed',
      summary: 'Generated Requirement Brief for BUG-789 with unresolved requirement binding.',
      warnings: [
        'Requirement binding remains unresolved; external write stages must block until a requirement is explicitly bound for this project.',
      ],
      data: {
        issue_key: 'BUG-789',
        linked_requirement: null,
        requirement_binding_status: 'unresolved',
        binding_reason:
          'No requirement hint matched the configured rules; continuing as unresolved because the fallback action allows it.',
      },
    });
    expect(result.data?.pending_questions).toContain(
      'Which requirement should BUG-789 bind to before Jira or Feishu writeback is attempted?',
    );
  });
});

describe('requirement brief renderers', () => {
  it('renders the same business information for CLI and Markdown outputs', () => {
    const brief = {
      issue_key: 'BUG-123',
      project_id: 'proj-a',
      linked_requirement: {
        requirement_id: null,
        requirement_ref: 'REQ-100',
        requirement_binding_status: 'resolved' as const,
        binding_reason: 'Resolved from issue_link using the highest-priority configured rule.',
      },
      requirement_binding_status: 'resolved' as const,
      binding_reason: 'Resolved from issue_link using the highest-priority configured rule.',
      known_context: [
        'Issue summary: Payments module rejects coupon combinations',
        'Module candidates: payments',
      ],
      fix_goal:
        'Clarify the bug scope for BUG-123 and prepare a reviewable repair brief before downstream code analysis.',
      pending_questions: [],
      generated_at: '2026-03-19T05:00:00.000Z',
      source_refs: [
        'jira:BUG-123',
        'project-profile:proj-a',
        'requirements-source:doc://feishu/project-a',
      ],
    };

    const cliOutput = renderRequirementBriefCli(brief);
    const markdownOutput = renderRequirementBriefMarkdown(brief);

    for (const snippet of [
      'BUG-123',
      'proj-a',
      'REQ-100',
      'resolved',
      'Payments module rejects coupon combinations',
      'Module candidates: payments',
      'Clarify the bug scope for BUG-123 and prepare a reviewable repair brief before downstream code analysis.',
      'jira:BUG-123',
      'project-profile:proj-a',
      'requirements-source:doc://feishu/project-a',
    ]) {
      expect(cliOutput).toContain(snippet);
      expect(markdownOutput).toContain(snippet);
    }
  });
});
