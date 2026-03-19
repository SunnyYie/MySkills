import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();

const readDoc = async (...relativePaths: string[]) => {
  for (const relativePath of relativePaths) {
    try {
      return await readFile(path.join(projectRoot, relativePath), 'utf8');
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Document not found in any expected location: ${relativePaths.join(', ')}`);
};

describe('document consistency', () => {
  it('keeps canonical command groups and stage names aligned across需求文档、技术方案、实施计划', async () => {
    const requirements = await readDoc(
      'memory-bank/features/v1/需求文档.md',
      'memory-bank/需求文档.md',
    );
    const technical = await readDoc(
      'memory-bank/features/v1/技术方案.md',
      'memory-bank/技术方案.md',
    );
    const plan = await readDoc(
      'memory-bank/features/v1/实施计划.md',
      'memory-bank/实施计划.md',
    );

    for (const commandGroup of ['bind', 'inspect', 'run', 'record']) {
      expect(requirements).toContain(`\`${commandGroup}\``);
      expect(technical).toContain(`\`${commandGroup}\``);
      expect(plan).toContain(`\`${commandGroup}\``);
    }

    for (const stage of [
      'Intake',
      'Context Resolution',
      'Requirement Synthesis',
      'Code Localization',
      'Fix Planning',
      'Execution',
      'Artifact Linking',
      'Knowledge Recording',
    ]) {
      expect(requirements).toContain(stage);
      expect(technical).toContain(stage);
      expect(plan).toContain(stage);
    }
  });

  it('keeps v1 non-goals and AGENTS safety rules aligned with the planning documents', async () => {
    const requirements = await readDoc(
      'memory-bank/features/v1/需求文档.md',
      'memory-bank/需求文档.md',
    );
    const technical = await readDoc(
      'memory-bank/features/v1/技术方案.md',
      'memory-bank/技术方案.md',
    );
    const plan = await readDoc(
      'memory-bank/features/v1/实施计划.md',
      'memory-bank/实施计划.md',
    );
    const agents = await readDoc('AGENTS.md');

    expect(requirements).toContain('自动修改代码');
    expect(plan).toContain('自动修改代码');
    expect(agents).toContain('自动修改代码');

    expect(requirements).toContain('自动执行测试');
    expect(plan).toContain('自动执行测试');
    expect(agents).toContain('自动执行测试');

    expect(requirements).toContain('自动生成 commit');
    expect(requirements).toContain('自动创建 MR');
    expect(plan).toContain('自动创建 commit、branch、MR');
    expect(agents).toContain('自动创建 commit、branch 或 MR');

    expect(technical).toContain('CLI Layer');
    expect(technical).toContain('Workflow/Agent Layer');
    expect(technical).toContain('Skill Layer');
    expect(technical).toContain('Infrastructure Layer');
    expect(technical).toContain('Renderers');

    expect(agents).toContain('需求文档 -> 技术方案 -> 实施计划');
    expect(agents).toContain('测试是交付的一部分');
    expect(agents).toContain('优先把结果落到仓库文件中');
  });
});
