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

## 任务 2 当前契约层

任务 2 完成后，`src/domain` 不再只是占位目录，而是后续 workflow、storage、skills、CLI 共享的契约源。这个阶段仍然只冻结“能传什么、必须带什么、哪些字段不能混放”，不提前承担流程驱动或物理持久化。

## 新增文件职责

### `src/domain/enums.ts`

- 冻结跨任务共享的命名常量，包括主流程阶段、阶段状态、审批决定、审批状态、run 双轨状态、run mode、GitLab 产物类型、Jira 写回目标类型、飞书写入模式、副作用账本状态和统一错误类别。
- 提供 `ERROR_CATEGORY_POLICIES`，把“默认是否可重试”“是否允许 `outcome_unknown`”前置到 domain 层，避免 app、workflow、CLI 各自解释。
- 提供 `EXECUTION_CONTEXT_STORAGE_PROJECTION`，先把逻辑上下文字段和物理落盘位置分开表达，为任务 3 的 storage/security 实现留下明确边界。

### `src/domain/schemas.ts`

- 用 Zod 定义任务 2 需要冻结的核心对象 schema。
- 把条件必填规则直接写进 schema：例如 `RequirementBrief`/`RequirementReference` 在 `unresolved` 时强制要求 `binding_reason`，GitLab commit/branch/MR 各自带不同条件字段，`ApprovalRecord` 在 `revise` 时必须声明 `rollback_to_stage`。
- 保持 `ExecutionContext` 只承载当前有效态与 artifact/error ref，而不是直接嵌入 side effect ledger、checkpoint 列表或错误历史正文。
- 把 Jira/飞书写入 draft/result 拆成独立 schema，让后续 preview 与 execute 可以共享同一组基础契约，而不是把外部写入对象揉进 workflow 状态。

### `src/domain/index.ts`

- 作为 domain 层唯一公共导出入口，统一向后续模块暴露枚举、schema 和类型推断。
- 保持后续导入路径稳定，减少任务 3 以后出现“每层都自己拼内部文件路径”的耦合。

### `tests/unit/domain/contracts.spec.ts`

- 任务 2 的 domain 单元测试。
- 先锁定“命名不能漂移、字段不能弱化、条件必填不能靠调用方记忆”的约束，再允许后续模块在其上叠加行为实现。
- 同时验证 `ExecutionContext` 的物理投影边界没有被错误地塞回当前有效态。

## 任务 2 架构洞察

- 这一步最重要的不是“把所有业务对象都建完”，而是先把 owner 固定住：对象字段、状态命名、条件必填和错误类别都应该先收敛在 `src/domain`，而不是分散到 workflow、CLI 参数解析或 connector 适配器里。
- `ExecutionContext` 在逻辑上是“全量运行态”，但在物理上不能成为“什么都往里塞”的大对象；因此任务 2 先把 ref 化边界写出来，任务 3 再去实现真实存储结构，会比先写文件再回头裁字段稳得多。
- Jira/飞书/GitLab 相关契约虽然真正实现会落在 infrastructure/skills 中，但它们的最小字段和条件必填必须提前冻结，否则后续每一层都会各自复制一份弱约束对象。
- 当前 `run_mode` 与 Jira `target_type` 采用最小命名收敛，是为后续任务提供稳定起点，而不是抢先扩 scope；如果上位文档将来新增模式或目标类型，应先改文档基线，再同步 domain 枚举与测试。

## 任务 3 当前持久化与安全基线

任务 3 完成后，`src/storage` 和 `src/security` 不再只是占位目录，而是为后续 workflow/app/CLI 提供“哪些内容可以落盘、落到哪里、以什么权限落盘、哪些内容必须先脱敏”的统一底座。这个阶段仍然不负责状态机与恢复决策，只负责把物理边界固定住。

## 新增文件职责

### `src/storage/layout.ts`

- 固定项目画像与 run 数据的默认落盘根路径，明确 `~/.config/bugfix-orchestrator/projects` 与 `~/.local/share/bugfix-orchestrator/runs` 是任务 3 之后的默认目录约定。
- 冻结 run 目录布局常量：`context.json`、`events.ndjson`、`side-effects.ndjson`、`checkpoints/`、`artifacts/`、`lock`。
- 提供 `RUN_LAYOUT_RESPONSIBILITIES`，把每个文件/目录的 owner 先写死，避免后续把 checkpoint、审计事件和当前有效态继续混塞进 `context.json`。
- 通过 `EXECUTION_CONTEXT_ALLOWLIST`、`CHECKPOINT_ALLOWLIST`、`ARTIFACT_METADATA_ALLOWLIST`、`REPORT_ALLOWLIST`、`AUDIT_EVENT_ALLOWLIST` 和 `DRY_RUN_PERSISTENCE_POLICY` 把“能落什么、dry-run 怎么标记、什么不能被当成真实副作用成功”前置为跨层共享常量。
- 提供 `getProjectProfilePath()`、`getRunPaths()`、`getCheckpointFilePath()` 等路径解析函数，让后续 storage/app 层使用统一路径生成逻辑，而不是散落字符串拼接。

### `src/storage/filesystem.ts`

- 提供任务 3 范围内最小的文件系统语义：私有目录创建、`tmp + fsync + rename` 原子写、run 级独占锁、checkpoint 顺序读取。
- `ensureRunDirectories()` 只负责建立 run 根目录与关键子目录，不夹带业务初始化逻辑，保持 storage 基线和 workflow 初始化分离。
- `acquireRunLock()` / `releaseRunLock()` 把“同一 run 同时只允许一个写入者”的约束显式化，为任务 5 的 run 生命周期控制保留稳定接缝。
- `readCheckpointRecords()` 通过文件名排序与 `CheckpointRecordSchema` 校验提供最小读取一致性，确保后续恢复不会把半结构化 JSON 当作有效 checkpoint。

### `src/storage/index.ts`

- 作为 storage 层唯一公共导出入口，统一暴露布局常量与文件系统基线。
- 让 app/workflow/CLI 后续依赖 storage 时不需要跨文件夹直接引用内部实现细节。

### `src/security/redaction.ts`

- 提供任务 3 统一 redaction 入口 `redactForStorage()`。
- 默认遮蔽 `Authorization`、`Cookie`、`credential_ref`、`request_payload` 等上位文档明确列出的敏感字段，同时允许通过 `sensitiveFieldPaths` 继续收敛到具体自由文本路径。
- 用不可变转换方式返回脱敏结果，避免调用方一边做日志/导出脱敏、一边意外污染内存中的原始结构。

### `src/security/index.ts`

- 作为 security 层唯一公共导出入口，统一暴露 redaction 常量与函数。
- 为后续 report renderer、CLI JSON 输出、checkpoint 写入提供稳定依赖点。

### `tests/unit/storage/persistence-foundation.spec.ts`

- 任务 3 的 storage 单元测试。
- 锁定默认路径、run 目录布局、allowlist、dry-run 策略、目录/文件权限、run 锁冲突和 checkpoint 顺序读取。
- 这组测试的重点不是覆盖未来业务流程，而是防止后续任务在不知情的情况下破坏持久化底座。

### `tests/unit/security/redaction.spec.ts`

- 任务 3 的 security 单元测试。
- 锁定敏感键、`request_payload`、`credential_ref` 和显式 `sensitiveFieldPaths` 的脱敏行为。
- 同时验证 redaction 不会原地改坏源对象，减少后续日志/导出逻辑踩到共享引用的风险。

## 任务 3 架构洞察

- 任务 2 解决的是“逻辑上有哪些字段”，任务 3 解决的是“物理上哪些字段可以落盘、哪些只能留在 ref 或内存里”；这两个边界如果不分开，后续 workflow 很容易把 `ExecutionContext` 重新膨胀成一个不可恢复、不可审计的大对象。
- `layout.ts` 与 `filesystem.ts` 分开，是为了把“结构约定”和“文件系统动作”拆开：前者更像跨层契约，后者才是具体 I/O 语义。这样以后即使换持久化实现，也能尽量保住上层对目录职责和 allowlist 的理解。
- redaction 没有直接耦合到 storage 写函数里，而是先作为独立 security 能力暴露，是为了让 checkpoint、report、CLI JSON、artifacts 共享同一套脱敏规则，而不是每个输出口各自维护一份敏感键名单。
- 当前只实现 run 级锁，没有提前实现 target 级全局锁或 reconcile 流程，是刻意遵守任务 3 边界：先把“不会半写、不会并发覆盖、不会明文泄漏”做好，再把“恢复时如何决策”留给任务 4 及之后的 workflow/app 层。

## 任务 4 当前 workflow 状态机层

任务 4 完成后，`src/workflow` 不再只是占位目录，而是开始承载“哪些状态能流转、审批结果如何影响 run、回退时当前有效态如何失效、恢复时何时必须先 reconcile”的统一规则层。这个阶段仍然保持为纯策略与纯函数，不提前承担 run 创建、checkpoint 落盘或 CLI 装配。

## 新增文件职责

### `src/workflow/state-machine.ts`

- 提供任务 4 的 workflow 纯函数状态机入口。
- 固定四类关键规则：阶段状态合法流转、审批决定到 run 状态的映射、`revise` 回退后的当前有效态清理、特殊恢复状态下的下一步动作判定。
- 通过 `APPROVAL_REQUIRED_STAGES`、`SIDE_EFFECT_STAGES` 和按阶段区分的允许后继状态，显式阻止 `Requirement Synthesis` / `Fix Planning` 跳过审批直接完成，也阻止 `Artifact Linking` / `Knowledge Recording` 在未经过 `approved_pending_write` 时直接进入真实写入。
- 通过 `STAGE_OUTPUT_RESETS` 把 `ExecutionContext` 中“属于哪个阶段的当前有效字段”固定下来，确保 `revise` 后读取当前有效态时不会误用 stale 的代码定位、修复计划、GitLab 产物或 Jira/飞书 draft/result 引用。
- 通过 `getRecoveryAction()` 把 `waiting_external_input`、`partial_success`、`outcome_unknown`、未终态副作用账本等条件转成显式恢复策略，为任务 5 的恢复入口路由提供稳定判断依据。

### `src/workflow/index.ts`

- 作为 workflow 层唯一公共导出入口，统一暴露状态机能力。
- 保持后续 app、CLI、测试只依赖 workflow 公共面，而不直接跨文件引用内部实现细节。

### `tests/unit/workflow/state-machine.spec.ts`

- 任务 4 的 workflow 单元测试。
- 先锁定四个最小闭环：合法/非法状态流转、审批与 run 状态映射、`revise` 的 stale/superseded 生效范围、恢复阶段的等待/对账/人工复核判定。
- 通过红绿测试确认 workflow API 缺失时会准确失败，避免把“测试从一开始就绿”误判成契约已被覆盖。

## 任务 4 架构洞察

- 任务 4 的关键不是先把完整工作流跑起来，而是先把“哪些状态可以变、哪些状态不能越级跳过”写成纯策略层。这样任务 5 再接入 run 创建、checkpoint 和恢复入口时，应用层只需要调用规则，不需要重新发明语义。
- `applyApprovalDecision()` 与 `applyRevisionRollback()` 分开，是为了把“审批如何改变当前 run”与“回退如何清理当前有效态”拆开。审批是瞬时决策，回退是对当前有效版本的批量失效；如果两者揉在一起，后续很容易把审批记录、阶段状态和 artifact 生命周期混写。
- `applyRevisionRollback()` 只清理当前有效态，不删除历史 artifacts 或历史审批，是为了保持“历史事实保留、当前有效态收敛”这条主线。真正的历史落盘、checkpoint 与 superseded 审批写入仍应由后续 storage/app 层承担。
- `getRecoveryAction()` 先返回策略结论而不是直接做 reconcile/重试，是刻意保持 workflow 规则层与副作用执行层解耦。这样任务 5 可以在 app 层根据同一判断结果决定是继续等待、进入 reconcile 入口，还是提示人工复核，而不用把 I/O 逻辑反塞回 workflow。
