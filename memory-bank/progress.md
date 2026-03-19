# Progress

## 2026-03-19 - 任务 1：初始化项目骨架与依赖约束

### 本轮完成内容

- 建立 v1 初始实现骨架：`src/app`、`src/cli`、`src/domain`、`src/workflow`、`src/skills`、`src/infrastructure/connectors`、`src/infrastructure/repo`、`src/storage`、`src/renderers`、`src/security`、`tests/unit`、`tests/integration`、`tests/acceptance`。
- 固定根级依赖边界：`commander`、`zod`、`typescript`、`vitest`、`@types/node`，未引入需求文档和技术方案未授权的基础框架。
- 固定根级脚本：`build`、`typecheck`、`test`、`test:unit`、`test:integration`、`test:acceptance`、`cli:run`。
- 添加最小 CLI 骨架：`src/cli/bin.ts`、`src/cli/program.ts`、`src/app/bootstrap.ts`，仅提供帮助输出，不提前实现任务 15 的命令面。
- 添加任务 1 验收测试 `tests/acceptance/task1-project-skeleton.spec.ts`，覆盖目录骨架、依赖边界、脚本入口与职责文档。
- 添加 `src/README.md` 与 `tests/README.md`，明确模块职责边界、测试落点和命名规则。

### 依据

- 用户指令：继续执行实施计划的任务 1，验证通过后再更新 `progress.md` 和 `architecture.md`，且在此之前不进入任务 2。
- `memory-bank/需求文档.md`：v1 为 CLI-first，非目标包括自动改代码、自动跑测试、自动创建 commit/branch/MR。
- `memory-bank/技术方案.md`：采用 TypeScript、Node.js、`commander`、`zod`、`vitest`，并按 `src/app`、`src/cli`、`src/domain`、`src/workflow`、`src/skills`、`src/infrastructure`、`src/storage`、`src/renderers`、`src/security` 分层。
- `memory-bank/实施计划.md` 任务 1：先固定目录骨架、依赖边界、测试入口与根级脚本。

### 验证记录

1. 验证对象：任务 1 骨架验收测试
   触发方式：运行 `npm run test:acceptance`
   预期结果：目录骨架、依赖边界、脚本入口、职责文档全部满足任务 1 要求
   实际结果：通过，`tests/acceptance/task1-project-skeleton.spec.ts` 共 4 项断言全部通过

2. 验证对象：TypeScript 类型检查入口
   触发方式：运行 `npm run typecheck`
   预期结果：当前骨架代码可通过类型检查
   实际结果：通过，命令退出码为 0

3. 验证对象：构建入口
   触发方式：运行 `npm run build`
   预期结果：`src/` 可被编译到 `dist/`
   实际结果：通过，命令退出码为 0

4. 验证对象：根级测试脚本聚合入口
   触发方式：运行 `npm run test`
   预期结果：unit/integration 在任务 1 阶段允许空集合通过，acceptance 测试通过
   实际结果：通过，`test:unit` 与 `test:integration` 以 `--passWithNoTests` 退出码 0，acceptance 测试 4/4 通过

5. 验证对象：CLI 运行入口
   触发方式：运行 `npm run cli:run -- --help`
   预期结果：能输出基础帮助信息，证明 CLI 入口、构建产物和运行脚本已连通
   实际结果：通过，输出 `bugfix-orchestrator` 的帮助信息

### 当前边界说明

- 尚未开始任务 2，`src/domain`、`src/workflow`、`src/skills`、`src/storage`、`src/infrastructure` 等目录目前只保留锚点文件，不承载正式业务契约。
- 尚未引入任何真实外部连接器、持久化副作用、状态机逻辑或 schema 细节。

## 2026-03-19 - 任务 2：定义领域层 schema 与枚举

### 本轮完成内容

- 在 `src/domain/enums.ts` 中冻结跨任务契约需要复用的阶段枚举、阶段状态、审批决定、审批状态、`run_lifecycle_status`、`run_outcome_status`、`run_mode`、GitLab/Jira/飞书写入相关枚举，以及统一错误类别与默认重试语义。
- 在 `src/domain/schemas.ts` 中定义 `ProjectProfile`、`ExecutionContext`、`RequirementBrief`、`BugfixReport`、`ApprovalRecord`、`SideEffectLedgerEntry`、`CheckpointRecord`、`StructuredError` 的 Zod schema，并补齐 `GitLabArtifact`、Jira 写回 draft/result、飞书写入 draft/result 等下游直接依赖的结构化契约。
- 通过 `RequirementBriefSchema`、`RequirementReferenceSchema`、`GitLabArtifactSchema`、`ApprovalRecordSchema` 等条件约束，固定“未绑定需求必须带 `binding_reason`”“GitLab commit/branch/MR 条件必填”“`revise` 必须带 `rollback_to_stage`”等规则。
- 以 `EXECUTION_CONTEXT_STORAGE_PROJECTION` 明确 `ExecutionContext` 的逻辑字段与物理存储边界，约束 `context.json` 仅承载当前有效态字段，而 side effect 历史、checkpoint 历史和错误长正文通过独立文件或 artifact ref 承载。
- 新增 `tests/unit/domain/contracts.spec.ts`，以单元测试锁定任务 2 的最小契约，避免后续 workflow、storage、CLI 反向篡改 domain 层字段和命名。

### 依据

- 用户指令：继续执行实施计划任务 2，在验证通过前不进入任务 3，验证通过后同步 `progress.md` 与 `architecture.md`。
- `memory-bank/实施计划.md` 任务 2：冻结核心对象、字段、条件必填规则、状态枚举与统一错误语义，并写清 `ExecutionContext` 的逻辑全量字段与持久化投影边界。
- `memory-bank/需求文档.md`：
  - “项目关系绑定需求”：`ProjectProfile` 最小字段与 requirement link rules 的边界。
  - “执行上下文需求”：`ExecutionContext` 的最小字段、敏感字段路径要求与可恢复诉求。
  - “输出与报告需求”：`Bugfix Report` 最小字段。
  - “错误处理需求”：统一结构化错误字段、部分成功语义与用户动作建议。
- `memory-bank/技术方案.md`：
  - “核心数据模型”：8 个核心对象的最小字段定义。
  - “状态机设计”：阶段状态、审批状态、run 双轨状态与不变式。
  - “错误处理设计”：错误类别、`partial_success`、`outcome_unknown` 语义。

### 验证记录

1. 验证对象：任务 2 domain 契约单元测试
   触发方式：先运行 `npm run test:unit -- tests/unit/domain/contracts.spec.ts` 观察失败，再在实现后重复运行同一命令
   预期结果：实现前因缺少 schema/枚举而失败，实现后 9 个契约断言全部通过
   实际结果：通过；首轮失败准确暴露缺失导出与 schema 约束，修复后 `tests/unit/domain/contracts.spec.ts` 9/9 通过

2. 验证对象：根级测试聚合入口
   触发方式：运行 `npm run test`
   预期结果：新增 domain 单元测试通过，任务 1 验收测试继续通过，未新增 integration 测试时入口仍保持可执行
   实际结果：通过；unit 9/9 通过，integration 以 `--passWithNoTests` 退出码 0，acceptance `task1-project-skeleton` 4/4 通过

3. 验证对象：TypeScript 类型检查
   触发方式：运行 `npm run typecheck`
   预期结果：新增 domain schema 与导出入口可通过类型检查
   实际结果：通过；命令退出码为 0

4. 验证对象：构建入口
   触发方式：运行 `npm run build`
   预期结果：`src/domain` 新增文件可被正常编译到 `dist/`
   实际结果：通过；命令退出码为 0

### 当前边界说明

- 尚未开始任务 3；当前只冻结 domain 契约和投影边界，不实现实际落盘、脱敏、文件锁、checkpoint 写入或 side effect ledger 持久化逻辑。
- `run_mode` 当前采用 `full`、`brief_only`、`jira_writeback_only`、`feishu_record_only` 四值，依据现有主流程与三个子工作流命名收敛；若后续上位文档显式补充其他模式，应先更新文档基线再改 schema。
- Jira `target_type` 当前收敛为 `comment | field`，用于先固定写回契约的最小判别维度；未提前扩展更多 Jira 写入目标类型。

## 2026-03-19 - 任务 3：定义持久化与脱敏基础

### 本轮完成内容

- 在 `src/storage/layout.ts` 中固定本地持久化基线：项目画像默认落在 `~/.config/bugfix-orchestrator/projects/<project_id>.json`，run 默认落在 `~/.local/share/bugfix-orchestrator/runs/<run_id>/`，并冻结 `context.json`、`events.ndjson`、`side-effects.ndjson`、`checkpoints/`、`artifacts/`、`lock` 的目录布局与职责说明。
- 在 `src/storage/layout.ts` 中定义 `ExecutionContext`、checkpoint、artifact metadata、report、audit event 的落盘 allowlist，以及 dry-run preview 默认持久化、必须标记 `dry_run_preview`、不得写出成功副作用账本记录的策略常量。
- 在 `src/storage/filesystem.ts` 中实现任务 3 需要的最小文件系统基线：`0700` 目录创建、`0600` 文件原子写、run 级独占锁、checkpoint 文件命名与按序读取，确保后续恢复逻辑建立在稳定的物理约束上。
- 在 `src/security/redaction.ts` 中实现统一 redaction 入口，默认遮蔽 `Authorization`、`Cookie`、`credential_ref`、`request_payload` 等敏感字段，并支持对 `sensitiveFieldPaths` 指定的自由文本路径做落盘脱敏。
- 新增 `tests/unit/storage/persistence-foundation.spec.ts` 与 `tests/unit/security/redaction.spec.ts`，用单元测试锁定任务 3 的最小契约，避免后续 app/workflow/connector 层绕开 allowlist、锁语义或脱敏规则。

### 依据

- 用户指令：继续执行实施计划任务 3；在验证通过之前不进入任务 4，验证通过后更新 `progress.md` 与 `architecture.md`，并在 worktree 验证通过后合并回 `main`。
- `memory-bank/实施计划.md` 任务 3：先固定持久化路径、run 目录职责、落盘 allowlist、dry-run 持久化边界、redaction 规则、原子写与文件锁语义。
- `memory-bank/需求文档.md`：
  - “检查点与恢复要求”：恢复必须基于最近持久化 checkpoint，已成功外部写入必须具备去重依据。
  - “CLI 需求”：v1 必须具备阶段结果序列化保存与恢复执行能力。
  - “安全与凭证需求”：敏感字段不得明文落盘，必须支持标记敏感字段路径。
- `memory-bank/技术方案.md`：
  - “12. 持久化与审计设计”：固定本地文件系统持久化路径、run 目录布局、原子写顺序与副作用账本职责。
  - “16. 安全与脱敏设计”：`credential_ref` 仅作为引用存在，`request_payload` 等敏感内容不得明文落盘，日志/checkpoint/report/artifacts 都需要 redaction。

### 验证记录

1. 验证对象：任务 3 storage/security 红绿测试闭环
   触发方式：先运行 `npm run test:unit -- tests/unit/storage/persistence-foundation.spec.ts` 与 `npm run test:unit -- tests/unit/security/redaction.spec.ts` 观察失败，再在实现后重复运行同样命令
   预期结果：实现前因为缺少 storage/security 出口与规则实现而失败，实现后任务 3 新增断言全部通过
   实际结果：通过；首轮失败暴露 `getRunPaths`、`EXECUTION_CONTEXT_ALLOWLIST`、`redactForStorage` 等缺失，补实现后 storage/security 新增 4 个断言全部通过

2. 验证对象：全量单元测试与既有 domain 契约回归
   触发方式：运行 `npm run test`
   预期结果：任务 3 单元测试通过，任务 2 的 domain 契约测试继续通过，任务 1 的 acceptance 测试不回退
   实际结果：通过；unit 共 13/13 通过，integration 以 `--passWithNoTests` 退出码 0，acceptance `task1-project-skeleton` 4/4 通过

3. 验证对象：TypeScript 类型检查
   触发方式：运行 `npm run typecheck`
   预期结果：新增 storage/security 模块和导出入口可通过类型检查
   实际结果：通过；命令退出码为 0

4. 验证对象：构建入口
   触发方式：运行 `npm run build`
   预期结果：新增 `src/storage`、`src/security` 文件可被编译到 `dist/`
   实际结果：通过；命令退出码为 0

### 当前边界说明

- 尚未开始任务 4；当前只定义持久化布局、allowlist、dry-run 标记、redaction 入口和基础文件系统语义，不实现工作流状态机、审批流转、恢复入口路由或 reconcile 决策。
- 当前 redaction 只覆盖任务 3 上位文档明确要求的敏感键和显式 `sensitiveFieldPaths`；若后续 connector 引入新的敏感字段类别，应先补充文档基线或任务说明，再扩展规则。
- 当前 checkpoint 读取一致性建立在“命名按序 + schema 校验 + 顺序读取”之上；更高阶的恢复策略、未终态副作用 reconcile 与 target 级全局锁仍属于任务 4/后续任务。
