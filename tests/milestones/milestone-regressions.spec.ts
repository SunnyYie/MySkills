import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();

type RegressionPlan = {
  milestones: Array<{
    id: number;
    name: string;
    gate: string;
    coverage: string[];
    coversTasks: number[];
  }>;
};

const loadRegressionPlan = async () =>
  JSON.parse(
    await readFile(
      path.join(projectRoot, 'tests', 'milestones', 'regression-plan.json'),
      'utf8',
    ),
  ) as RegressionPlan;

describe('milestone regression plan', () => {
  it('defines five cumulative milestone gates without skipping tasks', async () => {
    const regressionPlan = await loadRegressionPlan();

    expect(regressionPlan.milestones).toHaveLength(5);

    let previousCoveredTasks: number[] = [];

    for (const expectedId of [1, 2, 3, 4, 5]) {
      const milestone = regressionPlan.milestones.find(
        (candidate) => candidate.id === expectedId,
      );

      expect(milestone).toBeDefined();
      expect(milestone?.name).toContain(`里程碑 ${expectedId}`);
      expect(milestone?.gate).toBeTruthy();
      expect(milestone?.coverage.length).toBeGreaterThan(0);

      const uniqueTasks = [...new Set(milestone?.coversTasks ?? [])].sort((left, right) => left - right);
      expect(uniqueTasks).toEqual(milestone?.coversTasks);

      for (const taskId of previousCoveredTasks) {
        expect(uniqueTasks).toContain(taskId);
      }

      previousCoveredTasks = uniqueTasks;
    }

    expect(previousCoveredTasks).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
      9, 10, 11, 12, 13, 14, 15, 16,
    ]);
  });
});
