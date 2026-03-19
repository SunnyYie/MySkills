import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentFile = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(currentFile), "../..");

function readJson(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

describe("task 1 project skeleton", () => {
  it("creates the directory skeleton and canonical landing zones from the implementation plan", () => {
    const requiredDirectories = [
      "src",
      "src/app",
      "src/cli",
      "src/domain",
      "src/workflow",
      "src/skills",
      "src/infrastructure",
      "src/infrastructure/connectors",
      "src/infrastructure/repo",
      "src/storage",
      "src/renderers",
      "src/security",
      "tests",
      "tests/unit",
      "tests/integration",
      "tests/acceptance"
    ];

    for (const directory of requiredDirectories) {
      expect(existsSync(path.join(rootDir, directory)), `${directory} should exist`).toBe(true);
    }
  });

  it("pins the task 1 default stack without introducing an unauthorized foundation framework", () => {
    const packageJson = readJson(path.join(rootDir, "package.json"));
    const dependencies = packageJson.dependencies as Record<string, string>;
    const devDependencies = packageJson.devDependencies as Record<string, string>;

    expect(dependencies.commander).toBeTruthy();
    expect(dependencies.zod).toBeTruthy();
    expect(devDependencies.typescript).toBeTruthy();
    expect(devDependencies.vitest).toBeTruthy();

    expect(dependencies.react).toBeUndefined();
    expect(dependencies.express).toBeUndefined();
    expect(devDependencies.jest).toBeUndefined();
  });

  it("defines explicit root scripts for typecheck, layered tests, build, and cli execution", () => {
    const packageJson = readJson(path.join(rootDir, "package.json"));
    const scripts = packageJson.scripts as Record<string, string>;

    expect(scripts.typecheck).toBeTruthy();
    expect(scripts.test).toBeTruthy();
    expect(scripts["test:unit"]).toBeTruthy();
    expect(scripts["test:integration"]).toBeTruthy();
    expect(scripts["test:acceptance"]).toBeTruthy();
    expect(scripts.build).toBeTruthy();
    expect(scripts["cli:run"]).toBeTruthy();
  });

  it("documents module and test responsibilities so later tasks have a stable landing zone", () => {
    const srcReadmePath = path.join(rootDir, "src/README.md");
    const testsReadmePath = path.join(rootDir, "tests/README.md");

    expect(existsSync(srcReadmePath)).toBe(true);
    expect(existsSync(testsReadmePath)).toBe(true);

    const srcReadme = readFileSync(srcReadmePath, "utf8");
    const testsReadme = readFileSync(testsReadmePath, "utf8");

    expect(srcReadme).toContain("src/app");
    expect(srcReadme).toContain("src/workflow");
    expect(srcReadme).toContain("src/infrastructure");
    expect(testsReadme).toContain("tests/unit");
    expect(testsReadme).toContain("tests/integration");
    expect(testsReadme).toContain("tests/acceptance");
  });
});
