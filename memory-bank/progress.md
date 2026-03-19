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

## 2026-03-19 - 任务 4：实现工作流状态机与不变式

### 本轮完成内容

- 在 `src/workflow/state-machine.ts` 中实现任务 4 需要的最小 workflow 状态机纯函数，固定八阶段主流程的合法状态流转边界，并明确审批阶段与外部写入阶段不能绕过 `waiting_approval -> approved_pending_write -> executing_side_effect` 的门禁路径。
- 在 `src/workflow/state-machine.ts` 中实现审批决定到 `run_lifecycle_status` / `run_outcome_status` 的映射规则，区分分析阶段审批通过后直接 `completed`，与 Jira/飞书写入阶段审批通过后仅进入 `approved_pending_write` 的差异。
- 在 `src/workflow/state-machine.ts` 中实现 `applyRevisionRollback()`，固定 `revise` 生效后从指定回退阶段起重置当前有效态、将后续阶段标记为 `stale`、清理当前有效 artifact / approval 引用，并保留历史事实由 artifacts 与审批历史承载。
- 在 `src/workflow/state-machine.ts` 中实现 `getRecoveryAction()`，把 `waiting_external_input`、`partial_success`、`outcome_unknown` 和 `prepared` / `dispatched` 未终态副作用统一收敛为显式恢复动作，为任务 5 的恢复入口路由提供稳定策略基线。
- 更新 `src/workflow/index.ts` 导出 workflow 状态机能力，并新增 `tests/unit/workflow/state-machine.spec.ts`，以红绿测试锁定任务 4 的最小契约。

### 依据

- 用户指令：继续执行实施计划任务 4；每次验证通过前不进入任务 5，验证通过后同步 `progress.md` 与 `architecture.md`，并在 worktree 代码测试通过后合并到 `main`。
- `memory-bank/实施计划.md` 任务 4：建立主流程统一状态机、审批流转、回退规则和恢复不变式，且本任务建议落点为 `src/workflow/` 与 `tests/workflow/`。
- `memory-bank/需求文档.md`：
  - “状态机要求”：必须区分阶段状态、审批决定和 run 状态；需要审批的阶段必须由 `output_ready` 进入 `waiting_approval`；`revise` 后允许回退到任一指定上游阶段并将后续阶段标记为 `stale`。
  - “检查点与恢复要求”：恢复必须基于已持久化 checkpoint；`waiting_external_input` 恢复后应继续等待补录；已成功外部写入必须可去重。
  - “审批与人工确认需求”：`approve`、`reject`、`revise` 必须独立记录，且 `reject` 终止 run 但保留上下文。
- `memory-bank/技术方案.md`：
  - “8. 状态机设计”：固定 `approved_pending_write`、`executing_side_effect`、`partial_success`、`outcome_unknown` 等状态语义与不变式。
  - “9. 工作流设计” 与 “14. 审批与人工确认设计”：四个审批门、Jira/飞书写入前 preview 审批、旧审批 `superseded` 规则。

### 验证记录

1. 验证对象：任务 4 workflow 红绿测试闭环
   触发方式：先运行 `npm run test:unit -- tests/unit/workflow/state-machine.spec.ts` 观察失败，再在实现后重复运行同一命令
   预期结果：实现前因缺少 workflow 状态机导出而失败，实现后任务 4 新增 4 项断言全部通过
   实际结果：通过；首轮失败准确暴露 `canTransitionStageStatus`、`applyApprovalDecision`、`applyRevisionRollback`、`getRecoveryAction` 尚未实现，补实现后 `tests/unit/workflow/state-machine.spec.ts` 4/4 通过

2. 验证对象：根级测试聚合入口
   触发方式：运行 `npm run test`
   预期结果：任务 4 workflow 单元测试通过，任务 1/2/3 的 acceptance 与 unit 回归继续通过
   实际结果：通过；unit 共 17/17 通过，integration 以 `--passWithNoTests` 退出码 0，acceptance `task1-project-skeleton` 4/4 通过

3. 验证对象：TypeScript 类型检查
   触发方式：运行 `npm run typecheck`
   预期结果：新增 workflow 状态机模块和导出入口可通过类型检查
   实际结果：通过；命令退出码为 0

4. 验证对象：构建入口
   触发方式：运行 `npm run build`
   预期结果：新增 `src/workflow` 文件可被编译到 `dist/`
   实际结果：通过；命令退出码为 0

### 当前边界说明

- 尚未开始任务 5；当前只实现 workflow 层的纯状态机、不变式和恢复动作判定，不实现 app 层 run 创建、锁获取、checkpoint 持久化编排或 CLI 到 use case 的装配。
- 当前 `applyRevisionRollback()` 只负责重置 `ExecutionContext` 当前有效态与活动引用；审批历史、artifact 历史和 checkpoint 写入仍由后续任务 5/后续持久化调用方承接。
- 当前 `getRecoveryAction()` 只输出“等待 / 对账 / 人工复核 / 继续当前阶段”的策略结论，不直接执行 reconcile、重试或恢复路由。

## 2026-03-19 - 任务 5：实现应用装配层与 run 生命周期控制

### 本轮完成内容

- 在 `src/app/use-cases.ts` 中冻结 CLI 到 application use case 的最小映射边界，先把 `bind`、`inspect`、`run`、`record` 四个命令组统一收敛到 app 层入口，避免 CLI 后续直接触碰 workflow 或 storage 细节。
- 在 `src/app/run-lifecycle.ts` 中实现任务 5 需要的最小 run 生命周期装配：初始化 `run_id`、初始 `ExecutionContext`、首个 checkpoint、run 级锁获取与释放，以及恢复时的 checkpoint 选择与路由判定。
- 在 `src/app/run-lifecycle.ts` 中把任务 4 的 `getRecoveryAction()` 接入 app 层恢复入口，覆盖“最近 checkpoint 恢复”“显式 checkpoint 恢复”“`outcome_unknown` / 未终态副作用先 reconcile”的判断路径。
- 在 `src/app/run-lifecycle.ts` 中固定 `StructuredError` 与 run 锁冲突/恢复缺口的 CLI 失败映射，统一错误类别、下一步建议动作和退出码归属，避免 CLI、workflow、storage 各自解释错误。
- 新增 `src/app/index.ts` 作为 app 层公共导出入口，并新增 `tests/unit/app/run-lifecycle.spec.ts`，以红绿测试锁定任务 5 的最小契约。

### 依据

- 用户指令：继续执行实施计划任务 5；在测试验证通过前不进入任务 6，验证通过后更新 `progress.md` 与 `architecture.md`，并在 worktree 代码测试通过后合并到 `main`。
- `memory-bank/实施计划.md` 任务 5：要求 app 层成为 CLI 与 workflow 之间的唯一装配入口，统一处理 run 创建、恢复、锁、错误映射和依赖注入。
- `memory-bank/需求文档.md`：
  - “检查点与恢复要求”：恢复必须基于最近持久化 checkpoint，`waiting_external_input` 不能被错误重放，已成功外部写入必须避免重复执行。
  - “错误处理需求”：CLI 输出必须有统一错误口径、用户动作建议与可检查产物。
  - “验收场景 5：中断恢复”：恢复命令必须从最近已持久化 checkpoint 恢复，并在 `outcome_unknown` 场景下先对账。
- `memory-bank/技术方案.md`：
  - `src/app` 职责：CLI 命令到 workflow 用例映射、依赖装配、run 级锁获取与释放、事务边界。
  - “8.8 检查点策略”：durable 状态迁移要有 checkpoint，恢复默认不静默重跑已审批阶段，`prepared` / `dispatched` 未终态副作用必须先 reconcile。
  - “17. 错误处理设计”：结构化错误、清晰提示、下一步动作建议、`outcome_unknown` 禁止直接盲重试。

### 验证记录

1. 验证对象：任务 5 app 红绿测试闭环
   触发方式：先运行 `npm run test:unit -- tests/unit/app/run-lifecycle.spec.ts` 观察失败，再在实现后重复运行同一命令
   预期结果：实现前因缺少 `src/app/index.ts` 与 run 生命周期导出而失败，实现后任务 5 新增 4 项断言全部通过
   实际结果：通过；首轮失败准确暴露 `src/app/index.ts` 缺失，补实现并修正锁冲突错误映射后，`tests/unit/app/run-lifecycle.spec.ts` 4/4 通过

2. 验证对象：根级测试聚合入口
   触发方式：运行 `npm run test`
   预期结果：任务 5 app 单元测试通过，任务 1-4 的 unit / acceptance 回归继续通过
   实际结果：通过；unit 共 21/21 通过，integration 以 `--passWithNoTests` 退出码 0，acceptance `task1-project-skeleton` 4/4 通过

3. 验证对象：TypeScript 类型检查
   触发方式：运行 `npm run typecheck`
   预期结果：新增 app 层导出、run 生命周期实现和测试夹具引用可通过类型检查
   实际结果：通过；命令退出码为 0

4. 验证对象：构建入口
   触发方式：运行 `npm run build`
   预期结果：新增 `src/app` 文件可被正常编译到 `dist/`
   实际结果：通过；命令退出码为 0

### 当前边界说明

- 尚未开始任务 6；当前只实现 app 层最小装配、run 初始化、恢复入口路由与错误映射，不实现 `config-loader`、项目画像读取校验、CLI 子命令注册或真实 workflow 执行器。
- 当前 `initializeRun()` 只负责建立任务 5 所需的初始上下文与 checkpoint 基线，不提前写入审计事件、artifact 导出或副作用账本。
- 当前 `restoreRun()` 只负责选择恢复 checkpoint、加载最新上下文并输出恢复策略结论；真正的 reconcile 执行、阶段重放和审批恢复仍属于后续任务。

## 2026-03-19 - 任务 6：实现 `config-loader` 与项目画像校验链路

### 本轮完成内容

- 在 `src/skills/config-loader/index.ts` 中实现任务 6 的最小配置能力：按项目隔离读取 `ProjectProfile` 草稿、补齐 `project_id`、检测缺失字段、`config_version` 格式、显式引用合法性，并在完整配置时输出稳定排序后的标准化 `ProjectProfile`。
- 在 `src/skills/config-loader/index.ts` 中补充分段写入能力 `upsertProjectProfileSection()`，让 `bind project|jira|requirements|gitlab|feishu|repo` 可以逐段维护项目画像，而不是要求一次性提供全量配置。
- 在 `src/app/project-profile.ts` 中把 `bind` 与 `inspect` 相关能力收敛回 app 层，统一处理 JSON 文件读取、配置写入、完整性检查、关系预览和接入体检，继续保持 CLI 不直接碰 storage / skills 细节。
- 在 `src/cli/bind/register.ts`、`src/cli/inspect/register.ts` 与 `src/cli/program.ts` 中注册任务 6 所需的最小命令面，支持 `bind project|jira|requirements|gitlab|feishu|repo --project <id> --file <path>` 以及 `inspect config|graph|connectors --project <id> [--json]`。
- 在 `src/cli/program.ts` 中加入可注入 `io` 与 `BUGFIX_ORCHESTRATOR_HOME` 环境覆盖，使 CLI 集成测试可以在隔离 home 目录中验证配置读写而不污染真实用户目录。
- 新增 `tests/unit/config/config-loader.spec.ts` 与 `tests/integration/cli/config-commands.spec.ts`，通过红绿测试锁定任务 6 的最小契约：完整配置标准化、缺失字段与非法引用提示、`bind` 只写配置不建 run、`inspect` 只读不改状态。

### 依据

- 用户指令：阅读 `memory-bank` 全部文档后继续执行实施计划任务 6；每在验证测试结果之前不开始下一个任务；验证通过后更新 `progress.md` 与 `architecture.md`；在此之前不进入任务 7，并在 worktree 测试通过后合并到 `main`。
- `memory-bank/实施计划.md` 任务 6：要求实现 `config-loader`、项目画像校验链路，以及 CLI `bind` / `inspect` 的最小职责边界。
- `memory-bank/需求文档.md`：
  - “项目画像配置最小字段要求”：`ProjectProfile` 必须包含 Jira、requirements、GitLab、飞书、repo、approval/serialization/sensitivity policy 的最小字段。
  - “CLI 需求”：`bind` 负责维护项目画像和系统关系，`inspect` 负责配置检查、关系预览和接入体检。
  - “项目关系绑定需求”：缺失关键信息必须显式提示补录，不能静默猜测；不同项目之间的凭证引用、模板配置和需求规则必须可隔离。
- `memory-bank/技术方案.md`：
  - “7.1 ProjectProfile”：项目画像是运行期唯一可信配置来源，要求按项目独立存储、可版本化、可校验完整性、支持凭证引用隔离。
  - “config-loader” 能力定义：负责校验并标准化已读取的 `ProjectProfile`。
  - “CLI 设计” 中的 `bind` / `inspect`：固定命令分组与子命令集合。

### 验证记录

1. 验证对象：任务 6 `config-loader` 红绿测试闭环
   触发方式：先运行 `npm run test:unit -- tests/unit/config/config-loader.spec.ts` 观察失败，再在实现后重复运行同一命令
   预期结果：实现前因缺少 `src/skills/config-loader/index.ts` 和相关导出而失败，实现后任务 6 新增 4 项断言全部通过
   实际结果：通过；首轮失败准确暴露 `inspectStoredProjectProfile` / `loadProjectProfile` 模块缺失，补实现并修正 `source_ref` 引用校验后，`tests/unit/config/config-loader.spec.ts` 4/4 通过

2. 验证对象：任务 6 CLI `bind` / `inspect` 集成测试
   触发方式：先运行 `npm run test:integration -- tests/integration/cli/config-commands.spec.ts` 观察失败，再在实现后重复运行同一命令
   预期结果：实现前因 CLI 未注册 `bind` / `inspect` 子命令而失败，实现后 2 项集成断言全部通过
   实际结果：通过；首轮失败准确暴露 `unknown option '--project'`，补齐命令注册、app 装配和输出注入后，`tests/integration/cli/config-commands.spec.ts` 2/2 通过

3. 验证对象：根级测试聚合入口
   触发方式：运行 `npm test`
   预期结果：任务 6 新增 unit / integration 测试通过，任务 1-5 的既有测试继续通过
   实际结果：通过；unit 共 25/25 通过，integration `config-commands` 2/2 通过，acceptance `task1-project-skeleton` 4/4 通过

4. 验证对象：TypeScript 类型检查
   触发方式：运行 `npm run typecheck`
   预期结果：新增 `config-loader`、CLI 注册模块、app 配置装配与测试夹具可通过类型检查
   实际结果：通过；命令退出码为 0

5. 验证对象：构建入口
   触发方式：运行 `npm run build`
   预期结果：新增 `src/skills/config-loader`、`src/cli/bind`、`src/cli/inspect`、`src/app/project-profile.ts` 可被正常编译到 `dist/`
   实际结果：通过；命令退出码为 0

### 当前边界说明

- 尚未开始任务 7；当前只实现项目画像加载/校验、分段绑定写入和 `inspect` 只读体检，不实现 Jira intake、需求线索提取、项目匹配或仓库模块解析。
- 当前 `bind` 只接收显式 JSON 文件输入并维护项目画像草稿，不触发 run 创建、workflow 状态推进、preview 生成或任何外部副作用。
- 当前 `inspect connectors` 只做本地配置完备性与 repo 路径可访问性检查，不调用 Jira / GitLab / 飞书真实接口，因此“ready” 表示配置就绪而非远端联通性已验证。
