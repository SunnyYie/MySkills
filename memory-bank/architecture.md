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

## 任务 5 当前 app 装配层

任务 5 完成后，`src/app` 不再只是 CLI 的空壳入口，而是开始承担“命令应该落到哪个 use case、run 如何被初始化、恢复入口如何路由、错误如何统一折叠为 CLI 结果”的应用装配职责。这个阶段仍然不实现具体业务阶段执行器，也不抢走 workflow 的状态 owner 身份。

## 新增文件职责

### `src/app/use-cases.ts`

- 固定 CLI 命令组到 app use case 的最小映射边界：`bind`、`inspect`、`run`、`record`。
- 让 CLI 后续只需要关心“我要调哪个 app 入口”，而不需要理解 workflow 状态机、storage 路径或错误映射细节。
- 把命令组与 use case id 收敛为显式常量，减少后续任务 15 实现 CLI 子命令时出现一边写字符串、一边绕过 app 层的风险。

### `src/app/run-lifecycle.ts`

- 提供任务 5 的核心应用装配能力：`initializeRun()`、`restoreRun()`、`mapErrorToCliFailure()`。
- `initializeRun()` 负责组装初始 `ExecutionContext`、生成 `run_id`、创建 run 目录、获取初始锁、写入 `context.json` 与首个 checkpoint，确保新 run 一创建就具备可恢复基础。
- `restoreRun()` 负责读取最新上下文、选择最近或指定 checkpoint、调用 workflow 的 `getRecoveryAction()` 判定恢复入口，并在需要时注入 active error / latest side effect 状态做 reconcile-first 路由。
- `mapErrorToCliFailure()` 把 `StructuredError`、run 锁冲突和恢复缺口统一折叠为 CLI 可消费的退出码、摘要和下一步建议动作，避免错误口径散落在 CLI、workflow 和 storage 之间。
- 文件中同时保留 `RunStateNotFoundError`、`CheckpointNotFoundError` 等 app 层错误，以表达“这是运行态装配失败”，而不是 workflow 规则错误。

### `src/app/index.ts`

- 作为 app 层唯一公共导出入口，统一暴露 bootstrap、use case 边界和 run 生命周期能力。
- 保持后续 CLI 与测试只依赖 `src/app` 公共面，而不需要跨文件引用内部细节。

### `tests/unit/app/run-lifecycle.spec.ts`

- 任务 5 的 app 单元测试。
- 先锁定四个最小闭环：命令组到 use case 映射、run 初始化产物、恢复入口路由、错误到退出码映射。
- 通过红绿测试验证 app 层确实是新加出来的装配面，而不是对已有行为做“绿灯式补测”。

## 任务 5 架构洞察

- 任务 5 的关键不是让 CLI 立刻跑完整主流程，而是先把“CLI 与 workflow 中间那层”补出来。没有 app 层，命令注册、锁管理、恢复路由和错误映射会自然散落到 CLI 命令处理器里，后续越做越难收口。
- `use-cases.ts` 与 `run-lifecycle.ts` 分开，是为了把“命令边界”与“运行态装配”拆开。前者是静态映射契约，后者是有 I/O、有状态文件读写和恢复判定的用例逻辑；分开后任务 15 做命令面时更容易保持 CLI 只做参数适配。
- `restoreRun()` 没有直接把 reconcile、阶段执行或审批恢复做掉，而是只输出恢复策略结论。这延续了任务 4 的边界：workflow 定义规则，app 负责路由和装配，真正执行哪个阶段仍留给后续任务。
- 错误映射集中在 app 层而不是 CLI 层，是因为 app 更接近 domain/storage/workflow 三方交汇处，能在不泄漏底层细节的前提下统一用户可见结果；这样以后 CLI 的 TTY/JSON 两种输出模式可以共享同一份失败语义。

## 任务 6 当前配置加载与 CLI 绑定层

任务 6 完成后，项目画像不再只是 domain schema 里的静态定义，而是开始拥有“如何从本地读取、如何判断是否可运行、如何逐段补录、如何通过 CLI 只读体检暴露给用户”的最小实现。这个阶段仍然不进入 Jira intake 或真实 connector 调用，只把配置链路打通。

## 新增文件职责

### `src/skills/config-loader/index.ts`

- 提供任务 6 的配置技能入口，负责读取项目隔离的 profile 草稿、统一字符串 trim、检查最小字段完整性、`config_version` 格式和显式引用合法性。
- 在配置完整时输出排序稳定的标准化 `ProjectProfile`，确保后续 `jira-intake`、`project-context` 等技能消费到的是确定性顺序的规则集合，而不是“同样内容但数组顺序漂移”的对象。
- 提供 `inspectStoredProjectProfile()` 与 `loadProjectProfile()` 两个层次的接口：前者允许 `inspect` 面向不完整草稿输出缺失项，后者只在配置完整时向后续主流程暴露可信配置。
- 提供 `upsertProjectProfileSection()`，把 `bind project|jira|requirements|gitlab|feishu|repo` 的逐段写入统一收敛到技能层，而不是让 CLI 或 app 自己拼路径、自己 merge JSON。
- 通过 `ProjectProfileValidationError` 保留一份结构化检查结果，让上层可以区分“文件不存在 / 配置不完整 / 字段值非法”而不是只得到一个模糊异常字符串。

### `src/app/project-profile.ts`

- 作为任务 6 中 `bind` / `inspect` 的 app 装配入口。
- `bindProjectProfileSectionFromFile()` 负责读取命令传入的 JSON 文件、调用 `config-loader` 写入对应 section，并把检查结果整理成 CLI 可直接消费的输出对象。
- `inspectProjectConfig()`、`inspectProjectGraph()`、`inspectProjectConnectors()` 负责把同一份配置草稿转换成三类只读视图：完整性检查、关系预览和接入体检。
- 在 repo 体检里只检查本地路径是否可访问，而不越界执行 git 或远端 connector 动作，继续保持任务 6 的“配置层”边界。

### `src/cli/bind/register.ts`

- 注册 `bind` 命令组下的六个子命令：`project`、`jira`、`requirements`、`gitlab`、`feishu`、`repo`。
- 统一要求 `--project <id>` 与 `--file <path>`，把“显式维护绑定信息”这条需求落实为文件驱动的配置写入，而不是在 CLI 中混入运行态逻辑。
- 通过 `--json` 支持后续非交互模式，也让当前集成测试可以稳定断言输出。

### `src/cli/inspect/register.ts`

- 注册 `inspect config|graph|connectors` 三个任务 6 所需的最小子命令。
- 保持所有 inspect 子命令只做只读检查，不写 run 状态、不刷新 preview、不补录外部信息。
- 把输出形态保持成稳定结构对象，便于后续任务 15 再叠加 TTY 渲染，而不是现在就把人类可读文本和业务判断耦合死。

### `src/cli/program.ts`

- 从“只有程序名和帮助信息”的骨架，升级为任务 6 的最小命令注册中心。
- 新增 `CliRuntimeOptions` 和可注入的 `io` / `env`，把 CLI 输出和 home 目录选择从 `process.*` 直接读取中抽离出来，方便测试与后续非交互模式扩展。
- 通过 `BUGFIX_ORCHESTRATOR_HOME` 环境覆盖，把任务 6 的集成测试隔离到临时 home 目录，避免污染真实配置目录。

### `src/app/bootstrap.ts`

- 继续作为 CLI 装配入口，但现在支持把 runtime 选项透传给 `createProgram()`。
- 保持 `src/cli/bin.ts` 仍只关心“启动 CLI”，而不需要知道测试注入、home 覆盖或命令注册细节。

### `src/app/index.ts`

- 继续作为 app 层公共导出面，并新增导出项目画像相关 use case。
- 让 CLI 和测试都通过 app 公共面消费任务 6 能力，避免后续直接跨目录访问 `src/skills/config-loader` 内部实现。

### `src/skills/index.ts`

- 不再只是空锚点，开始把 `config-loader` 暴露为 skills 层的一部分。
- 保持未来 skills 扩展时仍有统一出口，而不是每个技能各自散落导入路径。

### `tests/unit/config/config-loader.spec.ts`

- 任务 6 的 config-loader 单元测试。
- 锁定四类最小契约：完整配置的标准化、缺失字段提示、非法版本拦截、非法引用与 repo 路径拒绝。
- 这组测试的重点是保证“进入主流程之前就能发现配置问题”，而不是覆盖 CLI 行为。

### `tests/integration/cli/config-commands.spec.ts`

- 任务 6 的 CLI 集成测试。
- 验证 `bind` 只写项目画像、不创建 run 目录；`inspect` 只读输出、不回写配置；`graph` / `connectors` 的返回结构能被稳定消费。
- 通过注入临时 home 目录覆盖真实配置路径，保证测试能真实经过 CLI -> app -> skills -> storage 的链路，而不会污染开发机状态。

## 任务 6 架构洞察

- 任务 6 最关键的收敛点，是把“项目画像可以不完整地被维护”与“只有完整配置才能进入主流程”分开。`inspectStoredProjectProfile()` 负责前者，`loadProjectProfile()` 负责后者，这样 `bind` 才能支持逐段补录，而 `run` 未来仍能拿到唯一可信配置来源。
- `config-loader` 放在 `src/skills` 而不是 `src/app`，是因为“校验并标准化配置对象”本质上是一个可复用、无业务副作用的能力；app 只负责把这个能力接到 CLI 用例上。这样后续别的入口如果要消费配置，也能直接复用技能层而不绕回命令面。
- `bind` 没有直接要求一次性写入整份 `ProjectProfile`，而是支持 section 级维护，是为了贴合需求文档里“配置缺失必须支持补录”的节奏；否则用户只能手工编辑完整 JSON，CLI 的绑定价值会被削弱。
- `inspect connectors` 目前只做到“配置就绪”和“本地 repo 路径可访问”两个层次，没有冒进做远端连通性探测，是刻意遵守任务 6 边界。真正的 Jira / GitLab / 飞书接口体检应该留在 connector 层和更后面的任务里。
- 在 `createProgram()` 里引入可注入 `io` / `env`，看起来像测试细节，实际是在为后续任务 15 的 TTY/JSON 双输出、非交互模式和更稳定的 CLI 集成测试提前埋接缝；这能减少以后再回头重拆 `process.stdout` / `process.env` 的成本。

## 任务 7 当前 Intake 与 Context Resolution 层

任务 7 完成后，仓库第一次拥有了 `Intake` 与 `Context Resolution` 的实际结构化输入输出。这个阶段仍然只做“只读解析和语义归一化”，不提前进入真实 Jira 网络访问、代码定位或 brief 渲染。

## 新增文件职责

### `src/domain/enums.ts`

- 在既有 workflow 枚举之外，新增 `STAGE_RESULT_STATUSES`，把 skill 输出状态显式收敛为 `completed`、`waiting`、`failed`。
- 这样后续 workflow 接 skill 结果时，可以明确区分“可继续推进”“等待人工补录”和“硬失败”，而不是靠错误数组是否为空来猜。

### `src/domain/schemas.ts`

- 补齐任务 7 需要的结构化契约：`JiraIssueSnapshotSchema`、`JiraIssueRequirementHintSchema`、`JiraIssueWritebackTargetSchema`、`RequirementCandidateSchema`、`JiraIntakeDataSchema`、`ProjectContextDataSchema`。
- 新增 `createStageResultSchema()` 以及 `JiraIntakeStageResultSchema`、`ProjectContextStageResultSchema`，把技术方案里建议的 `StageResult<T>` 真正落成可校验的公共契约。
- 保持 `RequirementReferenceSchema` 继续作为“resolved / unresolved 必须怎么表达”的唯一来源，避免 `project-context` 自己拼半结构化对象。

### `src/infrastructure/connectors/jira/index.ts`

- 提供 Jira connector 当前阶段的最小只读映射入口 `buildJiraIssueSnapshot()`。
- 负责把原始 issue 记录规整为稳定的 `JiraIssueSnapshot`，显式保留摘要、描述、状态、标签、需求线索和写回目标，而不是让 skill 自己理解 Jira 字段细节。
- 提供 `createJiraPermissionDeniedError()` 与 `createInvalidJiraIssueError()`，先把 Intake 阶段最关键的错误语义固定下来。

### `src/infrastructure/connectors/index.ts`

- 不再是空锚点，开始统一暴露 connector 层的 Jira 读模型映射能力。
- 保持后续 connector 扩展时仍有统一出口。

### `src/infrastructure/repo/workspace.ts`

- 提供 Repo Workspace Adapter 的当前最小实现 `inspectRepoWorkspace()`。
- 负责三件事：校验 `repo.local_path` 是否为可访问的绝对路径、根据 issue 信号解析模块候选、在 repo 不可打开时返回 `repo_resolution_failed`。
- 刻意保持为只读能力，不进入文件搜索、git 元数据读取或代码修改。

### `src/infrastructure/repo/index.ts`

- 统一暴露 repo workspace 能力，让 skill 层只依赖 infrastructure 公共面。

### `src/infrastructure/index.ts`

- 开始把 connectors 与 repo 两类基础设施能力汇总导出。
- 让后续 app / workflow / tests 不需要跨层知道内部子目录结构。

### `src/skills/jira-intake/index.ts`

- 提供 `runJiraIntake()`。
- 只消费 `JiraIssueSnapshot`，输出标准化 `StageResult`，确保 `jira-intake` 遵守“skill 不直接做 I/O”的上位约束。
- 当前只负责“读到了什么、有哪些 requirement hint、有哪些 writeback target”，不提前做 requirement 绑定裁决。

### `src/skills/project-context/index.ts`

- 提供 `resolveProjectContext()`，是任务 7 的核心 skill。
- 负责根据 `ProjectProfile.jira.requirement_link_rules` 的优先级解析 requirement 绑定，根据 repo adapter 输出仓库与模块候选，并把结果折叠为 `completed / waiting / failed` 三类 stage result。
- 手工覆盖入口 `manualRequirementRef` 保留在这里，而不是埋进 workflow，是因为这仍属于“上下文解析结果怎么定”的技能语义。

### `src/skills/index.ts`

- 开始把 `jira-intake` 与 `project-context` 纳入 skills 公共出口。
- 让后续任务引用 skills 时延续统一导出方式。

### `tests/unit/intake/jira-intake.spec.ts`

- 任务 7 的 Jira Intake 单元测试。
- 锁定三件事：Jira 快照字段完整性、skill 只消费快照、权限不足错误语义稳定。

### `tests/unit/intake/project-context.spec.ts`

- 任务 7 的 Project Context 单元测试。
- 覆盖唯一 requirement 命中、多候选等待人工、未命中但允许 `unresolved` 继续、repo 打不开时失败四个最小场景。
- 其中“显式 `module:` 标签优先于自由文本匹配”的断言，防止后续模块候选解析重新退回模糊猜测。

## 任务 7 架构洞察

- 任务 7 最关键的收敛，不是“先连上 Jira”，而是先把 Jira 原始字段和 skill 消费面隔开。`JiraIssueSnapshot` 的引入，让 connector 拥有字段解释权，skill 只关心结构化快照，这能明显降低后续换接入方式或补 reader capability 时的耦合。
- requirement 绑定没有直接从 Jira 原始描述、label 或 custom field 硬编码推断，而是统一通过 `requirement_hints` 进入 skill。这保住了需求文档里“connector 隐藏接入细节、skill 输入输出清晰”的主线，也避免不同 skill 各自实现一套线索提取逻辑。
- `project-context` 输出 `waiting` 而不是把多候选或缺少人工绑定都当成 `failed`，是为了贴合工作流里的“等待人工补录”语义；但 repo 路径打不开仍然是 `failed`，因为它表示项目画像或执行环境本身不可用，两者不应混为一类阻塞。
- 模块候选解析采用“显式信号优先、自由文本兜底、无信号则保留 repo 级上下文”的策略，是为了在不静默猜测唯一模块的前提下，仍给后续 `Code Localization` 提供一个可继续收敛的起点。
- 把 `StageResult` 先落到 domain 契约里，而不是只在任务 7 本地声明类型，能让后续 `Requirement Synthesis`、`Code Localization`、`Fix Planning` 复用同一种完成/等待/失败表达，减少每个 skill 各自发明返回结构的风险。

## 任务 8 当前 Requirement Synthesis 与 brief 渲染层

任务 8 完成后，仓库第一次拥有了可审批、可导出、可作为后续阶段输入依据的 `Requirement Brief`。这一层仍然只做“基于已解析上下文生成结构化 brief，并渲染成 CLI / Markdown 输出”，没有提前接入 artifact 持久化、审批记录写入或任务 9 的代码定位。

## 新增文件职责

### `src/domain/schemas.ts`

- 在既有 `JiraIntakeStageResultSchema`、`ProjectContextStageResultSchema` 之后，新增 `RequirementSynthesisStageResultSchema` 与对应类型导出。
- 让 `Requirement Synthesis` 继续复用统一 `StageResult<T>` 契约，而不是把 brief 生成结果放成特例对象。
- 这样后续 workflow 接入 `Requirement Synthesis` 时，可以沿用前两阶段相同的 `completed / waiting / failed` 语义与 `source_refs`/`generated_at` 字段，不需要单独写一套适配。

### `src/skills/requirement-summarizer/index.ts`

- 提供任务 8 的核心技能 `synthesizeRequirementBrief()`。
- 只消费 `ProjectProfile`、`JiraIssueSnapshot` 与 `ProjectContextData` 三类已结构化输入，继续遵守“skill 不直接做 I/O”的边界。
- 负责把 issue 摘要、仓库/模块上下文、requirement 绑定状态、需求来源和 GitLab 目标整理成 `known_context`，并输出稳定的 `fix_goal`、`pending_questions` 和 `source_refs`。
- 对 unresolved requirement 明确保留 `binding_reason`，并在项目策略要求最终绑定时输出 warning，而不是把约束藏在后续阶段里。

### `src/skills/index.ts`

- 继续作为 skills 层统一出口，并新增 `requirement-summarizer` 导出。
- 保持后续 workflow、CLI 或测试引用 skills 时，仍能沿用统一导入面，而不是开始出现分散的深路径导入。

### `src/renderers/requirement-brief.ts`

- 提供 `renderRequirementBriefCli()` 与 `renderRequirementBriefMarkdown()`。
- 统一承担 brief 展示逻辑，把“怎么给人看”从 skill 的业务推理里拆出来，符合技术方案里 renderer 独立负责展示的边界。
- 两个 renderer 都依赖同一个 `RequirementBriefSchema` 做输入校验，减少“CLI 能显示但 Markdown 导出丢字段”的漂移风险。
- CLI 版本面向终端阅读，Markdown 版本面向 artifact 导出，但两者都覆盖同一组业务字段：issue、project、关联需求、binding status、已知上下文、修复目标、待确认事项和 source refs。

### `src/renderers/index.ts`

- 不再是空导出，开始承担 renderer 公共出口职责。
- 让后续 brief 导出、Bugfix Report 导出和 CLI 输出都可以通过同一公共面接入 renderer，而不需要知道具体文件布局。

### `tests/unit/requirement-brief/requirement-brief.spec.ts`

- 任务 8 的 Requirement Brief 单元测试。
- 锁定三件事：resolved brief 的稳定生成、unresolved brief 的显示与待确认问题、CLI / Markdown 双渲染的业务信息一致性。
- 通过先红后绿的方式证明这组测试覆盖的是新增能力，而不是对现有行为做“补一层绿灯”。

## 任务 8 架构洞察

- 任务 8 最重要的收敛，不是把 brief 渲染得多漂亮，而是先让 `Requirement Brief` 成为一个独立、稳定、可复用的中间产物。后续 `Code Localization`、`Fix Planning` 和报告导出，都应该读取这个中间层，而不是重新回头拼 issue 摘要和 requirement 状态。
- `RequirementBrief` 的结构与 renderer 被刻意拆开，是为了保持“业务事实”和“展示形式”分离。这样以后即使 CLI、Markdown、JSON 三种展示方式继续扩展，也不会逼着 `requirement-summarizer` 了解终端格式或文档模板。
- unresolved requirement 没有在任务 8 被当成失败直接拒绝，而是生成可继续流转的 brief，并把风险留在显式 warning 与 pending question 中。这与需求文档里“允许继续生成 brief，但必须保留 `binding_reason`”的策略一致，也避免把“需要人工补录”与“系统硬失败”混成一类。
- `source_refs` 当前先作为逻辑引用面固定下来，而没有马上写成真实 artifact record，是一种刻意分层：任务 8 先证明 brief 本身可被引用，后续 workflow / storage 再决定它何时落盘、如何绑定审批和 checkpoint。
- `fix_goal` 与 `known_context` 采用稳定模板式生成，而不是自由摘要，是为了把这个阶段维持在“结构化归纳”而非“开放式写作”。这能减少文案漂移，也让后续测试更容易锁定行为。

## 任务 9 当前 Code Localization 层

任务 9 完成后，仓库第一次拥有了“从已确认 brief 继续收敛到代码候选”的最小只读链路。这个阶段仍然只负责搜索和表达，不承担 fix plan 生成、artifact 真实落盘或 workflow 接线。

## 新增文件职责

### `src/domain/schemas.ts`

- 在既有 `RequirementSynthesisStageResultSchema` 之后，新增 `CodeLocalizationDataSchema` 与 `CodeLocalizationStageResultSchema`。
- 把任务 9 的输出面固定为三块：`impact_modules`、`code_targets`、`root_cause_hypotheses`。
- 继续复用统一 `StageResult<T>`，让 `Code Localization` 和前面阶段一样具备一致的 `status / summary / warnings / errors / source_refs / generated_at` 结构，而不是在 skill 里临时拼特例对象。

### `src/infrastructure/repo/workspace.ts`

- 继续承接 Repo Workspace Adapter 的只读职责，并在任务 9 中补上“代码搜索”这一块，而不是把文件系统遍历写进 skill。
- `extractSearchRoot()` 把 `repo.module_rules` 的 `path_pattern` 收敛为实际搜索根目录，先把“模块规则怎么映射到磁盘目录”固定下来。
- `searchRepoWorkspace()` 负责递归读取候选目录、把命中文件归一化为相对仓库路径、按 issue / brief 词项命中数排序，并保留 `module_id` 与匹配原因，供上层 skill 决定是完成、等待还是提示人工收敛。
- 该文件仍然保持只读，不写 run 状态、不做 checkpoint，也不生成修复建议，符合技术方案里“Repo Workspace Adapter 只提供读能力”的边界。

### `src/infrastructure/repo/index.ts`

- 继续作为 repo 基础设施的公共出口。
- 因为 `searchRepoWorkspace()` 也落在 `workspace.ts` 内，这个公共出口可以让上层 skill 继续只依赖 repo 模块公共面，而不是深引用内部实现文件。

### `src/skills/code-locator/index.ts`

- 提供任务 9 的核心 skill `locateCodeTargets()`。
- 只消费 `ProjectProfile`、`JiraIssueSnapshot`、`ProjectContextData`、`RequirementBrief` 四类已结构化输入，延续“skill 不直接做 I/O”的设计。
- 负责把 repo 搜索结果折叠成三类稳定输出：
  - 唯一命中时 `completed`
  - 无结果时 `waiting` + `manual_code_localization`
  - 多候选时 `waiting` + `manual_code_target_selection`
- 同时负责把影响模块和根因假设保持在可被后续 `fix-planner` 直接消费的最小表达，而不是把搜索细节原样泄漏到下游。

### `src/skills/index.ts`

- 继续承担 skills 统一出口职责，并新增 `code-locator` 导出。
- 这能保证后续 workflow 或 CLI 接入任务 9 时，仍通过统一技能入口装配，而不是开始出现“有些 skill 走公共出口，有些 skill 走深路径”的分裂。

### `tests/unit/code-locator/code-locator.spec.ts`

- 任务 9 的 Code Localization 单元测试。
- 锁定三类最小场景：唯一命中、无结果、多候选。
- 同时验证三件容易漂移的细节：路径必须归一化为相对仓库路径、影响模块必须显式输出、根因假设必须稳定存在于定位结果里。
- 这组测试也保住了“等待人工判断”和“真正失败”之间的语义边界，避免后续把无结果误做成已定位成功，或者把多候选误当成系统错误。

## 任务 9 架构洞察

- 任务 9 最重要的分层收敛，是把“读仓库和找文件”继续留在 infrastructure，把“如何解释这些候选并形成阶段结果”留在 skill。这样以后即使搜索策略变复杂，`code-locator` 仍然只关心结构化候选，而不用自己处理磁盘遍历和路径规范化。
- `Requirement Brief` 在这一阶段真正开始发挥“下游稳定输入”的作用。`code-locator` 读取 brief，而不是重新直接从 Jira 文本临时总结，是为了延续任务 8 建立的中间产物价值，并减少不同阶段各自做摘要导致的漂移。
- 任务 9 没有把“无结果”和“多候选”都粗暴归类为失败，而是显式进入 `waiting`。这是为了贴合实施计划里“workflow 能区分可继续分析和需人工判断的结果”的要求，也给任务 10 留下清晰边界：只有当代码定位足够收敛时，修复计划才应该继续自动生成。
- `impact_modules` 没有被直接塞回 `ExecutionContext` 新字段，而是先作为 `CodeLocalizationData` 输出面固定。这是有意控制范围：技术方案已经要求运行态至少保留 `repo_selection`、`code_targets`、`root_cause_hypotheses`，因此本轮把“影响模块”维持为阶段产物，避免在任务 9 提前扩张运行态。
- 搜索策略目前刻意保持为“模块规则缩窄目录 + 稳定词项命中排序”的最小实现，没有提前引入 AST、语义索引或 Git 历史。这让任务 9 先解决“结构和边界”的问题，而把更重的定位智能留给后续明确授权的迭代。

## 任务 10 当前 Fix Planning 层

任务 10 完成后，仓库第一次拥有了“从已定位代码候选继续收敛到审批前修复计划”的稳定中间层。这个阶段仍然不自动改代码，也不接入外部补录，只负责把上游定位结果转成可审批、可追溯、可交接给 `Execution` 的结构化计划。

## 新增文件职责

### `src/domain/schemas.ts`

- 在既有 `CodeLocalizationDataSchema` 之后，新增 `FixPlanningDataSchema` 与 `FixPlanningStageResultSchema`。
- 把任务 10 的输出面固定为七块：`fix_summary`、`impact_scope`、`verification_plan`、`open_risks`、`pending_external_inputs`、`referenced_code_targets`、`referenced_root_cause_hypotheses`。
- 这里最关键的不是“字段多”，而是把“Execution 之后还需要什么外部输入”与“当前计划基于哪些定位依据生成”直接写进契约，避免下游再用临时字符串拼接。

### `src/skills/fix-planner/index.ts`

- 提供任务 10 的核心 skill `createFixPlan()`。
- 只消费已经结构化的 `ProjectProfile`、`JiraIssueSnapshot`、`ProjectContextData`、`RequirementBrief` 和 `CodeLocalizationStageResult`，继续遵守 “skill 不直接做 I/O” 的边界。
- 当 `Code Localization` 仍处于 `waiting` 时，返回 `waiting` 的 `Fix Planning` 结果，并透传 `waiting_for` 语义，明确阻止“定位还没收敛就先编一个修复计划”。
- 当定位已完成时，负责把代码候选、影响模块、brief 中的待确认问题和 requirement 绑定风险收敛成审批前 plan，同时补出 `Execution` 阶段必需的 `pending_external_inputs`。

### `src/skills/index.ts`

- 继续承担 skills 统一出口职责，并在任务 10 中新增 `fix-planner` 导出。
- 这保持了 skills 层公共面的一致性，也避免后续 workflow / CLI 接入时出现“新 skill 只能深路径导入”的分叉。

### `tests/unit/fix-planner/fix-planner.spec.ts`

- 任务 10 的 Fix Planning 单元测试。
- 锁定两个核心分支：定位已收敛时输出 `completed` 的审批前计划，定位未收敛时输出 `waiting` 而不是伪造计划。
- 同时验证三类容易漂移的细节：计划必须引用 `code_targets` / `root_cause_hypotheses`，必须带 `pending_external_inputs`，必须把开放风险留在显式字段里而不是藏在 summary 文本中。

### `tests/unit/domain/contracts.spec.ts`

- 在既有 domain 契约测试中补上 `FixPlanning` 的 schema 回归。
- 作用不是重复测业务逻辑，而是锁定任务 10 的字段面，防止后续把 `open_risks`、`pending_external_inputs` 或定位引用关系悄悄删回“自由文本说明”。

### `tests/unit/workflow/state-machine.spec.ts`

- 这次补了一条任务 10 相关的 workflow 回归用例。
- 它明确验证两件事：`Fix Planning` 仍然必须走 `output_ready -> waiting_approval` 审批门；当用户选择 `revise` 回退到 `Fix Planning` 时，当前有效的 `fix_plan` / `verification_plan` 与活跃 artifact / approval 引用都会被清空。
- 这条测试没有新增 workflow 能力，而是把任务 4 已经建立的状态机语义显式绑定到任务 10，防止后续实现 `Execution` 时误把 fix plan 当成永不失效的静态结果。

## 任务 10 架构洞察

- 任务 10 最重要的收敛，是把“代码定位结果”升级为“审批前的行动建议”，但仍保持它是一个中间产物，而不是直接触发自动执行。这样既符合需求文档里 v1 不自动改代码的边界，也为任务 11 的外部补录留出了清晰接口。
- `FixPlanningData` 里显式保留 `referenced_code_targets` 与 `referenced_root_cause_hypotheses`，是为了避免计划变成脱离上下文的孤立文案。审批人应该能看见“这个方案到底建立在哪些定位依据上”，后续报告和回退也需要这个追溯链。
- `pending_external_inputs` 被放进 fix plan，而不是等到 `Execution` 才临时推导，是为了让审批阶段就能看见“批准后还需要补什么”。这让 `Fix Planning` 和 `Execution` 之间的交接字段稳定下来，减少任务 11 再次扩张 plan 结构的压力。
- `Fix Planning` 在定位未收敛时返回 `waiting`，而不是生成低可信度建议，是任务 9 与任务 10 之间最关键的接口纪律。只有当 `Code Localization` 已经给出足够收敛的代码目标时，修复计划才应该进入审批门。
- 这轮没有改 `ExecutionContext` 的物理写入与 artifact 绑定方式，而只先冻结 `StageResult` 输出面，是一种刻意的小步推进：先把“计划应该长什么样”固定，再让后续 workflow / storage 决定“它何时落盘、如何进入当前有效态”。

## 任务 11 当前 Execution 外部输入层

任务 11 完成后，仓库第一次把 `Execution` 从“只是计划里的占位阶段”落成了可恢复、可等待、可接收外部补录的最小闭环。这个阶段仍然不自动改代码，也不生成 Jira / 飞书 preview，只负责等待外部修复结果、把验证结果与 GitLab 产物标准化，并保护当前有效态不被冲突补录污染。

## 新增文件职责

### `src/domain/enums.ts`

- 在既有 stage / run / artifact 枚举之外，新增 `VERIFICATION_OUTCOMES`、`VERIFICATION_CHECK_STATUSES`、`VERIFICATION_INPUT_SOURCES`。
- 这些枚举把“验证结果如何被表达”先固定到 domain 层，避免 workflow、skill、report 各自用自由文本表达 passed / failed / mixed 语义。

### `src/domain/schemas.ts`

- 在既有 `GitLabArtifactSchema` 之后，新增 `VerificationCheckSchema`、`VerificationResultSchema`、`VerificationRecordingStageResultSchema`。
- `VerificationResultSchema` 只保留当前有效态真正需要消费的字段：`outcome`、`verification_summary`、`checks`、`input_source`、`recorded_at`。
- 同时补出 `GitLabArtifact` type export，让 workflow 与 skill 可以共享同一份标准化产物类型，而不是自己再写平行接口。

### `src/skills/verification-recorder/index.ts`

- 提供任务 11 的验证结果标准化 skill `recordVerificationResult()`。
- 它只消费外部补录后的结构化 checks，不做任何 I/O，也不写 workflow 状态。
- 该文件的关键职责不是“保存原始测试报告”，而是把外部验证证据折叠成后续 `ExecutionContext`、报告和写回链路都能消费的稳定摘要。

### `src/skills/gitlab-linker/index.ts`

- 提供任务 11 需要的 GitLab 产物标准化入口 `normalizeGitLabArtifacts()`。
- 目前只承接 commit / branch / MR 三类引用的裁剪、默认字段补齐与 schema 校验，不提前承担 Jira draft 生成。
- 这让任务 11 先解决“外部补录的产物能不能被统一接住”，而把任务 12 再需要的 preview 组装留在后续链路。

### `src/skills/index.ts`

- 继续承担 skills 统一出口职责，并在任务 11 中新增 `verification-recorder` 与 `gitlab-linker` 导出。
- 这样后续 workflow / app 接入 Execution 外部输入能力时，仍然可以通过统一 skills 入口装配，不会在任务 11 开始出现深路径分叉。

### `src/workflow/execution.ts`

- 提供任务 11 的 Execution 纯规则层：`getExecutionExternalInputState()` 与 `recordExecutionExternalInputs()`。
- `getExecutionExternalInputState()` 把“缺 GitLab 产物”“缺验证结果”“两者都缺”的场景统一折叠为 `waiting_external_input` 判定和明确 `waitingReason`。
- `recordExecutionExternalInputs()` 负责把已标准化的外部输入并回当前有效态，同时处理三类关键规则：
  - 首次补录后若仍缺另一类输入，则继续等待
  - 重复补录相同 GitLab 产物时去重，不重复污染当前态
  - 冲突补录时返回 `state_conflict`，并保持原上下文不变

### `src/workflow/index.ts`

- 继续承担 workflow 公共出口职责，并把 Execution 外部输入规则公开给后续 app / CLI 层。
- 这保持了 workflow 层“只暴露公共面，不让调用方深引内部文件”的纪律。

### `tests/unit/verification-recorder/verification-recorder.spec.ts`

- 任务 11 的验证结果标准化单元测试。
- 锁定 `verification_summary` 的摘要规则、`input_source` / `recorded_at` 的保留，以及 `source_refs` 的透传。

### `tests/unit/gitlab-linker/gitlab-linker.spec.ts`

- 任务 11 的 GitLab 产物标准化单元测试。
- 锁定 commit / branch / MR 三类输入的默认字段补齐、字符串裁剪与非法缺字段拒绝。

### `tests/unit/execution/execution.spec.ts`

- 任务 11 的 Execution 工作流规则单元测试。
- 锁定等待外部输入三类场景、首次补录 / 重复补录合并，以及冲突补录拒绝后不破坏当前有效态。

### `tests/unit/domain/contracts.spec.ts`

- 在既有 domain 契约测试中补上验证结果标准化契约。
- 作用仍然是锁定字段面，防止后续把 `verification_summary`、`input_source` 或 `recorded_at` 再次退化成调用方各自拼接的弱约束对象。

## 任务 11 架构洞察

- 任务 11 最重要的边界收敛，是把 `Execution` 定义成“等待和吸收外部结果的阶段”，而不是“自动改代码的阶段”。这样当前状态机已经能承接外部 coding agent 或人工修复结果，但不会在 v1 提前做出自动执行承诺。
- 验证结果没有直接塞进 `ExecutionContext` 大对象，而是继续通过 `verification_results_ref` 挂接，是在延续任务 2/3 形成的物理边界纪律：当前有效态只保留摘要和 ref，长文本和原始正文留在 artifacts。
- GitLab 产物标准化放在 skill 层、等待语义和合并保护放在 workflow 层，是这轮最关键的 owner 划分。前者解决“输入长什么样”，后者解决“当前 run 怎么吸收它”；两者拆开后，任务 12 再去生成 Jira preview 时就不需要重新定义 artifact 契约。
- 冲突补录不是直接覆盖当前有效态，而是返回 `state_conflict` 并保持原上下文不变，这是为了符合需求文档里“失败后保留现场”和技术方案里“workflow 是唯一状态 owner”的原则。否则 `Execution` 会变成一个可以悄悄篡改有效产物的薄弱点。
- 这轮故意没有把 `Execution` 接到真实 checkpoint 写入、CLI `record` 命令或 Jira/飞书链路，是刻意遵守实施计划的小步推进：先把等待语义和标准化契约固定，再让后续任务把这些结果接到 preview / execute 链路中。

## 任务 12 当前 Jira preview 与写回规则层

任务 12 完成后，仓库第一次拥有了 `Artifact Linking` 阶段的 Jira 写回最小闭环：能从 canonical 输入生成可审批 preview，能把审批绑定到不可变 preview hash，能在真实写入前执行 requirement binding 强约束检查，并且能以 `prepared -> dispatched -> terminal` 的固定顺序表达 Jira 副作用账本。这个阶段仍然保持为“connector 纯映射 + workflow 纯规则”，不提前接入真实网络 I/O、持久化和 CLI 命令面。

## 新增文件职责

### `src/domain/schemas.ts`

- 在既有 Jira draft/result 契约上补齐任务 12 所需字段，而不是另起一套平行对象。
- `JiraWritebackDraftSchema` 现在显式承载 `target_ref`、`request_payload_hash`、`dedupe_scope`、`expected_target_version`，让 preview 不只是“给人看”的文案，也能稳定衔接 execute 输入和 ledger 记录。
- `JiraWritebackResultSchema` 现在显式承载 `already_applied` 与 `external_request_id`，为幂等去重、恢复对账和“不要重复写”的判断提供统一输出面。
- 同时补出 `RequirementReference`、`JiraWritebackDraft`、`JiraWritebackResult` 的 type export，避免 connector 与 workflow 再各自复制一份弱约束接口。

### `src/infrastructure/connectors/jira/index.ts`

- 在既有 Jira intake 只读映射之上，新增任务 12 的 Jira 写回纯映射能力。
- `buildJiraWritebackPreviewDraft()` 负责把 issue、target、GitLab 产物、verification ref 和 requirement refs 收敛成统一 draft：生成 `rendered_preview`、脱敏 `request_payload`、`request_payload_hash`、`idempotency_key`、`dedupe_scope` 和稳定 `target_ref`。
- comment 写回默认注入稳定 marker；field 写回沿用相同的 dedupe / hash 协议，但不伪装成 comment 专用语义。
- `createJiraExecuteResult()` 与 `createJiraAlreadyAppliedResult()` 把正常执行结果与“查重发现已写入”的结果都折叠为统一 `JiraWritebackResult`，让 workflow 不需要理解 Jira 响应细节。

### `src/workflow/jira-writeback.ts`

- 提供任务 12 的 Jira writeback 纯规则层，是本轮最核心的新文件。
- `createJiraWritebackPreviewState()` 负责刷新当前有效 preview：更新 `jira_writeback_draft_ref`、重算 `previewHash`、把 `Artifact Linking` 拉到 `output_ready`，并使旧的活跃审批失效。
- `buildJiraWritebackApprovalRecord()` 把审批记录固定绑定到 `preview_ref + preview_hash`，体现“审批的是哪一个 preview 版本”。
- `guardJiraWritebackRequirementBinding()` 把 requirement binding 强约束阻塞点明确放在真实 Jira execute 之前，而不是提前污染分析阶段。
- `buildJiraWritebackPreparedEntry()`、`markJiraWritebackEntryDispatched()`、`finalizeJiraWritebackEntry()` 把 Jira 副作用账本顺序写成显式规则，避免调用方随手跳过 `prepared` 或倒置顺序。
- `shouldSkipJiraWritebackExecution()` 把 dry-run 和已终态/已对账写入的去重规则收敛为统一判定，防止恢复和重复执行时盲目重发。

### `src/workflow/index.ts`

- 在既有 state machine 与 execution 外部输入规则之外，新增对 `jira-writeback.ts` 的公共导出。
- 保持 workflow 层统一公共面，不让 app、CLI 或测试开始深引内部文件。

### `tests/unit/jira-writeback/jira-writeback.spec.ts`

- 任务 12 的核心单元测试。
- 锁定六个最小闭环：preview draft 生成、requirement binding 强约束阻塞、preview 刷新与旧审批失效、approval preview 绑定、ledger 顺序、dry-run 与已写入去重边界。
- 这组测试让任务 12 的行为有了独立落点，而不是把 Jira 写回规则零散塞进已有 workflow / domain 回归里。

### `tests/unit/domain/contracts.spec.ts`

- 在既有 domain 契约测试中补上 Jira writeback draft/result 的字段回归。
- 它的职责不是复测业务逻辑，而是防止后续把 `target_ref`、`request_payload_hash`、`dedupe_scope`、`already_applied` 这些恢复与幂等关键字段悄悄删回“调用方自己算”的状态。

## 任务 12 架构洞察

- 任务 12 最关键的 owner 收敛，是把“怎么把 canonical 输入翻成 Jira preview / result”继续留在 connector，把“什么时候能写、审批绑定哪个 preview、ledger 应该按什么顺序演进”留在 workflow。这样任务 13 做 Feishu 时可以对称复用思路，而不会把 Jira 的外部系统细节反灌回 workflow。
- preview 在这一步已经不只是展示文本，而是一个 execute 前的稳定中间产物：`rendered_preview` 给人审，`request_payload_hash` / `idempotency_key` / `dedupe_scope` 给机器去重和恢复。这能把“预览”“审批”“副作用账本”三条链真正绑到同一个对象上。
- requirement binding 强约束检查被刻意放在 Jira execute 前，而不是前移到 `Requirement Synthesis` 或 `Execution`。这样既遵守需求文档里“允许分析继续推进”的策略，也确保强约束项目不会把 unresolved requirement 带进真实外部写回。
- `already_applied` 被做成 `JiraWritebackResult` 的一等字段，而不是只靠调用方读日志猜测，是为了把“查重命中后不应重复写”表达成标准结果，而不是隐含分支。
- 这轮仍然没有接真实 connector execute、ledger 落盘和 checkpoint 写入，是刻意保持小步闭环：先把 preview / approval / dedupe / ledger 语义冻结下来，后续再把这些纯规则接到 storage 与 CLI，用更少的返工完成真实写回链路。
