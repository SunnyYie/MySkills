import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getProjectProfilePath, writeJsonAtomically } from '../../../src/storage/index.js';
import {
  inspectStoredProjectProfile,
  loadProjectProfile,
} from '../../../src/skills/config-loader/index.js';

const createCompleteDraft = () => ({
  project_id: 'proj-a',
  project_name: '  Project A  ',
  config_version: '2026-03-19',
  jira: {
    base_url: 'https://jira.example.com',
    project_key: 'BUG',
    issue_type_ids: ['10001'],
    requirement_link_rules: [
      {
        source_type: 'manual',
        priority: 20,
        fallback_action: 'manual',
      },
      {
        source_type: 'issue_link',
        priority: 1,
        fallback_action: 'block',
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
    local_path: '/workspace/project-a',
    module_rules: [
      { module_id: 'worker', path_pattern: 'src/worker/**' },
      { module_id: 'api', path_pattern: 'src/api/**' },
    ],
  },
  approval_policy: {
    requirement_binding_required: true,
  },
  serialization_policy: {
    persist_dry_run_previews: true,
  },
  sensitivity_policy: {
    sensitive_field_paths: ['jira.credential_ref', 'jira.credential_ref', ' repo.local_path '],
    prohibited_plaintext_fields: ['token', 'cookie', 'token'],
  },
});

describe('config loader', () => {
  it('loads a complete stored profile and normalizes deterministic ordering for downstream consumers', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-config-complete-'));
    const storedProfilePath = getProjectProfilePath('proj-a', fakeHome);

    await writeJsonAtomically(storedProfilePath, createCompleteDraft());

    const inspection = await inspectStoredProjectProfile({
      projectId: 'proj-a',
      homeDir: fakeHome,
    });
    const loaded = await loadProjectProfile({
      projectId: 'proj-a',
      homeDir: fakeHome,
    });

    expect(inspection.ready).toBe(true);
    expect(inspection.missingFields).toEqual([]);
    expect(inspection.issues).toEqual([]);
    expect(inspection.normalizedProfile?.project_name).toBe('Project A');
    expect(
      inspection.normalizedProfile?.jira.requirement_link_rules.map((rule) => rule.priority),
    ).toEqual([1, 20]);
    expect(
      inspection.normalizedProfile?.repo.module_rules.map((rule) => rule.module_id),
    ).toEqual(['api', 'worker']);
    expect(inspection.normalizedProfile?.sensitivity_policy.sensitive_field_paths).toEqual([
      'jira.credential_ref',
      'repo.local_path',
    ]);
    expect(loaded.project_id).toBe('proj-a');
  });

  it('reports missing required fields without guessing defaults', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-config-missing-'));
    const storedProfilePath = getProjectProfilePath('proj-a', fakeHome);
    const draft = createCompleteDraft() as Record<string, unknown>;

    delete (draft.gitlab as Record<string, unknown>).credential_ref;
    delete (draft.feishu as Record<string, unknown>).template_version;

    await writeJsonAtomically(storedProfilePath, draft);

    const inspection = await inspectStoredProjectProfile({
      projectId: 'proj-a',
      homeDir: fakeHome,
    });

    expect(inspection.ready).toBe(false);
    expect(inspection.missingFields).toEqual([
      'gitlab.credential_ref',
      'feishu.template_version',
    ]);
    expect(inspection.issues).toEqual([
      {
        code: 'missing_field',
        path: 'gitlab.credential_ref',
        message: 'gitlab.credential_ref is required before the project profile can be used for workflow execution.',
        nextAction: 'Use bind gitlab to补录该字段，然后重新执行 inspect config --project proj-a。',
      },
      {
        code: 'missing_field',
        path: 'feishu.template_version',
        message: 'feishu.template_version is required before the project profile can be used for workflow execution.',
        nextAction: 'Use bind feishu to补录该字段，然后重新执行 inspect config --project proj-a。',
      },
    ]);
  });

  it('rejects unsupported config version formats before workflow startup', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-config-version-'));
    const storedProfilePath = getProjectProfilePath('proj-a', fakeHome);
    const draft = createCompleteDraft();

    draft.config_version = 'v1';

    await writeJsonAtomically(storedProfilePath, draft);

    const inspection = await inspectStoredProjectProfile({
      projectId: 'proj-a',
      homeDir: fakeHome,
    });

    expect(inspection.ready).toBe(false);
    expect(inspection.issues).toContainEqual({
      code: 'invalid_version',
      path: 'config_version',
      message: 'config_version must use YYYY-MM-DD so project profiles stay versionable and auditable.',
      nextAction: 'Update the stored config_version and rerun inspect config --project proj-a。',
    });
  });

  it('rejects invalid references and repo paths during completeness inspection', async () => {
    const fakeHome = await mkdtemp(path.join(tmpdir(), 'bfo-config-ref-'));
    const storedProfilePath = getProjectProfilePath('proj-a', fakeHome);
    const draft = createCompleteDraft();

    draft.jira.credential_ref = 'jira-token';
    draft.requirements.source_ref = 'requirements-doc';
    draft.repo.local_path = './repo';

    await writeJsonAtomically(storedProfilePath, draft);

    const inspection = await inspectStoredProjectProfile({
      projectId: 'proj-a',
      homeDir: fakeHome,
    });

    expect(inspection.ready).toBe(false);
    expect(inspection.issues).toEqual(
      expect.arrayContaining([
        {
          code: 'invalid_reference',
          path: 'jira.credential_ref',
          message: 'jira.credential_ref must be an explicit credential reference instead of inline secret material.',
          nextAction: 'Replace jira.credential_ref with a credential ref such as cred:jira/project-a。',
        },
        {
          code: 'invalid_reference',
          path: 'requirements.source_ref',
          message: 'requirements.source_ref must be an explicit source reference so requirement provenance stays traceable.',
          nextAction: 'Replace requirements.source_ref with a ref-like value such as doc://feishu/project-a。',
        },
        {
          code: 'invalid_reference',
          path: 'repo.local_path',
          message: 'repo.local_path must be an absolute path so inspect and run operate on the intended repository.',
          nextAction: 'Bind repo.local_path again with an absolute filesystem path.',
        },
      ]),
    );
  });
});
