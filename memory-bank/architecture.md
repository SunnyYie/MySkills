# Bugfix Orchestrator v1 Architecture Notes

本文档作为实施计划前八项任务的持续产物，负责把 v1 的范围边界、分层职责、核心对象、状态语义、持久化/审计/安全底座、Infrastructure 只读契约、Skill 层契约、主工作流状态机基线、写入 preview / 审批 / 执行链路约束、CLI / 子工作流契约以及最终交付收口约束冻结成一份便于实现与审查的架构基线。其内容以 [需求文档](/Users/sunyi/ai/MySkills/memory-bank/需求文档.md)、[技术方案](/Users/sunyi/ai/MySkills/memory-bank/技术方案.md) 与 [实施计划](/Users/sunyi/ai/MySkills/memory-bank/实施计划.md) 为准，不单独扩展 v1 范围。

## 1. 任务一冻结结果

### 1.1 v1 范围与非范围基线

v1 必交付能力以需求文档的“最小闭环定义”和技术方案的“v1 覆盖范围”为共同基线，实施时只允许收敛，不允许私自扩展。

| 必须交付 | 说明 |
| --- | --- |
| Jira bug intake | 从 Jira issue 拉取 bug 基础信息、状态、描述与关联线索。 |
| 项目与上下文解析 | 解析项目、需求、仓库和模块上下文，支撑后续阶段。 |
| Requirement Brief | 在 `Requirement Synthesis` 阶段生成并进入审批。 |
| 代码定位建议与修复计划 | 输出候选代码位置、影响模块、修复建议和验证建议。 |
| 外部修复产物与验证结果补录 | 在 `Execution` 阶段接收 GitLab 产物与 verification 输入。 |
| Jira 回写预览与执行 | 支持 preview、审批和真实执行链路。 |
| 飞书记录预览与执行 | 支持 preview、审批和真实执行链路。 |
| Bugfix Report | 导出统一 `Bugfix Report` 作为 run 的最终输出。 |
| checkpoint / 审计 / 恢复 | 保证 run 可恢复、可追踪、可审计且支持脱敏落盘。 |

以下能力在 v1 中明确排除，不得借“顺手实现”名义带入：

| 明确不包含 | 排除原因 |
| --- | --- |
| 自动修改代码 | 需求文档与技术方案都将其列为 v1 非目标。 |
| 自动执行测试 | v1 的 `Execution` 只表示编排修复动作，不代表系统代替开发者执行测试。 |
| 自动创建 commit、branch 或 MR | v1 只允许补录外部 GitLab 产物，不自动生成代码协作产物。 |
| 多用户调度 / 服务端协同 | 当前范围限定为本地单用户、CLI-first。 |
| 自然语言对话式入口 | CLI 是 v1 唯一必选入口。 |
| 高自治知识图谱推理 | 不在 v1 闭环范围内。 |

范围裁剪原则：

- 实施计划中的“必须包含”和“明确不包含”必须同时被需求文档与技术方案授权。
- 新增能力若无法在上游文档找到依据，一律视为超 scope。
- 若后续实现需要引入新能力，必须先更新上游文档，再调整本文件。

## 1.2 系统分层职责冻结

当前仓库仍以文档为主，但 v1 的实现边界已经固定为五层架构。后续落代码时必须保持 owner 唯一，不允许把临时便利写成越层依赖。

| 层级 | 唯一职责 | 禁止行为 |
| --- | --- | --- |
| CLI Layer | 接收命令、解析参数、进行交互确认、切换 TTY/JSON 输出，并把用户意图转成 workflow 命令。 | 不直接持有业务状态，不直接写业务持久化，不直接访问 Jira / GitLab / 飞书 / 本地仓库。 |
| Workflow/Agent Layer | 作为唯一业务状态 owner，维护 `ExecutionContext`、驱动阶段流转、审批、回退、恢复和 checkpoint。 | 不直接操作底层平台细节，不把纯计算逻辑塞回 workflow，不承担渲染。 |
| Skill Layer | 只接受结构化输入并返回结构化输出，提供可复用、可独立测试的分析或草稿生成能力。 | 不做 I/O，不持久化 run state，不直接写 checkpoint，不直接渲染 CLI。 |
| Infrastructure Layer | 作为唯一外部系统与本地仓库访问入口，负责读取、目标解析、preview 生成、真实写入和错误标准化。 | 不接管业务状态，不直接决定审批流转，不绕过 workflow 更新上下文。 |
| Renderers | 负责 CLI 摘要、Markdown 导出和 JSON 输出格式化。 | 不生成业务结论，不承担审批逻辑，不拼装底层平台 payload。 |

分层约束：

- `Workflow/Agent Layer` 是唯一业务状态 owner。
- `Skill Layer` 与 `Renderers` 都不能成为状态 owner。
- preview 的业务内容可以来自 skill 的 canonical draft，但 preview 的正式生成 owner 仍然是 `Infrastructure Layer`。
- CLI 可以触发命令，但所有持久化状态变更都必须回到 workflow 执行。

## 1.3 核心对象清单冻结

任务一将以下八个对象冻结为 v1 的核心契约。后续新增字段只能落在已有对象的职责范围内，不能用“临时对象”绕开 owner 边界。

| 对象 | owner / 主承载层 | 承载内容 | 不应重复持有的内容 |
| --- | --- | --- | --- |
| `ProjectProfile` | storage + config-loader 输入 | 项目画像、连接器映射、需求规则、repo 与审批策略。 | 运行期状态、审批历史、临时 preview。 |
| `ExecutionContext` | Workflow/Agent Layer | 当前 run 的有效业务状态、当前阶段、有效引用、等待原因和摘要。 | 原始自由文本、完整审计流、完整副作用账本。 |
| `RequirementBrief` | skills / artifacts | 需求绑定状态、背景摘要、修复目标、待确认问题。 | 审批状态、checkpoint 元数据。 |
| `BugfixReport` | report-writer / artifacts | run 最终输出，汇总问题、修复、验证、写回和风险。 | 中间阶段的 owner 语义。 |
| `ApprovalRecord` | Workflow/Agent Layer | 审批生命周期、审批决定、绑定对象、回退目标和 supersede 关系。 | preview 正文、artifact 正文。 |
| `SideEffectLedgerEntry` | storage / ledger | Jira 与飞书真实写入的幂等、状态、目标、结果与对账线索。 | 业务上下文全量副本。 |
| `CheckpointRecord` | storage / checkpoints | durable 状态迁移快照、当前有效引用和恢复边界。 | 长文本 artifact 正文。 |
| `StructuredError` | 全链路统一错误壳 | 标准错误分类、阶段、系统、可重试性、用户动作建议。 | 任意层各自命名的一次性错误格式。 |

对象覆盖原则：

- 核心输入由 `ProjectProfile` 与外部 snapshot 提供，运行态聚合到 `ExecutionContext`。
- 审批事实只进入 `ApprovalRecord`，不再由 artifact 或 preview 反向保存审批状态。
- 恢复与去重线索分别落在 `CheckpointRecord` 与 `SideEffectLedgerEntry`，不与 `ExecutionContext` 重复内嵌。
- 所有面向人阅读的长文本产物通过 artifacts 引用管理，而不是直接塞入 `ExecutionContext`。

## 1.4 状态枚举与兼容映射冻结

状态冻结的原则是“三类状态分离，`run_status` 只做兼容字段”。实现必须始终以 `stage_status_map`、`run_lifecycle_status` 和 `run_outcome_status` 为主，不得反向从兼容字段驱动状态机。

### 阶段状态

- `not_started`
- `in_progress`
- `output_ready`
- `waiting_approval`
- `approved_pending_write`
- `executing_side_effect`
- `waiting_external_input`
- `completed`
- `failed`
- `stale`
- `skipped`

### 审批决定与审批状态

- `decision`: `approve`、`reject`、`revise`
- `approval_status`: `none`、`pending`、`approved`、`rejected`、`revise_requested`、`superseded`

### run 主状态

- `run_lifecycle_status`: `active`、`waiting_approval`、`waiting_external_input`、`paused`、`cancelled`、`completed`、`failed`
- `run_outcome_status`: `unknown`、`in_progress`、`success`、`partial_success`、`failed`、`cancelled`

### `run_status` 兼容映射

`run_status` 只为兼容旧消费方保留，派生规则固定如下：

| run_lifecycle_status | run_outcome_status | 派生 `run_status` | 说明 |
| --- | --- | --- | --- |
| `waiting_approval` | `unknown` / `in_progress` | `waiting_approval` | 有阶段等待审批时，等待态优先。 |
| `waiting_external_input` | `in_progress` | `waiting_external_input` | 例如等待 GitLab 产物或 verification 补录。 |
| `paused` | `in_progress` | `paused` | 用于需要人工干预但尚未取消的恢复态。 |
| `active` | `unknown` / `in_progress` | `in_progress` | 标准主流程正在推进。 |
| `completed` | `success` | `success` | 全链路完成且无不可忽略失败。 |
| `completed` | `partial_success` | `partial_success` | 至少一个外部写成功，且至少一个不可忽略副作用失败。 |
| `failed` | `failed` | `failed` | 已进入不可恢复失败终态。 |
| `cancelled` | `cancelled` | `cancelled` | 用户 `reject` 或明确终止。 |

### 五类关键场景映射

| 场景 | 关键阶段状态 | run_lifecycle_status | run_outcome_status | 派生 `run_status` |
| --- | --- | --- | --- | --- |
| 标准主流程 | 当前阶段 `in_progress` / `completed` | `active` | `in_progress` | `in_progress` |
| 审批拒绝 | 审批阶段 `failed` 或终止后不再推进 | `cancelled` | `cancelled` | `cancelled` |
| 回退重做 | 回退点 `not_started`，后续阶段 `stale`，旧审批 `superseded` | `active` | `in_progress` | `in_progress` |
| 部分成功 | 写入阶段 `completed` + 某副作用失败事实保留 | `completed` | `partial_success` | `partial_success` |
| 恢复执行 | 从 checkpoint 恢复到等待态或活动态 | `waiting_external_input` / `active` | `in_progress` | `waiting_external_input` / `in_progress` |

状态不变式：

- 任一阶段为 `waiting_approval` 时，`run_lifecycle_status` 必须为 `waiting_approval`。
- 任一阶段为 `waiting_external_input` 时，`run_lifecycle_status` 必须为 `waiting_external_input`。
- 外部写入阶段在真实请求发出前只能处于 `approved_pending_write`，发出时才进入 `executing_side_effect`。
- `superseded` 只描述审批记录过期，不直接替代阶段状态。

## 1.5 审批对象分型规则冻结

审批必须分成两种互不混用的类型：分析产物审批和外部写入审批。二者共享 `ApprovalRecord` 外壳，但绑定对象、失效条件和批准后的动作不同。

| 审批类型 | 绑定对象 | 典型阶段 | 审批通过后的动作 | 旧审批失效条件 |
| --- | --- | --- | --- | --- |
| 分析产物审批 | `artifact_ref` | `Requirement Synthesis`、`Fix Planning` | 允许 workflow 将当前 artifact 设为有效结果，并推进到下一分析或执行阶段。 | artifact 被 revise、被新的 artifact 取代、阶段被回退为 `stale`。 |
| 外部写入审批 | `preview_ref + preview_hash` | `Artifact Linking`、`Knowledge Recording` | 只允许进入 `approved_pending_write`，不能直接绕过 preview 执行真实写入。 | preview 被刷新、`preview_hash` 变化、目标版本变化、run 从 checkpoint 恢复到较早版本。 |

分型约束：

- 分析产物审批只认 `artifact_ref`，不依赖 preview。
- 外部写入审批必须绑定 `preview_ref + preview_hash`，不能只凭 stage 名称或最近一次 approval 放行。
- 若 preview 刷新，所有引用旧 preview 的审批都必须视为旧审批失效，并标记为 `superseded`。
- 若 artifact 因 `revise` 失效，对应分析审批也必须失效，但不会自动替代外部写入审批。
- `approve` 表示“当前绑定对象已通过人工确认”，不表示“允许跳过后续前置校验”。

## 1.6 条件必填与错误语义冻结

本节冻结任务一最后一项：哪些输入在进入后续流程前必须具备，以及这些缺失或非法状态应该归入哪一类 `StructuredError`。

### 最小字段要求

| 场景 | 最小必填字段 | 缺失时的标准错误 |
| --- | --- | --- |
| GitLab 产物补录 | `artifact_type`，以及与之对应的 `commit_sha` / `branch_name` / `mr_iid` 和标准链接字段。 | `invalid_input` |
| Jira 写回 | `issue_key`、`target_ref`、当前 `preview_ref`、`preview_hash`、`idempotency_key`。 | `invalid_input` 或 `preview_version_stale` |
| 飞书写入 | `space_id`、`doc_id`、`block_id_or_anchor`、当前 `preview_ref`、`preview_hash`、`idempotency_key`。 | `invalid_input` 或 `preview_version_stale` |
| 未绑定需求 | `requirement_binding_status = unresolved`，并显式保留 `binding_reason`。 | `requirement_binding_unresolved` 仅在强约束项目进入外部写回前触发阻塞 |
| 权限错误 / 认证错误 | 必须记录 `system`、`operation`、`target_ref` 与可重试性。 | `permission_denied` 或 `authentication_failed` |
| 非法状态迁移 | 必须记录当前阶段、期望前置条件、实际状态。 | `invalid_state` |
| 写入结果未知 | 必须记录 `request_payload_hash`、`target_ref`、对账入口。 | `outcome_unknown` |

### 标准错误语义

| 错误类别 | 适用场景 | workflow 响应 |
| --- | --- | --- |
| `invalid_input` | 输入缺失、字段不全、补录产物不满足最小字段要求。 | 阻止继续推进，等待用户补录或修正。 |
| `invalid_state` | 在错误阶段执行审批、写入或恢复。 | 阻止状态迁移并保留当前上下文。 |
| `requirement_binding_unresolved` | 未绑定需求且项目把需求绑定设为强约束。 | 允许分析继续，但进入外部写回前阻塞。 |
| `permission_denied` | Jira / 飞书权限不足。 | 记录失败现场，允许修正权限后重试。 |
| `authentication_failed` | 凭证失效或引用错误。 | 阻止继续，并要求更新 credential reference。 |
| `preview_version_stale` | preview 被刷新后仍尝试使用旧审批或旧确认值。 | 要求重新 preview 并重新审批。 |
| `outcome_unknown` | 请求已发出但无法确认是否成功。 | 恢复时先 reconcile，再决定是否重试。 |
| `write_failed` | 外部写入明确失败。 | 保留失败记录；若其他副作用成功，最终可能收敛为 `partial_success`。 |

冻结原则：

- 同类问题只保留一个标准命名，避免“权限不足”“无权限”“forbidden”并存。
- `StructuredError.category` 必须足以驱动“继续等待输入 / 需要人工修正 / 直接失败终止”这三类分支。
- 未绑定需求不是通用失败；只有命中强约束策略时才升级为阻塞错误。

## 2. 当前仓库文件职责

当前仓库仍处于文档先行阶段，因此“文件功能”主要围绕协作约束和架构基线展开。

| 文件 | 作用 |
| --- | --- |
| `.gitignore` | 定义仓库需要忽略的本地产物与临时文件边界，避免非交付内容混入文档驱动开发过程。 |
| `AGENTS.md` | 定义本仓库内所有 agent 的统一协作规则、信息优先级、升级条件和交付要求。 |
| `memory-bank/需求文档.md` | 记录产品目标、v1 范围、非目标、场景和需求约束，是产品边界的最高文档依据。 |
| `memory-bank/技术方案.md` | 将需求收敛为工程设计，定义五层架构、核心对象、状态机、存储、CLI 与 connector 方案。 |
| `memory-bank/实施计划.md` | 把技术方案拆成可执行步骤，并规定每步都要有测试与通过标准。 |
| `memory-bank/progress.md` | 记录阶段性推进结果、验证证据和后续开发可参考的上下文。 |
| `memory-bank/architecture.md` | 作为实施计划持续实现产物，冻结范围、分层、对象、状态、持久化、安全、Infrastructure、Skill、workflow、写回、CLI 与交付验收契约，并解释当前文档仓的文件职责。 |
| `memory-bank/features/README.md` | 作为 `features/` 目录索引，按业务闭环列出 feature 切分、依赖顺序、来源映射和阅读顺序。 |
| `memory-bank/features/F01-项目画像与关系绑定.md` | 定义 `ProjectProfile`、关系绑定、需求映射规则和未绑定需求策略的实现边界。 |
| `memory-bank/features/F02-run-持久化审计与安全底座.md` | 定义 run 存储布局、checkpoint、ledger、redaction、锁与 dedupe 的实现工作包。 |
| `memory-bank/features/F03-只读接入与上下文解析.md` | 定义 Jira / GitLab / 飞书 / repo 的只读接入、registry 路由与上下文解析输入。 |
| `memory-bank/features/F04-分析链路与结构化产物.md` | 定义 Skill 链路、`StageResult<T>`、分析类产物和 canonical draft 的实现边界。 |
| `memory-bank/features/F05-主工作流审批与恢复.md` | 定义八阶段主流程、审批门、回退、恢复和 `partial_success` 的实现说明。 |
| `memory-bank/features/F06-补录写回与幂等执行.md` | 定义补录、preview、审批绑定、execute 门禁、幂等去重和 reconcile 的实现说明。 |
| `memory-bank/features/F07-CLI-命令体系与子工作流.md` | 定义 CLI 命令树、子工作流、输出契约和标准演示路径的实现说明。 |
| `memory-bank/features/F08-报告验收与交付收口.md` | 定义 `BugfixReport`、追踪矩阵、测试结构、成功指标和交付清单的收口说明。 |
| `temp/prompt.md` | 保存最近一轮面向 agent 的任务提示，用于回溯本轮推进边界与顺序要求，不作为上位需求基线。 |
| `tests/test_task1_architecture_contract.py` | 对任务一的冻结结果做最小文档一致性验证，确保每一步都有可执行的测试证据。 |
| `tests/test_task2_persistence_contract.py` | 对任务二的持久化、审计、安全与恢复基线做最小文档契约验证。 |
| `tests/test_task3_infrastructure_contract.py` | 对任务三的 Infrastructure 能力边界与连接器契约冻结结果做最小文档契约验证。 |
| `tests/test_task4_skill_contract.py` | 对任务四的 Skill 清单、统一输出封装、需求映射、分析产物、canonical draft 和错误语义冻结结果做最小文档契约验证。 |
| `tests/test_task5_workflow_contract.py` | 对任务五的八阶段主流程、审批门、Execution 输入矩阵、失效规则、恢复规则与 `partial_success` 语义做最小文档契约验证。 |
| `tests/test_task6_writeback_contract.py` | 对任务六的 preview 生成、版本绑定、execute 门禁、去重、模式差异与 reconcile 收敛规则做最小文档契约验证。 |
| `tests/test_task7_cli_contract.py` | 对任务七的 CLI 命令树、命令组语义、主命令入口、`record` 子工作流、CLI 输出契约与标准演示路径做最小文档契约验证。 |
| `tests/test_task8_delivery_contract.py` | 对任务八的 `BugfixReport` 最小内容、需求到测试追踪矩阵、测试套件结构、成功指标、最终验收清单与交付包清单做最小文档契约验证。 |
| `tests/test_features_catalog_contract.py` | 对 `features/` 目录下的总索引和 8 份 feature 实现文档做结构、模板、覆盖和边界校验。 |

## 3. 对后续实现的架构提示

- 任务二开始前，不应新增与本文件冲突的状态、对象或审批语义。
- 当前仓库尚未落 `src/` 代码目录；后续建立代码骨架时，应严格遵守 `技术方案.md` 中的目录分层，而不是把逻辑混到 CLI 或 tests 里。
- `run_status` 在后续实现中应始终视为兼容字段，而不是状态机真源。
- `memory-bank/features/` 目录用于承接按业务闭环拆分的实现文档；后续代码实现应优先以 feature 文档组织工作包，而不是重新退回按计划编号切分。

## 4. 任务二冻结结果

### 2.1 项目配置与 run 存储布局

任务二首先冻结本地文件系统的唯一落盘布局，避免后续把同类运行期信息散落到多个目录。

| 存储对象 | 固定路径 | 唯一职责 |
| --- | --- | --- |
| 项目画像配置 | `~/.config/bugfix-orchestrator/projects/<project_id>.json` | 保存项目级静态配置，是运行时唯一可信配置来源。 |
| run 根目录 | `~/.local/share/bugfix-orchestrator/runs/<run_id>/` | 汇聚单次 run 的全部持久化结果。 |
| `context.json` | `<run_id>/context.json` | 保存最新业务有效态索引、摘要与引用。 |
| `events.ndjson` | `<run_id>/events.ndjson` | 追加审计事件流。 |
| `side-effects.ndjson` | `<run_id>/side-effects.ndjson` | 记录副作用账本与幂等线索。 |
| `checkpoints/` | `<run_id>/checkpoints/` | 保存 durable 状态迁移的恢复快照。 |
| `artifacts/` | `<run_id>/artifacts/` | 保存 brief、preview、report 等人工可读产物。 |
| `lock` | `<run_id>/lock` | 提供 run 级互斥，阻止并发写入。 |

布局约束：

- 任一类运行期信息只能有一个主落位，不能在 `context.json` 与 `artifacts/` 重复存全量正文。
- `run` 与未来的 `record` 快捷入口必须复用同一 run 目录结构，而不是派生旁路目录。
- 后续实现若需要新增文件，只能在不破坏上述唯一职责的前提下扩展。

### 2.2 落盘 allowlist 与脱敏规则

任务二第二步冻结“能落什么、不能落什么”。核心原则是：恢复所需的最小索引信息可以落盘，高风险原文默认不落盘，只保留引用、摘要或 hash。

| 载体 | 允许落盘 | 必须脱敏或只保留引用 |
| --- | --- | --- |
| `ExecutionContext` | `run_id`、阶段状态、artifact ref、preview ref、hash、等待原因、`sensitive_field_paths`。 | 自由文本正文、外部系统完整 payload、长评论原文、完整审计细节。 |
| checkpoint | 恢复所需的阶段状态、当前有效引用、context hash、最近副作用引用。 | 任何敏感正文、原始 `request_payload`、凭证材料。 |
| artifact | 面向人工审阅的 brief / preview / 报告脱敏版。 | token、cookie、Authorization、完整外部响应原文。 |
| 报告 | 摘要、链接、验证结论、审批历史摘要、开放风险。 | 凭证、敏感会话标识、无需交付的底层调试细节。 |
| 日志 / 审计 | 事件名、阶段、时间戳、引用、标准错误分类。 | token、cookie、Authorization、自由文本原文、原始 `request_payload`。 |

高风险字段规则：

- `token`、`cookie`、`Authorization` 一律不得明文落盘。
- 原始 `request_payload` 默认不落盘，只保留 `request_payload_hash` 与必要 target 引用。
- 自由文本正文若对恢复必需，必须转为 artifact ref，而不是直接内嵌进 context 或日志。
- `sensitive_field_paths` 作为脱敏策略输入可以落盘，用于后续恢复与再次导出时持续执行同一规则。

### 2.3 checkpoint 触发点

checkpoint 的 owner 仍然是 workflow + storage。只要 durable 状态发生变化，就必须有对应 checkpoint，避免恢复时依赖内存态猜测。

必须落 checkpoint 的时点：

- 阶段开始
- 阶段完成或结构化产物成为当前有效结果
- 进入等待审批
- 审批结果写入后
- 进入等待外部输入
- 接收外部补录输入后
- 进入副作用执行前
- 外部写成功或失败后
- 恢复执行后重新绑定当前阶段时
- 显式按 `--checkpoint <id>` 恢复后

checkpoint 至少要能回答的问题：

- 当前恢复点对应的业务版本是什么
- 当前有效 artifact / preview / approval 引用是什么
- 最近一次副作用是否已经进入 `prepared` 或 `dispatched`
- 此时恢复应继续等待、继续执行，还是先 reconcile

空窗区间约束：

- 不允许出现“状态已变更，但尚未有对应 checkpoint”的可见窗口。
- 进入副作用执行前，必须先具备可恢复到写前状态的 checkpoint。

### 2.4 side-effect ledger 生命周期

所有 Jira / 飞书真实写入都必须遵守唯一顺序：

`prepared -> executing_side_effect checkpoint -> dispatched -> terminal status`

其中 terminal status 只能是以下三种之一：

- `succeeded`
- `failed`
- `outcome_unknown`

生命周期约束：

- 写请求发出前，必须已经落一条 `prepared` 账本记录。
- 写请求发出前，必须已经完成 `executing_side_effect checkpoint`，否则恢复时无法判断写前与写中边界。
- 外部请求真正发出后，账本状态才允许更新为 `dispatched`。
- 若收到明确成功结果，落账为 `succeeded`。
- 若收到明确失败结果，落账为 `failed`。
- 若请求已发出但结果无法确认，落账为 `outcome_unknown`，并把后续动作切换为 reconcile，而不是直接重放。

顺序不变式：

- 不允许跳过 `prepared` 直接记录 `dispatched`。
- 不允许在没有对应 checkpoint 的情况下发出真实写请求。
- 不允许把 `outcome_unknown` 当作 `failed` 自动重试。

### 2.5 锁、去重与对账基线

任务二最后一步冻结并发与恢复场景下的保护机制，确保重复副作用不会因为 CLI 重入、跨 run 或结果未知而被静默放大。

| 机制 | 作用 | 必须满足的基线 |
| --- | --- | --- |
| `run 级锁` | 防止同一 `run_id` 被两个终端同时修改。 | 任何 run 写操作前必须先获取；失败时返回锁冲突。 |
| `target 级锁` 或 `dedupe index` | 防止同一外部目标被并发写入。 | 幂等检查不能只依赖当前 run，必须能识别跨 run 冲突。 |
| reconcile | 收敛 `prepared` / `dispatched` 但无终态的副作用记录。 | 恢复时必须优先判断是否已应用，而不是直接重发。 |

重复与未知结果规则：

- 若发现相同 `idempotency_key` 或同一目标 marker 已存在，应阻止重复写入或标记 `already_applied`。
- 遇到跨 run 冲突时，不能假设“当前 run 更新鲜”；必须依赖 target 级事实或 dedupe index 判断。
- 若账本停留在 `prepared` 或 `dispatched` 且没有终态，恢复路径必须先进入 `reconcile`。

reconcile 结果只允许收敛到以下三类：

- `confirmed_applied`
- `confirmed_not_applied`
- `still_unknown`

后续动作约束：

- `confirmed_applied`：补齐成功事实，禁止再次发送同一副作用。
- `confirmed_not_applied`：允许在重新满足前置条件后重试。
- `still_unknown`：继续保持阻塞，不允许盲重试。

## 5. 任务三冻结结果

### 3.1 能力接口清单冻结

任务三首先冻结 `Infrastructure Layer` 暴露给 workflow 与 skill 的能力接口清单，避免后续把平台细节泄漏到上层。能力拆分必须覆盖读取、目标解析、preview、执行、副作用对账与仓库只读访问，但不能让多个接口共同持有同一职责。

| 能力接口 | 唯一职责 | 明确不负责 |
| --- | --- | --- |
| `HealthCheckCapability` | 对指定 connector 或 repo 依赖执行健康检查，返回能力可用性、权限概况与阻塞原因。 | 不读取业务对象，不产出 preview，不执行真实写入。 |
| `ReaderCapability` | 以只读方式拉取 Jira issue、GitLab 产物、Feishu 模板元数据等结构化输入。 | 不做目标解析，不拼接执行 payload。 |
| `TargetResolverCapability` | 根据 `ProjectProfile` 与输入上下文解析 Jira 写回目标、Feishu 锚点、GitLab 项目与 repo 模块目标。 | 不直接读取业务正文，不承担 preview 生成。 |
| `PreviewWriterCapability` | 基于 canonical draft 生成 preview、preview hash、marker 与幂等键候选，供审批前审阅。 | 不发送真实外部请求，不更新审批状态。 |
| `SideEffectExecutorCapability` | 在 workflow 明确放行后执行真实副作用，并返回标准化执行结果与外部响应摘要。 | 不跳过 preview，不自己决定是否重试。 |
| `ArtifactResolverCapability` | 将 commit、branch、MR、preview、report 等引用解析为统一 artifact 元数据与可追溯链接。 | 不直接访问 workflow 状态，不替代 renderer 输出。 |
| `RepoWorkspaceCapability` | 提供本地仓库只读访问、模块规则匹配、代码搜索与工作区元数据读取。 | 不写本地代码，不替 workflow 推断业务阶段。 |

接口边界约束：

- 读取职责只允许由 `ReaderCapability` 承担，避免 connector 一边读取一边偷偷做 preview。
- 目标解析必须收敛在 `TargetResolverCapability`，workflow 只消费结构化结果，不拼平台特定路径。
- `PreviewWriterCapability` 与 `SideEffectExecutorCapability` 必须分离，确保 `preview -> approve -> execute` 不会塌缩成一步。
- 副作用对账依赖 `SideEffectExecutorCapability` 返回的标准化执行事实与幂等线索，但对账决策 owner 仍然是 workflow + ledger。
- 仓库只读访问只能通过 `RepoWorkspaceCapability` 进入，skill 不能绕过 Infrastructure 直接扫本地仓库。

### 3.2 Jira 只读契约冻结

Jira connector 在任务三中只冻结“读取与解析输入”的最小契约，保证 `jira-intake`、`project-context` 和后续 Jira 写回 preview 都能消费统一结构，而不需要了解 Jira 的底层字段细节。

#### Bug 读取字段

`ReaderCapability` 面向 Jira issue 的标准化输出至少应包含：

- `issue_key`
- `issue_id`
- `issue_type_id`
- `status`
- `summary`
- `description`
- `labels`
- `assignee`
- `reporter`
- `created_at`
- `updated_at`

说明：

- `summary` 与 `description` 用于 `jira-intake` 生成 bug 摘要。
- `labels`、`issue_type_id` 与标准时间字段用于后续需求线索筛选、审计与报告引用。
- connector 必须返回结构化字段与缺失标记，而不是把原始 Jira payload 直接上抛。

#### 需求线索读取

Jira 只读契约必须支持按 `ProjectProfile.jira.requirement_link_rules` 读取并标准化以下线索来源：

- `issue_link`
- `custom_field`
- `label`
- `text_pattern`
- `manual`

每条线索至少要保留：

- `rule_type`
- `rule_id`
- `raw_value`
- `normalized_ref`
- `confidence`

这样 `project-context` 才能在“唯一命中、多候选、无法识别、人工覆盖”之间稳定分支，而不是重复解析 Jira 原始字段。

#### 写回目标解析输入

为支撑后续 Jira 回写 preview，Jira connector 的只读阶段还必须暴露 `writeback_targets` 的目标解析结果，至少包含：

- `issue_key`
- `target_field`
- `target_ref`
- `target_display_name`
- `allowed_operations`
- `target_version`

该结果只负责说明“写到哪里”和“当前目标版本是什么”，不负责生成 preview 正文或真实写入 payload。

#### 标准错误出口

Jira 只读链路只允许使用统一错误语义向上抛出：

- `invalid_input`：issue key 或读取参数不合法
- `permission_denied`：账号可达但无权读取目标 issue 或目标字段
- `authentication_failed`：credential reference 无效或凭证过期
- `write_failed`：只用于写回目标元数据读取明确失败的场景，不替代读取类权限错误

冻结约束：

- workflow 只能消费标准化后的 Jira 读取结果，不能自行拼 Jira API 字段名。
- Jira connector 需要同时覆盖 bug 主体字段、需求线索和 `writeback_targets`，避免后续 preview 阶段再次补抓基础数据。
- 同一错误场景不得同时出现多种命名，继续沿用任务一中冻结的 `StructuredError` 分类。

### 3.3 GitLab 只读契约冻结

GitLab connector 的只读职责不是“帮上层猜链接”，而是把 commit、branch、MR 与项目信息收敛为统一结构，让 `Execution` 阶段的补录、Jira 回写和报告导出都消费同一份标准化 artifact 表示。

#### 统一 artifact 表示

GitLab 只读契约必须把以下三类外部产物统一解析为 `GitLabArtifactRef`：

- `commit`
- `branch`
- `MR`

统一结构至少包含：

- `artifact_type`
- `project_id`
- `project_path`
- `default_branch`
- `web_url`
- `artifact_url`
- `display_name`

不同产物类型的专属字段：

- `commit`：`commit_sha`、`title`
- `branch`：`branch_name`、`head_commit_sha`
- `MR`：`mr_iid`、`source_branch`、`target_branch`

#### 项目信息与链接生成规则

GitLab connector 必须基于 `ProjectProfile.gitlab` 返回稳定的项目信息和链接规则，包括：

- `project_id`
- `project_path`
- `default_branch`
- `web_url`
- `artifact_url_template`

规则要求：

- 调用方不能自行拼接 commit、branch 或 MR 链接，必须使用 connector 返回的 `artifact_url`。
- `default_branch` 必须作为 branch / MR 补录与报告摘要的标准比较基线。
- 相同输入在不同阶段解析出的链接必须一致，避免 Jira 回写与报告导出出现两个不同 URL。

#### 上层消费边界

统一后的 GitLab artifact 必须足以支撑以下场景，而不需要调用方重新理解 GitLab 平台细节：

- `Execution` 阶段产物补录
- Jira 回写 canonical draft
- `Bugfix Report` 报告导出

冻结约束：

- GitLab 只读契约必须同时覆盖 `commit_sha`、`branch_name`、`mr_iid` 三类主键，不能只对某一类产物做特殊支持。
- 统一结构是 `gitlab-linker` 与 report writer 的唯一输入基线，不允许 workflow 再持有一套平行的 GitLab 链接拼装逻辑。
- 若 GitLab 读取失败，仍然沿用任务一中冻结的标准错误语义，而不是引入新的平台特定错误名。

### 3.4 Feishu 与本地仓库只读契约冻结

Feishu 与本地仓库的读取契约在同一步冻结，是因为它们共同服务于“preview 生成”和“代码定位分析”两个只读输入面：前者需要稳定的文档目标定位，后者需要稳定的 repo 工作区与模块候选解析。

#### Feishu 目标定位与模板读取

Feishu connector 的只读结果至少需要返回以下定位信息：

- `space_id`
- `doc_id`
- `block_path_or_anchor`
- `target_block_id`
- `template_id`
- `template_version`

其中：

- `space_id`、`doc_id`、`block_path_or_anchor` 来自 `ProjectProfile.feishu`
- `target_block_id` 是锚点解析后的稳定写入位置
- `template_id` 与 `template_version` 用于确认后续 preview 基于哪个模板版本生成

Feishu 只读契约还必须提供：

- 模板元数据摘要
- 锚点是否命中
- 目标块当前版本

这样后续 preview 生成才能在不再次读取底层文档结构的情况下完成版本绑定与审批对象绑定。

#### 本地仓库只读输入

`RepoWorkspaceCapability` 至少要返回以下 repo 工作区与模块解析信息：

- `repo.local_path`
- `module_rules`
- `candidate_modules`
- `workspace_branch`
- `code search` 命中摘要

说明：

- `repo.local_path` 与 `module_rules` 用于锁定候选模块范围。
- `candidate_modules` 为 `code-locator` 提供稳定的模块候选集合。
- `code search` 结果只提供文件、命中片段摘要与匹配原因，不直接替代分析结论。

#### 上层消费边界

Feishu 与 repo 的只读输入至少要足以支撑：

- Feishu preview 生成
- `code-locator` 的代码定位分析

冻结约束：

- workflow 不能自己解析 Feishu block 树或 anchor 路径，必须消费 connector 返回的 `target_block_id` 与版本信息。
- skill 不能直接扫描本地仓库；所有模块候选与 `code search` 结果都必须通过 `RepoWorkspaceCapability` 暴露。
- Feishu 目标定位与 repo 模块候选一旦标准化，上层只保留引用和摘要，不重复持有底层平台原始结构。

### 3.5 connector registry 与路由规则冻结

任务三最后一步冻结 connector registry 的选择入口和路由规则，目标是让 workflow 只依赖“项目画像 + capability”这两个维度，而不是直接知道 Jira、GitLab、Feishu 或 repo 的具体实现类。

#### 路由输入与解析结果

connector registry 的最小选择输入应包含：

- `ProjectProfile`
- `capability`
- `platform_key`

标准解析结果至少要包含：

- `connector_id`
- `platform_key`
- `supported_capabilities`
- `resolver_reason`

推荐统一入口：

- `resolveConnector(project_profile, capability)`

其中 `platform_key` 用于标识 Jira、GitLab、Feishu 或 repo 这类平台维度，`capability` 用于约束当前阶段到底需要 `ReaderCapability`、`TargetResolverCapability` 还是其他能力。

#### 路由不变式

- 同一项目在不同阶段请求同一种 capability 时，connector registry 必须给出一致的解析结果。
- 同一项目若在不同阶段分别请求 `ReaderCapability` 与 `TargetResolverCapability`，允许返回同一 connector，但不允许绕过 registry 直接实例化具体平台实现。
- workflow 不直接依赖具体平台实现；它只认 capability 接口与 registry 解析结果。

#### 上层使用约束

- workflow 只能通过 connector registry 获取 connector，不能在阶段执行器里硬编码 Jira、GitLab、Feishu 或 repo 的构造逻辑。
- skill 层同样不能直接选择平台实现，若需要基础设施能力，必须由 workflow 先完成路由并注入标准化输入结果。
- 若项目画像缺失某项 capability 对应平台映射，registry 必须返回标准化错误，而不是让调用方回退到静默猜测。

冻结约束：

- connector registry 是唯一平台选择入口，后续实现不得再增加第二套路由器。
- 相同 `ProjectProfile` + `capability` 输入必须收敛到可复用、可测试、结果一致的路由规则。
- 只要能力选择仍通过 registry 完成，后续新增平台也不应迫使 workflow 改写分支判断。

## 6. 任务四冻结结果

### 4.1 skill 清单与职责冻结

任务四首先冻结 Skill Layer 的唯一 skill 清单与职责，保证每个 skill 都是“结构化输入 -> 结构化输出”的纯能力单元，而不是把审批、持久化、connector 路由或渲染责任重新塞回 skill。

| skill | 唯一职责 | 明确不负责 |
| --- | --- | --- |
| `config-loader` | 校验并标准化已读取的 `ProjectProfile`，输出 workflow 可直接消费的项目配置对象。 | 不读取磁盘，不持有 run state，不替代 registry 做 connector 路由。 |
| `jira-intake` | 解析已读取的 Jira issue snapshot，提炼 bug 摘要、元数据和需求线索。 | 不直接调用 Jira，不决定需求绑定是否强约束。 |
| `project-context` | 基于项目画像把 bug 与需求、仓库、模块上下文关联起来。 | 不直接访问 connector，不把人工审批结果写回上下文。 |
| `requirement-summarizer` | 生成 `RequirementBrief`，汇总已知上下文、修复目标与待确认事项。 | 不维护审批历史，不直接导出 Markdown。 |
| `code-locator` | 基于 repo 只读输入输出候选代码位置、影响模块和根因假设。 | 不直接扫描本地仓库，不输出最终修复决定。 |
| `fix-planner` | 生成修复建议、影响范围、验证建议与开放风险。 | 不直接补录验证结果，不持有外部写入草稿。 |
| `verification-recorder` | 校验并标准化外部补录的验证结果，生成可纳入上下文的验证摘要。 | 不执行测试，不替 workflow 判断 run 最终状态。 |
| `gitlab-linker` | 校验 GitLab 产物引用，并生成 Jira 回写所需的业务草稿。 | 不直接写 Jira，不自行拼 preview。 |
| `feishu-recorder` | 基于模板和上下文生成飞书记录业务草稿。 | 不解析底层 Feishu block 树，不直接执行写入。 |
| `report-writer` | 基于最终上下文生成 `BugfixReport`。 | 不回写外部系统，不接管阶段状态机。 |

冻结约束：

- 上述十个 skill 构成任务四的唯一 v1 skill 清单，后续若要新增 skill，必须先更新上游文档。
- skill 只接受 workflow 已准备好的结构化输入，不直接做 I/O，不直接持久化 run state。
- approval、renderer、connector registry、checkpoint 与 side-effect ledger 都不属于 skill 职责。
- 任一 skill 的输出都必须能被视为结构化输出，供 workflow 继续编排，而不是返回仅供人工阅读的未定形正文。

### 4.2 统一输出封装冻结

任务四第二步冻结所有 skill 的统一输出外壳：无论是分析类 skill、补录类 skill，还是写入草稿生成类 skill，workflow 都只消费 `StageResult<T>`，不再为单个 skill 维护特殊解析分支。

`StageResult<T>` 的最小字段集固定为：

- `status`
- `summary`
- `data`
- `warnings`
- `errors`
- `source_refs`
- `generated_at`

字段语义约束：

| 字段 | 固定含义 | 约束 |
| --- | --- | --- |
| `status` | 当前 skill 执行后的结构化结果状态。 | 必须足以让 workflow 判断该结果是可继续消费、需等待输入，还是应转入错误处理。 |
| `summary` | 面向 CLI 与审阅者的短摘要。 | 只作摘要，不替代 `data` 的结构化字段。 |
| `data` | 该 skill 的领域主产物。 | 必须是对应领域对象或 canonical draft，而不是松散文本。 |
| `warnings` | 非阻塞问题列表。 | 不能与 `errors` 混用，不能偷偷承载阻塞语义。 |
| `errors` | 标准化错误列表。 | 仅承载 `StructuredError` 或其等价标准化表示。 |
| `source_refs` | 结果所依赖的输入引用。 | 只保留引用，不重复嵌入原始正文。 |
| `generated_at` | 结果生成时间。 | 所有 skill 统一提供，便于审计、报告和 supersede 判断。 |

统一消费约束：

- workflow 必须把每个 skill 的返回值都视为相同外壳，再按 `data` 的领域类型推进下一阶段。
- 不允许因为某个 skill 缺少 `warnings`、`errors` 或 `source_refs` 而引入额外兼容逻辑；缺失即视为契约不满足。
- `summary` 负责快速展示，`data` 负责机器消费，两者职责不能互相替代。
- `generated_at` 与 `source_refs` 是任务四之后所有 artifact supersede、审计追踪和报告汇总的统一基线。

### 4.3 需求映射与人工覆盖规则冻结

任务四第三步只冻结 `project-context` 在需求绑定上的结构化分支表达，避免 workflow 在“唯一命中、多候选、无法识别、人工覆盖”几种场景下依赖自由文本猜测后续动作。

`project-context` 的需求映射结果至少应包含：

- `requirement_binding_status`
- `linked_requirement_refs`
- `binding_reason`
- `resolution_source`
- `allowed_next_actions`

四类核心场景与固定表达：

| 场景 | `requirement_binding_status` | 固定要求 | `allowed_next_actions` |
| --- | --- | --- | --- |
| 唯一命中 | `resolved` | 必须只有一个稳定 requirement ref，且记录命中的 rule 来源。 | `generate_requirement_brief`、`continue_analysis` |
| 多候选 | `ambiguous` | 必须保留候选集合、排序依据与未决原因，不能偷偷选一个默认值。 | `request_manual_selection`、`apply_manual_override` |
| 无法识别 | `unresolved` | 必须显式记录无法识别原因，而不是把空结果当作正常 resolved。 | `continue_with_unresolved_requirement`、`request_manual_binding` |
| 人工覆盖 | `resolved` 或 `unresolved` | 必须保留人工指定输入、覆盖来源和被覆盖的自动识别结果。 | `generate_requirement_brief`、`continue_analysis` |

人工介入规则：

- `人工指定` 属于用户首次给出 requirement target 的输入动作，必须记录为 `resolution_source = manual_input`。
- `人工覆盖` 属于用户对自动结果的显式修正，必须同时保留原自动结果引用与覆盖理由。
- 当结果为 `unresolved` 时，必须同步保留 `binding_reason`，并允许 Requirement Brief 明确标注未绑定需求。
- workflow 只能根据 `allowed_next_actions` 判断是否继续分析、等待人工选择或阻塞进入外部写回，不得自行扩展隐藏分支。

冻结约束：

- `project-context` 必须把唯一命中、多候选、无法识别、人工指定、人工覆盖表达为稳定结构，而不是只返回自然语言描述。
- 多候选场景不能直接降级成 `unresolved`；只有在用户放弃选择或规则本身无法识别时才进入 `unresolved`。
- 后续若项目启用“需求绑定强约束”，也只应由 workflow 依据 `requirement_binding_status` 和 `binding_reason` 决定阻塞点，而不是要求 skill 改写状态机。

### 4.4 分析类产物最小字段集冻结

任务四第四步冻结几类分析类产物的最小字段，目标是让审批、回退、报告和写回草稿生成都依赖结构化结果推进，而不是重新解析原始自由文本。

#### `RequirementBrief`

`RequirementBrief` 的最小字段以任务一已冻结对象为基线，至少包含：

- `issue_key`
- `project_id`
- `linked_requirement`
- `requirement_binding_status`
- `binding_reason`
- `known_context`
- `fix_goal`
- `pending_questions`
- `generated_at`
- `source_refs`

#### 代码定位结果

代码定位结果至少包含：

- `candidate_modules`
- `candidate_files`
- `match_reasons`
- `root_cause_hypotheses`
- `confidence`
- `source_refs`
- `generated_at`

#### 修复计划

修复计划至少包含：

- `fix_objectives`
- `proposed_changes`
- `impact_scope`
- `dependencies_or_blockers`
- `verification_plan_ref`
- `open_risks`
- `generated_at`
- `source_refs`

#### 验证建议

验证建议至少包含：

- `verification_items`
- `expected_outcomes`
- `manual_checks`
- `environment_notes`
- `generated_at`
- `source_refs`

#### 外部补录验证结果

外部补录验证结果至少包含：

- `verification_status`
- `evidence_refs`
- `summary`
- `recorded_by`
- `recorded_at`
- `source_refs`

这些最小字段必须足以支撑以下动作：

- 审批：分析产物审批只能绑定结构化 artifact ref，而不能回退到原始长文本。
- 回退：旧结果被 supersede 或回退时，workflow 能识别哪个 artifact 已失效。
- 报告：`report-writer` 能直接消费这些结构化字段拼装 `BugfixReport`。
- 写回草稿生成：`gitlab-linker` 与 `feishu-recorder` 能从 fix / verification 摘要中生成后续草稿，不需要重新读取原始自由文本。

冻结约束：

- 每类分析结果都必须提供最小字段，不存在“只存一段正文，后面靠人工理解继续”的路径。
- `最小字段` 的目标是支撑流程推进，而不是替代 artifact 的可读性版本；可读摘要仍可单独导出，但不能成为唯一数据源。
- 若后续需要补充扩展字段，也只能在不破坏以上最小字段稳定性的前提下追加。

### 4.5 写入类 canonical draft 规则冻结

任务四第五步冻结写入类 skill 的 canonical draft 规则，确保 `gitlab-linker` 与 `feishu-recorder` 生成的是可重复消费的共同输入，既能进入 dry-run preview，也能在审批通过后进入真实写入链路，而不是两条链路各自二次拼装。

#### canonical draft 统一要求

写入类 skill 输出的 canonical draft 至少应包含：

- `draft_type`
- `target_system`
- `target_ref`
- `content_blocks`
- `source_refs`
- `draft_summary`
- `preview_seed`
- `marker_seed`
- `idempotency_key_seed`
- `generated_at`

#### `gitlab-linker` 草稿要求

`gitlab-linker` 输出的 Jira 写回 canonical draft 必须稳定承载：

- GitLab 产物摘要
- 写回目标引用
- 可渲染的内容块
- preview 所需的 `preview_seed`
- 幂等所需的 `idempotency_key_seed`

#### `feishu-recorder` 草稿要求

`feishu-recorder` 输出的飞书记录 canonical draft 必须稳定承载：

- 模板上下文摘要
- 文档目标引用
- 可渲染的内容块
- marker 所需的 `marker_seed`
- preview 所需的 `preview_seed`

#### preview / execute 共享规则

- Infrastructure 必须基于 canonical draft 生成 `preview`，并进一步计算 `preview hash`。
- 审批对象绑定的 `preview_ref + preview hash` 必须来自 canonical draft，而不是来自第二套临时 payload。
- canonical draft 还必须为 marker 与 `idempotency_key` 生成提供稳定输入，确保 dry-run 与真实写入面对同一业务输入时得到一致的预览基础数据。
- 同一业务输入在 dry-run 与真实写入链路中都必须复用同一 canonical draft；真实写入只能在 preview 已冻结并审批通过后继续。

冻结约束：

- `gitlab-linker` 与 `feishu-recorder` 只负责生成 canonical draft，不直接生成最终 preview，也不直接执行真实写入。
- preview、`preview hash`、marker 和 `idempotency_key` 的下游生成必须以 canonical draft 为共同真源，禁止为 execute 另起一套拼装逻辑。
- 若 canonical draft 变化，旧 `preview` 与旧审批必须一并视为失效，重新进入 preview -> approve -> execute 链路。

### 4.6 skill 错误语义冻结

任务四最后一步冻结 skill 层错误输出的标准语义，要求所有 skill 都通过统一 `StructuredError` 壳表达问题类型，让 workflow 能稳定地区分“继续等待输入”“需要人工修正”“直接失败终止”三类结果。

#### skill 常见错误来源

每个 skill 至少要能标准化表达以下错误来源：

- 输入缺失
- 依赖数据无效
- 候选歧义
- 配置缺失
- 外部读取失败

#### 标准化出口规则

| 错误来源 | 建议错误类别 | workflow 默认响应 |
| --- | --- | --- |
| 输入缺失 | `invalid_input` | 继续等待输入 |
| 依赖数据无效 | `invalid_input` 或 `invalid_state` | 需要人工修正 |
| 候选歧义 | `requirement_binding_unresolved` 或 `invalid_input` | 继续等待输入 |
| 配置缺失 | `invalid_input` | 需要人工修正 |
| 外部读取失败 | `authentication_failed`、`permission_denied`、`write_failed` | 需要人工修正`/`直接失败终止，视 retryable 与阶段而定 |

#### 三类结果判定基线

- `继续等待输入`：skill 已识别问题，但允许用户补录或选择后从当前阶段继续，不应直接把 run 置为终态失败。
- `需要人工修正`：存在配置、权限、映射或输入质量问题，必须修正后才能继续，但上下文应保留。
- `直接失败终止`：仅在明确不可继续且不满足恢复前提时才允许使用，不能把所有 skill 错误一律上升为终态失败。

#### 结构化约束

- `StageResult.errors` 中的每项错误都必须能映射到统一 `StructuredError` 分类，而不是返回 skill 私有字符串。
- `warnings` 不得承载阻塞语义；凡是影响阶段推进的结果必须进入 `errors`。
- `project-context`、`verification-recorder`、`gitlab-linker` 等 skill 在遇到候选歧义或补录缺失时，必须明确是等待补录还是要求人工修正，不能只给模糊提示。
- workflow 只能依据标准化错误类别、`retryable`、等待原因与阶段规则做状态迁移，不能按 skill 名称写特殊分支猜测处理方式。

冻结约束：

- skill 层错误语义的目标是驱动状态机，而不是只服务日志可读性。
- 同一问题类型不得出现多套命名；任务一已冻结的标准错误类别继续作为唯一真源。
- 只要某类错误仍可能通过补录、人工选择或配置修复收敛，就不应直接降为终态失败。

## 7. 任务五冻结结果

### 5.1 八阶段主流程冻结

任务五第一步先冻结八阶段主流程，保证从 Jira issue 进入，到报告导出结束，中间没有缺口阶段、重复阶段或“靠人工脑补”的隐形跳转。该主流程仍以 `Workflow/Agent Layer` 作为唯一 owner，阶段内分析能力继续复用任务三、任务四已冻结的基础设施与 skill 契约。

| 阶段 | 进入条件 | 输入 | 输出 | 下一步去向 |
| --- | --- | --- | --- | --- |
| `Intake` | 用户通过 CLI 提供 `project_id` 与 `issue_key`，run 已创建且配置可加载。 | `ProjectProfile`、Jira issue 标识、基础执行参数。 | 标准化 bug snapshot、初始 `ExecutionContext` 引用、读入错误或 warning。 | 成功后进入 `Context Resolution`；若 Jira 读取失败则停留在当前阶段并输出标准错误。 |
| `Context Resolution` | `Intake` 已产出有效 bug snapshot。 | Jira bug 信息、`ProjectProfile`、需求映射规则、repo / connector 元数据。 | 项目、仓库、模块、需求绑定结果，包含 `requirement_binding_status`、`binding_reason` 与 `allowed_next_actions`。 | 成功后进入 `Requirement Synthesis`；若需求多候选或无法识别，则带等待信息进入下一分析阶段或等待人工输入。 |
| `Requirement Synthesis` | 已有上下文解析结果，允许生成需求摘要。 | bug snapshot、上下文解析结果、需求来源摘要。 | `RequirementBrief` artifact、阶段摘要、审批所需 `artifact_ref`。 | 产物生成后进入本阶段审批；审批通过进入 `Code Localization`。 |
| `Code Localization` | `RequirementBrief` 已获分析审批通过。 | 当前有效 `RequirementBrief`、repo 只读能力、模块规则、代码搜索结果。 | 候选模块、候选文件、命中理由、根因假设与引用集合。 | 成功后进入 `Fix Planning`。 |
| `Fix Planning` | 已完成代码定位并拿到候选影响面。 | `RequirementBrief`、代码定位结果、验证建议输入、历史 warning。 | 修复计划、影响范围、验证建议、审批所需 `artifact_ref`。 | 产物生成后进入本阶段审批；审批通过进入 `Execution`。 |
| `Execution` | 修复计划已获分析审批通过，允许等待或吸收外部补录。 | 当前有效修复计划、GitLab artifact 补录、verification 补录、已有 run 摘要。 | 补录后的当前有效执行摘要、等待原因、是否满足进入写入阶段的判断结果。 | 输入齐备时进入 `Artifact Linking`；否则维持 `waiting_external_input`。 |
| `Artifact Linking` | `Execution` 已满足最小外部输入，允许生成 Jira 写回草稿。 | 当前有效执行摘要、GitLab artifact、Jira 写回目标、canonical draft 输入。 | Jira 写回 preview、`preview_ref`、`preview_hash`、待执行目标摘要。 | preview 审批通过后允许真实写入；写入完成后进入 `Knowledge Recording`。 |
| `Knowledge Recording` | Jira 写回已完成或被明确跳过，允许生成飞书沉淀草稿。 | `RequirementBrief`、修复计划、verification 结果、Jira 写回结果、Feishu 目标。 | 飞书 preview、写入结果、最终 `BugfixReport` 导出输入。 | 真实写入完成后导出 `BugfixReport` 并收敛 run 终态。 |

主流程不变式：

- 八个阶段按固定顺序推进，不允许跳过 `Requirement Synthesis` 或 `Fix Planning` 直接进入外部写回。
- 分析阶段的输出必须以结构化产物存在，不能只保留 CLI 展示文本。
- `Execution` 是编排阶段，不等于系统自动改代码或自动执行测试；它只负责吸收外部修复产物与验证结果，并判断是否可以继续。
- `Artifact Linking` 与 `Knowledge Recording` 都属于“先 preview、再审批、后执行”的写入阶段，不能复用分析审批代替写入审批。
- `Knowledge Recording` 完成后必须能为 `BugfixReport` 提供完整输入，因此报告导出是主流程尾部动作，而不是旁路命令独占责任。

### 5.2 审批门与审批结果语义冻结

任务五第二步冻结审批门，目标是让 workflow 在每个需要人工确认的阶段只有一套稳定语义，不会因为阶段不同而把 `approve`、`reject`、`revise` 解释成不同的隐式动作。

#### 必须经过审批的阶段

| 阶段类型 | 具体阶段 | 审批对象 | 为什么必须审批 |
| --- | --- | --- | --- |
| 分析阶段 | `Requirement Synthesis` | `RequirementBrief` 的 `artifact_ref` | 需求摘要决定后续代码定位与修复计划，必须先确认基线。 |
| 分析阶段 | `Fix Planning` | 修复计划的 `artifact_ref` | 修复方向、影响范围、验证建议需要人工确认后再进入外部补录与写回准备。 |
| 写入阶段 | `Artifact Linking` | Jira preview 的 `preview_ref + preview_hash` | 属于真实外部写入前的审批门，必须确认 preview。 |
| 写入阶段 | `Knowledge Recording` | Feishu preview 的 `preview_ref + preview_hash` | 属于真实外部写入前的审批门，必须确认 preview。 |

#### 审批结果在分析阶段的语义

| decision | 状态变化 | 后续动作 |
| --- | --- | --- |
| `approve` | 当前分析阶段从 `waiting_approval` 进入 `completed`。 | 通过继续，推进到下一阶段。 |
| `reject` | run 进入终止路径，当前阶段不再产生新的有效结果。 | 拒绝终止，`run_lifecycle_status` 收敛到 `cancelled`。 |
| `revise` | 当前 artifact 标记为非当前有效结果，必要时后续阶段变为 `stale`。 | 退回重做，回退到指定上游分析阶段重新生成。 |

#### 审批结果在写入阶段的语义

| decision | 状态变化 | 后续动作 |
| --- | --- | --- |
| `approve` | 当前写入阶段从 `waiting_approval` 进入 `approved_pending_write`。 | 表示已批但尚未执行，后续仍需满足 execute 前置条件后才可发起真实写入执行。 |
| `reject` | 当前 preview 失效，不允许继续沿用其审批事实。 | 拒绝终止当前写入动作，run 可停留在当前阶段等待新 preview 或整体终止。 |
| `revise` | 当前 preview 与审批记录标记为 `superseded`。 | 退回重做，重新生成 preview，再次进入审批。 |

审批门不变式：

- `审批通过` 只表示人工认可当前绑定对象，不等于已经发生 `真实写入执行`。
- `审批通过` 与 `真实写入执行` 必须严格分离，任何阶段都不能把 approval 事件直接当作副作用完成事实。
- 分析阶段的 `approve` 会推动阶段前进，但写入阶段的 `approve` 只能把状态推进到 `approved_pending_write`。
- `reject` 的默认语义是拒绝继续使用当前对象；是否整体终止 run，由 workflow 结合阶段类型决定，但不能伪装成成功继续。
- `revise` 必须显式触发“退回重做”，并保留历史审批记录供审计；旧对象不能继续作为当前有效输入。
- 同一个审批动作不能跨对象复用：分析阶段审批不替代写入阶段审批，旧 preview 审批也不能覆盖新 preview。

### 5.3 Execution 阶段输入完成矩阵冻结

任务五第三步冻结 `Execution` 阶段的输入完成矩阵，目标是让 workflow 对“还要继续等待什么、什么时候允许推进、重复补录时如何更新当前有效摘要”有唯一判断口径。

#### 输入分类

- `GitLab 产物补录`：来自外部完成的 commit、branch、MR 等 artifact 记录。
- `验证结果补录`：来自外部测试、人工验证或验收结果的结构化 verification 记录。
- `最小前置输入`：进入 `Artifact Linking` 前，至少需要一个当前有效 GitLab artifact；verification 结果不是硬阻塞项，但若缺失，后续写回和报告必须显式保留未补录状态。

#### Execution 输入完成矩阵

| 场景 | 当前输入 | workflow 判断 | 当前有效摘要处理 |
| --- | --- | --- | --- |
| 仅补录 artifact | 有 `GitLab 产物补录`，无 `验证结果补录` | 若 artifact 满足最小字段，则允许推进到写入准备；若项目策略要求 verification，则继续等待。 | 更新当前有效 artifact 摘要，并把 verification 状态标记为待补录。 |
| 仅补录 verification | 无 artifact，有 `验证结果补录` | 继续等待，因为尚未满足进入 `Artifact Linking` 的最小前置输入。 | 记录 verification 当前有效摘要，但 run 仍停留在 `Execution`。 |
| 两者齐备 | artifact 与 verification 都具备有效结构 | 允许推进，进入 `Artifact Linking`。 | 同时刷新 artifact 与 verification 的当前有效摘要。 |
| 重复补录 | 同类型输入再次到达 | 根据幂等合并或替换规则判定是忽略重复、保留旧值，还是替换为更新版本。 | 始终只保留一份当前有效摘要，旧记录转为历史事实供审计。 |

#### 幂等合并与替换规则

- 对同一 GitLab artifact 重复补录时，若标准化后的业务键一致，则按 `幂等合并` 处理，不重复追加当前有效摘要。
- 对 verification 重复补录时，若为同一验证项的更新版本，则允许 `替换规则` 生效：旧摘要退为历史记录，新摘要成为当前有效摘要。
- 当补录内容只是附加证据引用而不改变业务结论时，允许在当前有效摘要上合并证据列表，但不得生成两个并行“当前有效”版本。
- workflow 不得依赖“最后一次写入覆盖一切”的隐式规则，而必须按 artifact 类型、业务键和时间顺序显式判断合并或替换。

Execution 阶段不变式：

- `Execution` 只吸收外部输入并维护当前有效摘要，不负责创建 GitLab 产物，也不自动生成 verification 结果。
- 只要缺少最小前置输入，run 就必须继续等待，而不是跳过 `Artifact Linking`。
- 一旦允许推进，后续写入阶段消费的必须是 `Execution` 冻结下来的当前有效摘要，而不是直接重新扫描历史补录列表。

### 5.4 stale 与 superseded 规则冻结

任务五第四步冻结回退后的失效规则，目标是把“当前有效态”与“历史事实”严格拆开，避免旧 artifact、旧审批、旧 preview 在 revise 或回滚后重新参与主线推进或恢复。

#### 失效对象与规则

| 对象 | 失效标记 | 失效条件 | 失效后仍需保留的原因 |
| --- | --- | --- | --- |
| 旧 artifact | `stale` | 上游分析阶段 `revise` 后重新生成了新的 `RequirementBrief`、代码定位结果或修复计划。 | 作为历史事实保留，供审计和报告回溯。 |
| 旧审批 | `superseded` | 绑定的 `artifact_ref` 或 `preview_ref + preview_hash` 已不再对应当前有效对象。 | 保留审批轨迹，但不能再驱动状态迁移。 |
| 旧 preview | `stale` + 对应审批 `superseded` | preview 被刷新、目标变化、canonical draft 变化或回退到更早 checkpoint。 | 保留原审批上下文，解释为什么需要重新审批。 |

#### 回退后的当前有效态

- 当用户选择 `revise` 时，workflow 必须把旧对象从当前有效态集合中移除，只允许最新生成的 artifact 或 preview 成为当前有效输入。
- `当前有效态` 只能引用每类对象的最新有效版本；同类对象不能同时存在两个可继续推进的版本。
- 被标记为 `stale` 或 `superseded` 的记录仍属于 `历史事实`，可出现在审计、报告和对账线索中，但不能再参与审批、恢复或执行决策。

#### 恢复与历史保留规则

- 恢复执行时，workflow 只能从 checkpoint 引用的当前有效对象恢复，不能自动重新激活 `旧 artifact`、`旧审批` 或 `旧 preview`。
- 若显式回滚到更早 checkpoint，该 checkpoint 之后生成的对象都必须视为不能再参与当前 run 的后续决策，除非重新生成并再次获批。
- 审计与报告层面必须同时保留“发生过什么”和“当前以什么为准”两条线索，避免历史事实丢失。

失效规则不变式：

- `stale` 描述的是对象内容已过期；`superseded` 描述的是审批事实已被新对象取代，二者不能混用。
- 回退后最重要的判断标准是“哪些对象还能作为当前有效态继续推进”，而不是“哪些历史记录还存在于磁盘上”。
- 任何已经失效的对象都不能再参与恢复、审批或真实写入，但必须继续保留其历史事实用于审计。

### 5.5 恢复执行规则冻结

任务五第五步冻结恢复执行规则，目标是让 run 在中断、等待外部输入或副作用结果未知后都能沿着持久化证据恢复，而不是凭内存态或“重新跑一遍”来赌正确结果。

#### 恢复入口

| 恢复方式 | 输入 | 恢复动作 | 保护规则 |
| --- | --- | --- | --- |
| 最近 checkpoint | 无额外参数，默认取最新有效 checkpoint | 从最近 checkpoint 恢复当前有效对象、阶段状态与等待原因。 | 只允许恢复持久化快照中的当前有效态。 |
| 显式 `--checkpoint` | 指定 checkpoint 引用 | 回滚到指定 checkpoint 的状态视图。 | 该 checkpoint 之后的对象不再自动参与当前 run。 |
| `waiting_external_input` 恢复 | 当前 run 处于等待外部补录 | 重新加载当前等待原因与已保存摘要，继续等待或吸收新补录。 | 不静默重跑已批准分析阶段。 |

#### 中断与副作用恢复规则

- `中断后重进` 时，若最近 checkpoint 位于分析阶段完成后，则只恢复到该分析阶段的已批准结果，不重新生成 artifact。
- 存在 `未终态副作用` 时，必须先查看 side-effect ledger 与 checkpoint 记录，判断请求是否已进入 `prepared`、`dispatched` 或更后状态。
- 若发现写入结果为 `outcome_unknown`，恢复时必须先执行 `reconcile`，再决定是标记已应用、未应用，还是继续保持未知状态。
- 只有在 `reconcile` 明确为未应用且幂等检查允许时，才允许再次尝试真实写入；否则必须避免 `不重复执行`。

#### 回滚与防重跑规则

- 使用 `--checkpoint` 回滚时，workflow 可以恢复到旧状态继续推进，但不得把回滚误解释为“允许恢复旧审批继续直通执行”。
- 恢复动作不能静默重跑已批准分析阶段；除非用户明确触发 revise 或重新生成，否则历史已批准 artifact 仍保持当前有效。
- 对写入阶段而言，恢复只允许基于当前有效 preview 与 ledger 状态继续，不允许绕过校验直接重放旧请求。
- 任何恢复路径都必须优先保证 `不静默重跑` 分析阶段、`不重复执行` 已成功副作用。

恢复规则不变式：

- 恢复真源是 checkpoint、当前有效引用和 ledger，而不是进程内存。
- `waiting_external_input` 是合法恢复态，不应被当作失败后强制重开 run。
- `outcome_unknown` 永远不能直接降级成普通失败重试；必须先 reconcile。

### 5.6 partial_success 语义冻结

任务五最后一步冻结 `partial_success` 的收敛语义，确保 run 在“部分外部写入已成功、部分不可忽略副作用失败”时既不会被误报为成功，也不会粗暴退化成整体失败。

#### 触发条件

- 至少一个外部写成功。
- 至少一个不可忽略副作用失败。
- 所有相关副作用都已经进入明确终态，或未知结果已经过 reconcile 后确认无法计入成功。

#### 最终结果与记录方式

| 维度 | 要求 |
| --- | --- |
| 最终结果 | run 的最终结果收敛为 `partial_success`。 |
| 成功副作用 | 必须保留成功事实、目标引用与结果摘要，不因其他失败被回滚抹除。 |
| 失败副作用 | 必须保留失败原因、错误分类、是否可重试及对应 target。 |
| 报告输出 | `BugfixReport` 需要同时列出成功副作用、失败副作用与剩余风险。 |

#### 后续操作

- `partial_success` 的核心后续操作是允许 `只重试失败部分`，而不是把已成功部分再次执行。
- 若后续重试把所有失败副作用补齐成功，run 可以在新的执行回合中收敛为成功；若仍有不可忽略失败，则继续保持 `partial_success` 或转入新的明确终态。
- 对用户与 CLI 展示而言，必须明确说明它 `不是完全成功`，但也 `不是整体失败`。

partial_success 不变式：

- `partial_success` 只描述最终结果，不改变已成功副作用的历史事实。
- 一旦某个外部写已确认成功，后续恢复与重试逻辑都必须避免重复执行该成功副作用。
- 只有当失败项都可忽略时，最终结果才允许仍视为 success；只要存在不可忽略失败，就不能把 run 报成完全成功。

## 8. 任务六冻结结果

### 6.1 preview 生成规则冻结

任务六首先冻结 Jira 回写与飞书写入的 preview 生成规则，目标是在真实写入之前，先把“给人审什么、哪些内容要稳定、哪些内容允许动态变化”定义清楚，让审批对象具备稳定边界。

#### preview 生成输入

- Jira 回写 preview 必须由 `gitlab-linker` 产出的 canonical draft、当前有效 GitLab artifact 摘要、目标 `issue_key` 与 `writeback_targets` 共同生成。
- 飞书写入 preview 必须由 `feishu-recorder` 产出的 canonical draft、当前 run 的问题/修复/验证摘要、目标 `space_id` / `doc_id` / `block_id_or_anchor` 共同生成。
- preview 的正式 owner 仍然是 `Infrastructure Layer` 的 `PreviewWriterCapability`；skill 只提供 canonical draft，不直接产出最终 preview。

#### preview 中允许变化的字段

- 预览生成时间，如 `generated_at`
- 仅用于展示的执行环境标记，如 connector 响应中的只读元信息
- 经过标准化后仍可能变化的目标版本快照，如最新 `target_version`

这些字段允许变化，但不能改变 preview 所表达的业务结论。

#### preview 中必须稳定的字段

- canonical draft 对应的业务正文
- 写入目标的业务含义与 target ref
- 用于审批与去重的结构化字段集合
- 将要落入真实写入 payload 的核心内容

稳定性要求：

- 对同一业务输入重复生成 preview 时，除动态字段外，preview 内容必须稳定。
- preview 与真实写入 payload 之间只允许存在动态字段差异，不能出现“预览看到的是 A，真实执行发送的是 B”。
- preview 必须同时满足 `可读` 与 `可审批`：用户应能直接判断 Jira 回写或飞书写入是否符合预期，而不需要再查看底层原始 payload。

#### preview 完整性判断

- Jira 回写 preview 至少应让用户看见将写入哪个 issue / 字段、引用哪个 GitLab 产物、展示什么摘要。
- 飞书写入 preview 至少应让用户看见将写入哪个文档位置、采用什么模板结构、落什么问题/根因/方案/验证内容。
- 若 preview 只包含 hash 或底层字段而不具备人工可读性，则视为不满足任务六的 preview 完整性要求。

### 6.2 preview 版本与审批绑定冻结

任务六第二步冻结 preview 刷新后的版本规则，目标是让审批事实始终绑定到“当前有效 preview”，避免旧 preview 在内容或目标变化后仍被继续用于真实写入。

#### 版本标识

- 每次 preview 生成或刷新都必须得到新的 `preview_ref` 或新的 `preview_hash`。
- `preview_ref` 用于标识当前 preview 实体；`preview_hash` 用于标识本次审批所确认的具体内容版本。
- workflow 在进入真实写入前，必须同时持有“当前有效 preview 的引用”和“审批时确认的 hash”。

#### 审批绑定规则

- 外部写入审批必须绑定 `preview_ref + preview_hash`，而不是只绑定 stage 名称或目标类型。
- 若 preview 因 canonical draft、目标版本、artifact 摘要或模板内容变化而刷新，旧审批必须立即标记为 `superseded`。
- 只有 `当前有效 preview` 对应的审批记录才允许继续参与 execute 前置条件校验。

#### 一致性校验要求

- 真实写入前，workflow 必须重新比对当前 `preview_ref`、`preview_hash` 与审批记录中的绑定值。
- 任一绑定值不一致，都必须视为 preview 版本漂移，不能继续用于真实写入。
- 版本漂移后的唯一允许动作是重新展示 preview 并重新审批，而不是沿用旧批准结果。

#### 失效与恢复约束

- preview 被刷新后，`旧审批失效` 是强约束，不能通过 CLI 模式差异或 resume 路径绕过。
- 从 checkpoint 恢复时，若恢复点之后 preview 已刷新，则恢复逻辑必须把旧审批视为 `superseded`。
- 任意旧 preview 的审批记录都 `不能继续用于真实写入`，即使用户主观上认为“变化不大”也不例外。

### 6.3 execute 前置条件冻结

任务六第三步冻结真实写入的 execute 门禁，目标是让 Jira 与飞书写入只会在审批、版本、一致性、去重与持久化证据全部具备时触发。

#### execute 前置条件

真实写入前必须同时满足以下条件：

- 当前写入对象已经 `审批通过`
- 当前审批绑定的 `preview_ref + preview_hash` 与最新 preview 完全一致，也就是 `preview 一致`
- 目标 marker / target ref 的 `目标查重通过`
- side-effect ledger 已写入 `prepared` 记录，也就是 `账本准备完成`
- 写前恢复边界已经固化，也就是 `checkpoint 已落盘`

#### 四类阻断场景

| 阻断场景 | 缺失或冲突项 | 必须结果 |
| --- | --- | --- |
| `缺审批` | 没有当前有效 preview 对应的 approved 记录 | execute 必须 `被阻止` |
| `preview 不一致` | 当前 preview 与审批绑定 hash 或 ref 不一致 | execute 必须 `被阻止` |
| `重复目标` | marker、target ref 或幂等键命中已存在写入事实 | execute 必须 `被阻止`，并转入去重或对账逻辑 |
| `未落账` | 尚未写入 `prepared` 账本或缺失写前 checkpoint | execute 必须 `被阻止` |

#### 门禁不变式

- execute 不是 approval 的直接副作用；即使 `审批通过`，只要任一前置条件不满足，真实写入也不能发生。
- workflow 不能为了“尽快写出去”跳过 `账本准备完成` 或 `checkpoint 已落盘`。
- 去重检查必须发生在真实写入前，而不是请求发出后补做。

### 6.4 marker、幂等键与去重规则冻结

任务六第四步冻结 Jira 与飞书写入的 marker、`target ref` 与 `idempotency_key` 口径，目标是让 dry-run、resume、record 和主流程在面对同一业务写入请求时都能做出一致去重判断。

#### 去重主键

- `marker`：面向外部目标的业务标识，用于表达“这次写入在对方系统里的语义身份”。
- `target ref`：面向具体目标位置的结构化引用，如 Jira 字段目标或飞书块目标。
- `idempotency_key`：面向本次写入请求的稳定幂等键，必须由 run 无关的业务输入派生，而不是依赖临时进程状态。

#### 统一生成口径

- dry-run 生成 preview 时，就必须得到与真实执行一致的 `marker`、`target ref` 与 `idempotency_key` 候选。
- `resume` 恢复路径不能重新发明一套去重键；必须复用主流程已经冻结的生成规则。
- `record` 命令入口与 `主流程` 命令入口面对相同业务输入时，必须产生同一组去重标识。
- 去重逻辑的判断结果不能依赖“是从哪个命令入口进来的”，而只能依赖统一标识本身。

#### 重复写入约束

- 对同一业务写入请求，若 `marker` 或 `idempotency_key` 已命中既有写入事实，则后续重试、恢复或跨命令入口调用都 `不会产生重复副作用`。
- 若仅目标相同但 canonical draft 已发生业务变化，则必须通过新的 preview 与审批重新确认，而不是偷用旧去重结果放行。
- 去重检查既要覆盖单 run 内重试，也要覆盖跨 run 与 `record`/`resume` 的重复进入。

### 6.5 non-interactive 与 dry-run 语义冻结

任务六第五步冻结 CLI 模式差异，目标是让交互式、`--non-interactive` 与 `dry-run` 在允许动作、失败条件和持久化语义上保持可预测。

#### 交互式与非交互式

- `交互式` 模式允许用户现场查看 preview 并完成人工确认，是默认审批入口。
- `--non-interactive` 模式下，必须显式提供或确认当前 `preview_hash`，否则不能把“无交互”解释成“默认同意”。
- 若 `--non-interactive` 模式提供的 `preview_hash` 与当前有效 preview 不一致，必须立即失败，而不是降级成重新生成后自动放行。

#### dry-run 语义

- `dry-run` 允许读取外部系统与本地仓库信息。
- `dry-run` 允许 preview 生成与展示，也就是 `允许 preview`。
- `dry-run` 明确 `禁止真实写入`，不能触发 Jira 或飞书副作用执行。
- `dry-run` 也不得落成功副作用事实，`成功副作用记录` 只能出现在真实写入后。

#### 模式差异约束

| 模式 | 允许动作 | 失败条件 |
| --- | --- | --- |
| `交互式` | 允许读取、preview、人工审批与在门禁满足后执行真实写入。 | 审批拒绝、preview 失效、execute 门禁不满足。 |
| `非交互式` | 允许读取、preview 校验与在显式确认 `preview_hash` 后执行真实写入。 | 缺少 `preview_hash`、hash 不匹配、execute 门禁不满足。 |
| `dry-run` | `允许读取`、preview、导出结构化结果。 | 一旦请求真实写入或试图记录成功副作用，就必须失败。 |

模式不变式：

- 模式差异只能影响交互方式与是否允许 execute，不能改变 preview、去重或审批绑定的业务真相。
- `dry-run` 不能因为走了完整 preview 流程就被误记为“已经执行成功”。

### 6.6 对账与未知结果收敛规则冻结

任务六最后一步冻结 `outcome_unknown` 场景的对账路径，目标是让写请求发出后结果不明的 run 先对账，再决定是否允许重试或继续阻塞。

#### reconcile 结果枚举

- `confirmed_applied`
- `confirmed_not_applied`
- `still_unknown`

#### 收敛规则

- 遇到 `outcome_unknown` 时，恢复路径必须 `先对账`，不能直接重发。
- 若 reconcile 结果为 `confirmed_applied`，则应补齐成功事实，并禁止再次发送同一副作用。
- 若 reconcile 结果为 `confirmed_not_applied`，则在重新满足前置条件后才可重试，也就是 `可重试`。
- 若 reconcile 结果仍为 `still_unknown`，run 必须继续保持阻塞，不允许盲目重放。

#### 未知结果不变式

- `outcome_unknown` `不会被直接当作失败重放`。
- `outcome_unknown` 也 `不会被错误视为成功`。
- 对账结论必须基于 target 事实、外部系统查询结果或 ledger 证据，而不是仅凭本地主观推断。

## 9. 任务七冻结结果

### 7.1 CLI 命令树冻结

任务七第一步先冻结 v1 CLI 的命令树，目标是让用户从命令名称就能判断行为边界，同时保证快捷入口不会演变成绕过状态机的隐形后门。CLI 仍只负责参数接收、交互和结果展示，不接管 workflow 的状态 ownership。

| 命令组 | 职责边界 | 典型入口 | 不应承载的行为 |
| --- | --- | --- | --- |
| `bind` | 维护项目画像、关系绑定与连接器接入所需的显式配置。 | `bind project`、`bind requirement-rule`、`bind repo-module` | 不直接启动 run，不直接推进审批或外部写入。 |
| `inspect` | 在正式执行前查看配置、连接器健康、run 状态和图谱关系。 | `inspect config`、`inspect connectors`、`inspect run`、`inspect graph` | 不修改业务状态，不生成分析产物。 |
| `run` | 驱动标准八阶段主流程及其审批、补录、preview、execute 操作。 | `run start`、`run resume`、`run approve`、`run preview-write` | 不绕过主流程直接落最终记录，不把快捷补录变成旁路状态机。 |
| `record` | 暴露受控的子工作流快捷入口，用统一状态机完成补录或单项沉淀。 | `record brief`、`record jira-writeback`、`record feishu-note` | 不跳过 preview / 审批 / checkpoint 规则，不直接改写持久化文件。 |

命令树冻结约束：

- 命令树必须围绕 `bind`、`inspect`、`run`、`record` 四组展开，避免按平台或临时脚本继续扩散。
- 每个命令组都 `只负责一种类型的行为`，不能同时承担配置维护、状态推进和副作用执行三类职责。
- 命令组之间 `不与其他命令组重复`；若两个入口能完成同一业务动作，必须明确一个是标准入口、另一个只是语法别名。
- 用户应该 `可以从命令名称直接判断行为范围`，不需要阅读实现细节才能知道是否会修改配置、推进 run 或触发外部写入。
- CLI 命令树的验收口径是：用户可以从命令名称直接判断行为范围。

### 7.2 bind 与 inspect 语义冻结

任务七第二步冻结 `bind` 与 `inspect` 的输入输出语义，目标是让项目配置维护与执行前可观测性成为 CLI 的显式能力，而不是让用户在 run 中途才发现配置缺口或连接器不可用。

#### bind 语义

- `项目绑定` 命令负责创建或更新 `ProjectProfile` 相关配置，包括项目标识、需求规则、repo 映射、连接器引用与审批策略。
- `bind` 的 `输入参数` 必须显式表达要绑定的配置范围、目标项目和更新内容，不能依赖隐式环境推断来改写配置。
- `bind` 的 `输出内容` 至少应包含变更摘要、被影响的配置键、校验结果以及下一步建议动作。
- 若配置缺失关键字段，`bind` 应在提交前直接提示，而不是接受不完整配置后等到 run 失败才暴露问题。

#### inspect 语义

- `连接器检查` 负责展示 Jira、GitLab、飞书及本地 repo 访问入口的健康状态、能力可用性和错误摘要。
- `运行态检查` 负责查看指定 run 的阶段状态、等待原因、当前有效 artifact / preview 引用与允许动作。
- `配置查看` 负责展示当前项目配置的有效值、缺失项与策略摘要。
- `图谱查看` 负责展示 bug、requirement、repo、module、GitLab artifact 与外部目标之间的关系快照。
- `inspect` 的 `输入参数` 需要明确 project、run、scope 与输出模式；其 `输出内容` 必须稳定到足以支持自动化消费或人工排障。

#### 可观测性约束

- `inspect` 的首要目标是让用户在 `正式运行前确认配置问题`，因此至少要能暴露 `配置完整度` 与 `连接器可用性`。
- 对 `bind` 而言，成功写入配置并不代表配置已经可执行；配套的 `inspect` 必须能立即验证新增配置是否满足 run 前置条件。
- `bind` 负责改配置，`inspect` 负责看状态，两者边界不可互换，避免一个命令既改又查导致副作用不透明。
- 配置可观测性的验收口径是：在正式运行前确认配置问题。

### 7.3 run 命令行为冻结

任务七第三步冻结 `run` 命令组的关键入口，目标是让标准主流程中的每个关键动作都有唯一命令入口，并且调用方可以从命令名称看出它是在创建 run、查看状态、提交审批还是补录外部输入。

| 命令 | 输入 | 触发条件 | 输出 |
| --- | --- | --- | --- |
| `run start` | `project_id`、`issue_key`、执行模式参数 | 尚未存在目标 run，且配置可加载 | 新建 run 标识、初始阶段状态、首个 artifact 或等待原因。 |
| `run brief` | `run_id` 或 `project_id + issue_key` | 需要单独查看当前 `Requirement Brief` | 当前有效 brief 引用、摘要与审批状态。 |
| `run resume` | `run_id`、可选 `--checkpoint` | run 已存在且需要从 durable 状态恢复 | 恢复后的当前阶段、等待原因、可执行后续动作。 |
| `run status` | `run_id`、输出模式参数 | 任何已存在 run | 当前阶段、状态摘要、允许动作、等待输入、当前 preview / artifact 引用。 |
| `run approve` | `run_id`、审批对象标识 | 当前阶段处于 `waiting_approval`，且审批对象仍是当前有效版本 | 新的审批状态、下一阶段或待执行状态。 |
| `run revise` | `run_id`、回退目标 | 当前对象允许退回重做 | 失效结果、回退后的阶段状态与下一步。 |
| `run reject` | `run_id`、审批对象标识 | 当前对象处于待审批阶段 | 拒绝结果、run 是否终止、保留的审计摘要。 |
| `run provide-artifact` | `run_id`、GitLab artifact 结构化输入 | 当前阶段为 `Execution`，允许补录外部产物 | 更新后的当前有效 artifact 摘要、是否可继续推进。 |
| `run provide-verification` | `run_id`、verification 结构化输入 | 当前阶段为 `Execution`，允许补录验证结果 | 更新后的 verification 摘要、是否仍需等待其他输入。 |
| `run preview-write` | `run_id`、目标类型、模式参数 | 当前阶段满足写入 preview 生成前提 | 当前 preview 引用、`preview_hash`、审批要求。 |
| `run execute-write` | `run_id`、目标类型、确认参数 | 当前写入对象已通过审批且 execute 前置条件满足 | ledger 更新结果、写入结果摘要或阻断原因。 |

run 命令冻结约束：

- 标准主流程中的创建、恢复、查看、审批、回退、拒绝、补录、预览与执行都必须有 `唯一命令入口`。
- `run` 命令组必须覆盖实施计划列出的关键动作，不能把某些关键阶段留给脚本、手工编辑文件或隐式内部调用。
- 用户推进主流程 `不需要借助隐式操作或手工改文件`，所有状态变化都应通过显式 `run` 子命令完成。
- `run status` 负责可观测，`run approve` / `run revise` / `run reject` 负责审批动作，`run provide-*` 负责补录，命令之间不能用一个入口兼做多类状态迁移。

### 7.4 record 子工作流冻结

任务七第四步冻结 `record` 命令组，目标是提供受控快捷入口来完成特定子工作流，同时继续复用统一状态机、统一 preview 机制与统一审批规则，避免把 `record` 做成旁路。

| 子工作流 | 最小输入 | 补录方式 | 审批要求 |
| --- | --- | --- | --- |
| `仅生成 Requirement Brief` | `project_id`、`issue_key`，以及能完成 intake / context resolution 的最小配置 | 缺失需求映射或上下文信息时，仍通过统一补录渠道补足输入 | 生成的 brief 仍需走分析审批，不能因为是快捷入口就跳过。 |
| `仅回写 Jira` | 已存在的 run 或足以定位目标 issue、当前有效 GitLab artifact、写回目标信息 | 允许通过 `run provide-artifact` 或 `record` 参数补录缺失 artifact / target 信息 | 必须先生成 preview，再走写入审批，最后才允许 execute。 |
| `仅写入飞书记录` | 已存在的 run 或足以形成问题/方案/验证摘要的最小输入、Feishu 目标信息 | 允许补录 verification、Jira 写回结果或文档目标定位信息 | 必须复用飞书 preview 与写入审批，不得直接落正文。 |

record 子工作流约束：

- `record` 只是 `快捷入口`，不是新建一套并行 workflow。
- 三类子工作流都必须复用 `统一状态机`，其阶段推进、checkpoint 与恢复规则不能与主流程分叉。
- `record` 生成的写入动作必须复用 `统一 preview 机制`，不能直接跳到 execute。
- `record` 的审批必须遵守 `统一审批规则`，分析阶段仍绑定 `artifact_ref`，写入阶段仍绑定 `preview_ref + preview_hash`。
- `record` 的验收口径是：它是快捷入口，`不是绕过工作流约束的后门`。

### 7.5 CLI 输出契约冻结

任务七第五步冻结 CLI 的输出契约，目标是让 TTY、人读 JSON 与错误输出都和状态机语义保持一致，使调用方能够稳定消费输出，而不是通过猜测字符串来判断当前 run 状态。

#### 输出通道

- `TTY 输出` 面向人工终端阅读，必须突出当前阶段、摘要、等待原因、下一步建议动作与关键引用。
- `JSON 输出` 面向自动化调用，字段命名必须稳定，避免把人类提示文本当作唯一真源。
- `错误输出` 必须保留标准错误类别、阶段、系统、是否可重试与建议动作，不允许只输出自由文本报错。

#### status --json 最小字段集合

`status --json` 至少需要稳定输出以下字段：

- `run_id`
- `current_stage`
- `run_lifecycle_status`
- `run_outcome_status`
- `run_status`
- `stage_status_map`
- `allowed_actions`，也就是 `允许动作`
- `waiting_reason`，也就是 `等待原因`
- `required_inputs`，也就是 `所需输入`
- `current_artifact_refs`
- `current_preview_ref`，也就是 `当前 preview 引用`
- `current_preview_hash`
- `last_checkpoint_ref`

#### 输出契约约束

- 不论是 `TTY 输出` 还是 `JSON 输出`，都必须能表达核心 `状态字段`，避免展示层和 workflow 真相分离。
- `status --json` 的字段集必须足够支持脚本做 `稳定输出` 消费，而不是依赖表格文本解析。
- 当 run 处于等待态时，输出中必须明确给出 `等待原因`、`所需输入` 与下一步允许动作。
- 当 run 处于写入阶段时，输出中必须能拿到当前 preview 引用、审批状态和 execute 相关门禁摘要。
- CLI 输出的验收口径是：调用方 `不需要猜测内部状态`，仅凭稳定字段就能判断当前 run 还能做什么。

### 7.6 标准演示路径冻结

任务七最后一步把 CLI 的标准演示路径冻结成一条单一路径，确保 v1 能以统一方式向开发者、评审者和后续实现者说明“先做什么、在哪里审批、什么时候 dry-run、什么时候真实写入以及最终如何导出报告”。

#### 标准演示路径

- `bind -> inspect -> run -> approve/revise -> dry-run writeback -> real writeback -> export report`

#### 路径覆盖说明

| 演示环节 | 覆盖能力 |
| --- | --- |
| `bind` | 覆盖项目配置建立、关系绑定与显式配置维护，也就是 `配置` 环节。 |
| `inspect` | 覆盖执行前可观测性、配置完整度与连接器检查。 |
| `run` | 覆盖 intake、上下文解析、需求摘要、代码定位、修复计划与外部补录，也就是 `分析` 与 `补录` 主线。 |
| `approve/revise` | 覆盖分析审批、写入审批与回退重做，也就是 `审批` 分支。 |
| `dry-run writeback` | 覆盖 preview 生成、预览检查与不触发副作用的演练，也就是 `预览` 阶段。 |
| `real writeback` | 覆盖写入 execute、ledger 记录、去重与恢复前置，也就是 `执行` 阶段。 |
| `export report` | 覆盖最终 `BugfixReport` 生成与 `报告导出`。 |

#### 演示路径约束

- 该路径必须是一条 `单一` 主线，避免出现多个彼此不兼容的官方演示顺序。
- 该路径必须 `可重复执行`，也就是同样的输入、同样的审批决策下可以得到同类证据产物。
- 该路径必须 `可验证`，每个环节都能映射到相应命令、状态输出与产物引用。
- 该路径必须能完整覆盖 `配置`、`分析`、`审批`、`补录`、`预览`、`执行` 与 `报告导出` 全链路，才能称为 `v1 标准演示路径`。

#### 任务七后的实现提醒

- CLI 只负责把命令映射到 workflow，用什么命令进入不应改变状态机真相；后续实现时不要让 `record` 命令拥有独立的状态流转分支。
- `bind` / `inspect` / `run` / `record` 的边界已经冻结，后续新增子命令时应先判断它属于哪一组，而不是按平台再拆一棵平行命令树。
- `status --json` 的稳定字段应直接来自 workflow 当前有效态与 checkpoint 引用，不要由 renderer 现场拼凑出另一套状态摘要。
- 标准演示路径已经固定，进入任务八前应围绕这条路径建立报告、追踪矩阵与最终验收清单，而不是再发明新的官方主线。

## 10. 任务八冻结结果

### 8.1 BugfixReport 最小内容冻结

任务八第一步先冻结 `BugfixReport` 的最小内容，目标是让报告成为 run 的统一最终输出，而不是要求调用方回头拼接 brief、修复计划、写回结果和审计摘要来自己复原闭环。

#### BugfixReport 最小内容

`BugfixReport` 至少必须包含以下内容：

- `Bug 基本信息`
- `关联需求`
- `代码定位结果`
- `修复方案摘要`
- `验证结果`
- `GitLab 链接`
- `Jira 回写摘要`
- `飞书记录摘要`
- `审批历史`
- `开放风险`
- `最终状态`

#### 报告收口约束

- `BugfixReport` 必须作为 run 的 `统一最终输出`，由 workflow 收敛最终事实后导出。
- 报告字段必须足以支持复盘、审计与交付验收，不能只保留对开发者本人有意义的局部摘要。
- 报告消费者 `不需要回头拼接多份中间产物`，就能知道该 bug 的背景、修复、验证、写回和剩余风险。
- 若某项信息在本轮未完成，例如需求未绑定或外部写回未执行，报告中也必须显式保留其状态，而不是静默缺省。

### 8.2 需求到测试追踪矩阵冻结

任务八第二步冻结需求到测试的追踪矩阵，目标是让每条 v1 需求和验收场景都能映射到可执行验证路径，并且能够追溯“验证了什么、怎么验证、证据在哪里、失败算什么”。

#### 追踪矩阵最小列

需求到测试追踪矩阵至少应包含以下列：

- `需求/验收场景 ID`
- `对应阶段`
- `测试层级`
- `前置数据`
- `执行动作`
- `预期退出码`
- `预期状态`
- `证据产物路径`
- `失败判定`

#### 追踪矩阵约束

- 追踪矩阵必须支持 `需求覆盖率` 检查，能够直接回答某条需求是否已经被验证。
- 需求文档中的 `所有 v1 验收场景` 都必须 `至少对应一条验证路径`，不能出现需求孤岛。
- 同一条验证路径可以覆盖多个相关约束，但必须明确写出覆盖了哪些需求或场景，不能只留下模糊备注。
- 证据路径必须能落到可检查产物，例如测试输出、artifact、report、preview 或审计记录，而不是仅写“人工确认”。

### 8.3 阶段性测试套件结构冻结

任务八第三步冻结测试套件结构，目标是让测试组织方式能够反映实施顺序和职责边界，既支持“先约束、后流程、再集成”，也避免不同层级测试互相踩边界。

#### 八类测试组织

任务八定义的阶段性测试套件至少应覆盖以下八类：

- `领域模型`
- `持久化与安全`
- `skill`
- `workflow`
- `connector 契约`
- `CLI 集成`
- `需求追踪与指标验证`
- `验收场景`

#### 测试层级分工

- `单元测试` 负责验证局部对象、纯函数和最小不变式。
- `契约测试` 负责验证跨模块边界、结构化输入输出和冻结规则。
- `集成测试` 负责验证 CLI、workflow、connector 和 storage 之间的组合行为。
- `验收测试` 负责验证典型用户场景、标准演示路径和最终交付结果。

#### 结构冻结约束

- 各层测试的职责必须 `分工清楚`，不能让验收测试承担本应由单元或契约测试提前发现的问题。
- 测试结构需要同时覆盖深度和广度，避免出现 `没有重复覆盖或明显缺口` 这一标准被破坏的情况。
- 同一风险点允许被不同层级观察，但必须体现层级差异，例如契约测试查结构、集成测试查联动、验收测试查场景闭环。

### 8.4 成功指标与证据要求冻结

任务八第四步冻结成功指标与证据要求，目标是把“可运行”进一步收敛成“可量化、可复核、可验收”的交付标准，避免只用主观感受描述系统已经可用。

#### 指标清单

任务八至少应统计以下成功指标：

- `首次绑定时长`
- `Requirement Brief 生成耗时`
- `主流程成功率`
- `恢复执行成功率`
- `dry-run 覆盖率`

#### 指标定义维度

- 每个指标都必须明确 `统计口径`
- 每个指标都必须明确 `样本范围`
- 每个指标都必须明确 `阈值门禁`

#### 指标冻结约束

- 成功指标必须 `可采样`，也就是能从 run、checkpoint、审计事件、preview 或报告产物中抽取原始样本。
- 成功指标必须 `可计算`，不能依赖模糊描述或仅凭人工印象打分。
- 成功指标必须 `可复核`，不同评审者基于同一证据应能得到一致或可解释的结果。
- 若某项指标在当前阶段还无法稳定统计，必须明确缺失原因与补齐路径，而不是跳过不写。

### 8.5 最终验收清单冻结

任务八第五步冻结最终验收清单，目标是把 v1 关键场景全部转成可以逐条勾验的收口列表，避免“跑过一个 happy path”就被误认为已经完成交付。

#### 最终验收清单至少覆盖的场景

- `标准主流程`
- `审批分支`
- `配置缺失补录`
- `dry-run 与真实写入`
- `中断恢复`
- `部分成功与重试去重`
- `需求映射歧义`
- `子工作流独立完成`

#### 验收清单约束

- 每个 `关键场景` 都必须有 `明确验收入口`，说明从哪个命令或哪个前置状态开始验证。
- 每个场景都必须定义具体 `验证动作`，不能只写笼统的“执行流程”。
- 每个场景都必须定义对应 `证据要求`，包括状态输出、artifact、preview、report 或审计记录。
- 若某个场景失败，必须能从验收清单中直接定位失败判定和回归范围，而不是重新人工推导。

### 8.6 交付包清单冻结

任务八最后一步冻结交付包清单，目标是把“计划中说要交什么”与“最终实际交什么”逐项对齐，避免出现文档里写了能力但交付物里没有，或交付物存在但没有被纳入验收说明。

#### 交付包最小清单

最终交付至少必须包含：

- `项目画像配置结构`
- `可运行 CLI`
- `八阶段工作流`
- `三类子工作流`
- `结构化 skill`
- `四类适配能力`
- `checkpoint 与账本机制`
- `Requirement Brief`
- `写回 preview 与执行能力`
- `BugfixReport`
- `使用与验收文档`

#### 交付包冻结约束

- 交付包中的每项都必须与实施目标 `逐项对应`，不能只给模糊总述。
- 交付物描述必须同时支持开发者接手、评审者验收与演示者走查，因此交付包需要保持 `完整`。
- 交付包不仅要列出“有什么”，还要说明它如何被检查，所以整体必须 `可验收`。
- 交付包必须能支撑标准演示路径和最终验收清单，因此最终状态应保持 `可演示`。

#### 任务八后的交付提醒

- 任务八完成后，后续实现或评审都应优先围绕 `BugfixReport`、追踪矩阵、验收清单和交付包清单收口，而不是继续发散新的 v1 目标。
- 验收资料的真源应保持一致：追踪矩阵回答“测什么”，测试套件结构回答“怎么组织测”，验收清单回答“怎么判定通过”，交付包回答“最终交什么”。
- 若后续代码实现与这些收口文档出现偏差，应优先更新上游文档或回退实现，而不是在交付阶段临时改口径。
