import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();

const canAccess = async (targetPath: string) => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const loadRegressionPlan = async () => {
  const regressionPlanPath = path.join(
    projectRoot,
    'tests',
    'milestones',
    'regression-plan.json',
  );
  const contents = await readFile(regressionPlanPath, 'utf8');
  return JSON.parse(contents) as {
    levels: {
      taskLevelDirectories: string[];
      taskGroupDirectory: string;
      milestoneDirectory: string;
    };
    tasks: Record<string, string[]>;
    acceptanceScenarios: Array<{
      id: number;
      name: string;
      coverage: string[];
    }>;
    milestones: Array<{
      id: number;
      name: string;
      gate: string;
      coverage: string[];
    }>;
    documentConsistency: {
      documents: string[];
      knownAssumptions: string[];
    };
  };
};

describe('任务 16：回归结构与验收追踪', () => {
  it('建立任务级、任务组级、里程碑级三层验证结构，并给 16 个任务提供最小回归入口', async () => {
    const readme = await readFile(path.join(projectRoot, 'tests', 'README.md'), 'utf8');
    const packageJson = JSON.parse(
      await readFile(path.join(projectRoot, 'package.json'), 'utf8'),
    ) as {
      scripts?: Record<string, string>;
    };
    const regressionPlanPath = path.join(
      projectRoot,
      'tests',
      'milestones',
      'regression-plan.json',
    );

    expect(readme).toContain('tests/milestones');
    expect(packageJson.scripts?.['test:milestones']).toBeDefined();
    expect(packageJson.scripts?.test).toContain('test:milestones');
    expect(await canAccess(regressionPlanPath)).toBe(true);

    const regressionPlan = await loadRegressionPlan();

    expect(regressionPlan.levels.taskLevelDirectories).toEqual([
      'tests/unit',
      'tests/integration',
    ]);
    expect(regressionPlan.levels.taskGroupDirectory).toBe('tests/acceptance');
    expect(regressionPlan.levels.milestoneDirectory).toBe('tests/milestones');
    expect(Object.keys(regressionPlan.tasks)).toHaveLength(16);

    for (const taskNumber of Array.from({ length: 16 }, (_, index) => String(index + 1))) {
      const coverage = regressionPlan.tasks[taskNumber];
      expect(Array.isArray(coverage)).toBe(true);
      expect(coverage.length).toBeGreaterThan(0);

      for (const relativePath of coverage) {
        expect(
          await canAccess(path.join(projectRoot, relativePath)),
          `missing coverage file for task ${taskNumber}: ${relativePath}`,
        ).toBe(true);
      }
    }
  });

  it('把需求文档的 8 个验收场景逐条映射到可执行测试路径', async () => {
    const regressionPlan = await loadRegressionPlan();

    expect(regressionPlan.acceptanceScenarios).toHaveLength(8);

    for (const scenarioId of Array.from({ length: 8 }, (_, index) => index + 1)) {
      const scenario = regressionPlan.acceptanceScenarios.find(
        (candidate) => candidate.id === scenarioId,
      );

      expect(scenario).toBeDefined();
      expect(scenario?.coverage.length).toBeGreaterThan(0);

      for (const relativePath of scenario?.coverage ?? []) {
        expect(
          await canAccess(path.join(projectRoot, relativePath)),
          `missing acceptance coverage for scenario ${scenarioId}: ${relativePath}`,
        ).toBe(true);
      }
    }
  });

  it('定义 5 个递进式里程碑回归，并记录文档一致性检查范围与已知假设', async () => {
    const regressionPlan = await loadRegressionPlan();

    expect(regressionPlan.milestones).toHaveLength(5);
    expect(regressionPlan.documentConsistency.documents).toEqual([
      'memory-bank/需求文档.md',
      'memory-bank/技术方案.md',
      'memory-bank/实施计划.md',
      'AGENTS.md',
    ]);
    expect(regressionPlan.documentConsistency.knownAssumptions.length).toBeGreaterThan(0);

    for (const milestoneId of Array.from({ length: 5 }, (_, index) => index + 1)) {
      const milestone = regressionPlan.milestones.find(
        (candidate) => candidate.id === milestoneId,
      );

      expect(milestone).toBeDefined();
      expect(milestone?.gate).toBeTruthy();
      expect(milestone?.coverage.length).toBeGreaterThan(0);

      for (const relativePath of milestone?.coverage ?? []) {
        expect(
          await canAccess(path.join(projectRoot, relativePath)),
          `missing milestone coverage for milestone ${milestoneId}: ${relativePath}`,
        ).toBe(true);
      }
    }
  });
});
