# Architecture Notes

## 任务 1 当前骨架

本文件记录任务 1 完成后仓库中实现文件的职责，作为后续任务继续落地时的结构基线。当前内容只解释骨架，不提前定义任务 2 及之后的业务细节。

## 文件职责

### 根目录配置

- `.gitignore`
  - 忽略 `.worktrees/`、`node_modules/`、`dist/`、`coverage/`，避免隔离工作区、安装产物和构建产物污染仓库状态。

- `package.json`
  - 固定 v1 当前授权的基础技术栈。
  - 提供根级脚本入口：类型检查、构建、单元测试、集成测试、验收测试、CLI 运行。
  - 通过 `--passWithNoTests` 保证任务 1 阶段在 unit/integration 尚未落地前仍能保留独立入口而不阻塞验收。

- `tsconfig.json`
  - 提供源代码与测试共享的 TypeScript 基础编译配置。
  - 启用 `NodeNext`，让 CLI 源码和 Vitest 测试保持一致的模块解析方式。

- `tsconfig.build.json`
  - 从基础 TypeScript 配置继承，并将构建范围限制到 `src/`。
  - 定义 `dist/` 为构建输出目录，避免把测试文件打包进 CLI 产物。

- `vitest.config.ts`
  - 固定 Node 环境下的测试运行配置。
  - 统一 `tests/**/*.spec.ts` 作为测试文件匹配入口。

### CLI 与应用装配层

- `src/app/bootstrap.ts`
  - 当前应用装配层的最小入口。
  - 负责把 CLI 程序对象装配出来，为后续 run 生命周期控制保留稳定接缝。

- `src/cli/program.ts`
  - 创建基础 `commander` 程序对象。
  - 当前只定义程序名、说明和帮助行为，避免在任务 1 提前进入命令实现。

- `src/cli/bin.ts`
  - CLI 可执行入口。
  - 调用 `bootstrapCli()` 并处理顶层异常，证明构建产物可被 Node 直接运行。

### 目录锚点文件

- `src/domain/index.ts`
  - 保留 domain 层唯一落点，等待任务 2 冻结 schema、枚举和核心对象。

- `src/workflow/index.ts`
  - 保留 workflow 层唯一落点，后续承接阶段编排、审批、回退、恢复与 checkpoint 逻辑。

- `src/skills/index.ts`
  - 保留 skill 层锚点，后续承接无状态结构化能力实现。

- `src/infrastructure/index.ts`
  - 保留基础设施层总入口，后续统一挂接 connectors 与 repo 访问能力。

- `src/infrastructure/connectors/index.ts`
  - 预留 Jira、GitLab、飞书等外部系统接入实现。

- `src/infrastructure/repo/index.ts`
  - 预留本地仓库、Git 元数据和模块规则相关实现。

- `src/storage/index.ts`
  - 预留项目画像、run 状态、checkpoint 和 artifact 持久化能力。

- `src/renderers/index.ts`
  - 预留 CLI、Markdown、JSON 渲染能力，保持渲染职责独立。

- `src/security/index.ts`
  - 预留脱敏、allowlist 和敏感字段保护规则。

### 结构说明文档

- `src/README.md`
  - 解释所有核心实现目录的职责边界。
  - 明确当前阶段暂不引入新的基础依赖，避免任务 1 顺手扩 scope。

- `tests/README.md`
  - 定义 `unit`、`integration`、`acceptance` 三层测试落点与命名规则。
  - 为后续 16 个任务提供统一测试落位约定。

### 测试文件

- `tests/acceptance/task1-project-skeleton.spec.ts`
  - 任务 1 的验收测试。
  - 验证目录骨架、依赖边界、脚本入口和职责文档是否满足实施计划。

- `tests/unit/.gitkeep`
  - 保留单元测试目录，使骨架在仓库中可追踪。

- `tests/integration/.gitkeep`
  - 保留集成测试目录，使骨架在仓库中可追踪。

## 当前架构洞察

- 任务 1 的关键不是“先把功能写出来”，而是先把目录 owner 固定下来，避免后续任务把状态机、connector、渲染和持久化混写到同一层。
- 当前只让 `src/app` 和 `src/cli` 形成最小闭环，是为了先验证根级构建与执行链路；业务契约仍留在 `src/domain` 等目录等待任务 2 冻结。
- 测试入口从第一步就分成 `unit / integration / acceptance`，能减少后续“先写实现，最后再找测试位置”的返工。
