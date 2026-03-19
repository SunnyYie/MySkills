import { describe, expect, it } from 'vitest';

import { type ProjectProfile } from '../../../src/domain/index.js';
import { buildJiraIssueSnapshot } from '../../../src/infrastructure/connectors/jira/index.js';
import { createFixPlan } from '../../../src/skills/fix-planner/index.js';
import { resolveProjectContext } from '../../../src/skills/project-context/index.js';
import { synthesizeRequirementBrief } from '../../../src/skills/requirement-summarizer/index.js';

const projectProfile: ProjectProfile = {
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
    local_path: process.cwd(),
    module_rules: [{ module_id: 'payments', path_pattern: 'src/payments/**' }],
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
};

const issueSnapshot = buildJiraIssueSnapshot({
  projectProfile,
  rawIssue: {
    issue_key: 'BUG-123',
    issue_id: '10001',
    issue_type_id: '10001',
    project_key: 'BUG',
    summary: 'Payments module rejects coupon combinations',
    description:
      'The checkout flow fails when loyalty and campaign coupons are combined at submit time.',
    status_name: 'In Progress',
    labels: ['bug', 'module:payments'],
    requirement_sources: {
      issue_link: ['REQ-100'],
    },
    source_url: 'https://jira.example.com/browse/BUG-123',
  },
});

const createPlanningInput = async () => {
  const projectContext = await resolveProjectContext({
    projectProfile,
    issueSnapshot,
    generatedAt: '2026-03-19T06:00:00.000Z',
  });
  const requirementBrief = synthesizeRequirementBrief({
    projectProfile,
    issueSnapshot,
    projectContext: projectContext.data!,
    generatedAt: '2026-03-19T06:05:00.000Z',
  });

  return {
    projectProfile,
    issueSnapshot,
    projectContext: projectContext.data!,
    requirementBrief: requirementBrief.data!,
  };
};

describe('fix planner', () => {
  it('returns an approval-ready fix plan that stays traceable to code localization and execution handoff', async () => {
    const input = await createPlanningInput();

    const result = createFixPlan({
      ...input,
      codeLocalization: {
        status: 'completed',
        summary: 'Localized 1 candidate code target for BUG-123.',
        data: {
          impact_modules: ['payments'],
          code_targets: [
            {
              file_path: 'src/payments/coupon-validator.ts',
              reason: 'Matched coupon combination terms in module payments',
            },
          ],
          root_cause_hypotheses: [
            'The payments coupon validator likely rejects valid loyalty and campaign combinations.',
          ],
        },
        warnings: [],
        errors: [],
        waiting_for: null,
        source_refs: ['jira:BUG-123', 'brief:BUG-123', 'repo:' + process.cwd()],
        generated_at: '2026-03-19T06:10:00.000Z',
      },
      generatedAt: '2026-03-19T06:15:00.000Z',
    });

    expect(result).toMatchObject({
      status: 'completed',
      waiting_for: null,
      errors: [],
      data: {
        impact_scope: [
          'payments module coupon validation flow',
          'src/payments/coupon-validator.ts',
        ],
        pending_external_inputs: [
          'Provide the final GitLab artifact reference after the manual fix is applied.',
          'Record the final verification evidence after the manual fix is applied.',
        ],
        referenced_code_targets: [
          {
            file_path: 'src/payments/coupon-validator.ts',
          },
        ],
        referenced_root_cause_hypotheses: [
          'The payments coupon validator likely rejects valid loyalty and campaign combinations.',
        ],
      },
      source_refs: [
        'jira:BUG-123',
        'brief:BUG-123',
        'code-localization:BUG-123',
        `repo:${process.cwd()}`,
      ],
    });
    expect(result.data?.fix_summary).toContain('BUG-123');
    expect(result.data?.fix_summary).toContain('src/payments/coupon-validator.ts');
    expect(result.data?.verification_plan[0]).toContain('BUG-123');
    expect(result.data?.open_risks[0]).toContain('manual fix');
  });

  it('waits instead of inventing a plan when code localization is still unresolved', async () => {
    const input = await createPlanningInput();

    const result = createFixPlan({
      ...input,
      codeLocalization: {
        status: 'waiting',
        summary: 'Multiple candidate code targets still need manual narrowing.',
        data: {
          impact_modules: ['payments'],
          code_targets: [
            {
              file_path: 'src/payments/coupon-validator.ts',
              reason: 'Matched coupon combination terms in module payments',
            },
          ],
          root_cause_hypotheses: [
            'The payments coupon validator likely rejects valid loyalty and campaign combinations.',
          ],
        },
        warnings: [
          'Multiple repository files matched the current issue signals; manual narrowing is required before Fix Planning.',
        ],
        errors: [],
        waiting_for: 'manual_code_target_selection',
        source_refs: ['jira:BUG-123', 'brief:BUG-123'],
        generated_at: '2026-03-19T06:10:00.000Z',
      },
      generatedAt: '2026-03-19T06:15:00.000Z',
    });

    expect(result).toMatchObject({
      status: 'waiting',
      waiting_for: 'manual_code_target_selection',
      data: null,
    });
    expect(result.warnings).toContain(
      'Fix Planning is blocked until Code Localization resolves to a single actionable code target.',
    );
  });

  it('waits instead of crashing when localization is marked completed without actionable targets', async () => {
    const input = await createPlanningInput();

    const result = createFixPlan({
      ...input,
      codeLocalization: {
        status: 'completed',
        summary: 'Localization returned no actionable code target.',
        data: {
          impact_modules: ['payments'],
          code_targets: [],
          root_cause_hypotheses: [],
        },
        warnings: [],
        errors: [],
        waiting_for: null,
        source_refs: ['jira:BUG-123', 'brief:BUG-123'],
        generated_at: '2026-03-19T06:10:00.000Z',
      },
      generatedAt: '2026-03-19T06:15:00.000Z',
    });

    expect(result).toMatchObject({
      status: 'waiting',
      data: null,
    });
    expect(result.warnings).toContain(
      'Fix Planning is blocked until Code Localization resolves to a single actionable code target.',
    );
  });
});
