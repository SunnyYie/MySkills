import { describe, expect, it } from 'vitest';

import { normalizeGitLabArtifacts } from '../../../src/skills/gitlab-linker/index.js';

describe('gitlab linker', () => {
  it('normalizes commit, branch and mr artifacts with project defaults', () => {
    const artifacts = normalizeGitLabArtifacts({
      gitlabConfig: {
        project_id: 'group/project-a',
        default_branch: 'main',
        base_url: 'https://gitlab.example.com',
      },
      recordedAt: '2026-03-19T12:05:00.000Z',
      artifacts: [
        {
          artifact_source: 'external_import',
          artifact_type: 'commit',
          commit_sha: ' ABCDEF0123456789ABCDEF0123456789ABCDEF01 ',
          commit_url:
            ' https://gitlab.example.com/group/project-a/-/commit/ABCDEF0123456789ABCDEF0123456789ABCDEF01 ',
        },
        {
          artifact_source: 'external_import',
          artifact_type: 'branch',
          branch_name: ' bugfix/BUG-123 ',
        },
        {
          artifact_source: 'external_import',
          artifact_type: 'mr',
          mr_iid: 42,
          mr_url: ' https://gitlab.example.com/group/project-a/-/merge_requests/42 ',
        },
      ],
    });

    expect(artifacts).toEqual([
      {
        artifact_source: 'external_import',
        artifact_type: 'commit',
        project_id: 'group/project-a',
        project_path: 'group/project-a',
        default_branch: 'main',
        commit_sha: 'abcdef0123456789abcdef0123456789abcdef01',
        commit_url:
          'https://gitlab.example.com/group/project-a/-/commit/ABCDEF0123456789ABCDEF0123456789ABCDEF01',
        created_at: '2026-03-19T12:05:00.000Z',
      },
      {
        artifact_source: 'external_import',
        artifact_type: 'branch',
        project_id: 'group/project-a',
        project_path: 'group/project-a',
        default_branch: 'main',
        branch_name: 'bugfix/BUG-123',
        created_at: '2026-03-19T12:05:00.000Z',
      },
      {
        artifact_source: 'external_import',
        artifact_type: 'mr',
        project_id: 'group/project-a',
        project_path: 'group/project-a',
        default_branch: 'main',
        mr_iid: 42,
        mr_url: 'https://gitlab.example.com/group/project-a/-/merge_requests/42',
        created_at: '2026-03-19T12:05:00.000Z',
      },
    ]);
  });

  it('rejects invalid GitLab artifact payloads before they reach downstream writeback stages', () => {
    expect(() =>
      normalizeGitLabArtifacts({
        gitlabConfig: {
          project_id: 'group/project-a',
          default_branch: 'main',
          base_url: 'https://gitlab.example.com',
        },
        artifacts: [
          {
            artifact_source: 'external_import',
            artifact_type: 'mr',
            mr_iid: 42,
          },
        ],
      }),
    ).toThrow(/mr_url/i);
  });
});
