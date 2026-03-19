import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { type ProjectProfile } from '../../../src/domain/index.js';
import { buildJiraIssueSnapshot } from '../../../src/infrastructure/connectors/jira/index.js';
import { resolveProjectContext } from '../../../src/skills/project-context/index.js';
import { synthesizeRequirementBrief } from '../../../src/skills/requirement-summarizer/index.js';
import { locateCodeTargets } from '../../../src/skills/code-locator/index.js';

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
    ],
    writeback_targets: ['comment'],
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

const createLocalizationInput = async (repoPath: string) => {
  const projectProfile = createProjectProfile(repoPath);
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

const writeRepoFile = async (
  repoPath: string,
  relativePath: string,
  contents: string,
) => {
  const absolutePath = path.join(repoPath, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, 'utf8');
};

describe('code locator', () => {
  it('returns a normalized single code target with impact modules and root cause hypotheses', async () => {
    const repoPath = await mkdtemp(path.join(tmpdir(), 'bfo-code-locator-single-'));
    await writeRepoFile(
      repoPath,
      'src/payments/coupon-validator.ts',
      [
        'export const validateCouponStack = () => {',
        '  return "loyalty campaign coupon combination";',
        '};',
      ].join('\n'),
    );
    await writeRepoFile(
      repoPath,
      'src/checkout/cart-summary.ts',
      'export const cartSummary = "checkout totals";\n',
    );

    const input = await createLocalizationInput(repoPath);

    const result = await locateCodeTargets({
      ...input,
      generatedAt: '2026-03-19T06:10:00.000Z',
    });

    expect(result).toMatchObject({
      status: 'completed',
      waiting_for: null,
      errors: [],
      warnings: [],
      data: {
        impact_modules: ['payments'],
        code_targets: [
          {
            file_path: 'src/payments/coupon-validator.ts',
          },
        ],
      },
      source_refs: [
        'jira:BUG-123',
        'project-profile:proj-a',
        `repo:${repoPath}`,
        'brief:BUG-123',
      ],
    });
    expect(result.data?.code_targets[0].reason).toContain('payments');
    expect(result.data?.root_cause_hypotheses[0]).toContain('payments');
    expect(result.data?.root_cause_hypotheses[0]).toContain('coupon');
  });

  it('returns waiting output instead of a false positive when no candidate file matches', async () => {
    const repoPath = await mkdtemp(path.join(tmpdir(), 'bfo-code-locator-none-'));
    await writeRepoFile(
      repoPath,
      'src/payments/refund-service.ts',
      'export const refund = () => "refund only";\n',
    );

    const input = await createLocalizationInput(repoPath);

    const result = await locateCodeTargets({
      ...input,
      generatedAt: '2026-03-19T06:10:00.000Z',
    });

    expect(result).toMatchObject({
      status: 'waiting',
      waiting_for: 'manual_code_localization',
      errors: [],
      data: {
        impact_modules: ['payments'],
        code_targets: [],
        root_cause_hypotheses: [],
      },
    });
    expect(result.warnings).toContain(
      'No repository file matched the current issue signals; manual code inspection is required before Fix Planning.',
    );
  });

  it('returns multiple normalized candidates and waits for manual narrowing when matches are ambiguous', async () => {
    const repoPath = await mkdtemp(path.join(tmpdir(), 'bfo-code-locator-many-'));
    await writeRepoFile(
      repoPath,
      'src/payments/coupon-validator.ts',
      'export const couponValidator = "loyalty coupon combination";\n',
    );
    await writeRepoFile(
      repoPath,
      'src/payments/coupon-stack.ts',
      'export const couponStack = "campaign coupon combination";\n',
    );

    const input = await createLocalizationInput(repoPath);

    const result = await locateCodeTargets({
      ...input,
      generatedAt: '2026-03-19T06:10:00.000Z',
    });

    expect(result).toMatchObject({
      status: 'waiting',
      waiting_for: 'manual_code_target_selection',
      errors: [],
      data: {
        impact_modules: ['payments'],
        code_targets: [
          { file_path: 'src/payments/coupon-stack.ts' },
          { file_path: 'src/payments/coupon-validator.ts' },
        ],
      },
    });
    expect(result.warnings).toContain(
      'Multiple repository files matched the current issue signals; manual narrowing is required before Fix Planning.',
    );
    expect(result.data?.root_cause_hypotheses[0]).toContain('payments');
  });
});
