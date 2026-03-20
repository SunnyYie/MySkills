# Architecture Notes

## v2 任务 3 步骤 4 当前状态语义收敛层

前三步把命令入口都补出来之后，最后一个关键问题是：`run status` 到底能不能准确告诉用户“现在缺什么、下一步做什么、旧 preview 还是否有效”。这一步的价值在于把三个入口从“能调用”收敛成“能被状态机正确解释”。

## 新增/调整文件职责

### `src/app/cli-orchestration.ts`

- 这一轮它除了继续做命令装配，还开始承担“status 引导精确化”的职责。
- `buildStatusSummary` 不再简单地因为 `waiting_external_input` 就把所有补录命令都列出来，而是会根据 `Execution` 当前真正缺失的输入做动作裁剪。
- 这让 CLI status 成为 workflow 的真实投影，而不是一个宽泛但误导的帮助列表。

### `tests/integration/cli/run-record-commands.spec.ts`

- 本轮它验证的不再是单个命令是否存在，而是命令执行后 `status` 是否正确变化：
  - branch 补齐后，不该继续提示 `bind-branch`
  - fix commit 补录后，应该提示重新 preview，而不是继续 approve 旧 preview
- 也就是说，它现在开始保护“状态变化后的用户引导”这一层行为。

## 任务 3 步骤 4 架构洞察

- `waiting_external_input` 只是一个阶段级状态，不够表达“究竟缺什么”。这一步通过 `missingInputs -> allowedActions` 的映射，把 coarse-grained 状态变成了用户可执行的下一步动作，这对 CLI-first 系统尤其重要。

- `run status` 的动作提示变精确之后，`bind-branch`、`ensure-subtask`、`provide-fix-commit` 才真正形成了一个闭环：命令不只是存在，还能在正确的阶段被系统主动引导出来。

- 这一步还确认了一个重要边界：任何会改变 `Artifact Linking` 写回输入的动作，都必须让旧 preview 失效。否则 status 和审批动作就会对已经过期的 preview 产生误导，破坏 `preview -> approve -> execute` 的核心安全原则。

## v2 任务 3 步骤 3 当前 commit 归属录入层

这一步把 “fix commit 属于哪个 issue” 从隐式约定变成了显式命令输入，但仍然只停留在 workflow 输入收集层。它解决的是“如何让 Artifact Linking 拿到 commit 归属事实”，而不是“如何把 commit 真正写回 Jira”。

## 新增/调整文件职责

### `src/cli/run/register.ts`

- 新增 `provide-fix-commit` 命令入口，明确要求 `run id`、`issue key` 和 `commit sha`。
- 这继续遵守 CLI 层只处理参数边界的原则：issue 与 commit 必须由用户显式声明，不在 CLI 层做隐式猜测。

### `src/app/cli-orchestration.ts`

- 新增 `provideCliFixCommit` 后，这个文件开始承担“commit 归属录入会影响 Artifact Linking 预览有效性”的应用逻辑。
- 它除了写入 `git_commit_binding_refs` 之外，还会主动：
  - 清空当前 Jira writeback draft/result
  - 把 `Artifact Linking` 置回 `not_started`
  - 移除该阶段的 active approval
- 这说明 commit 归属不是一个纯附加注释，而是会改变后续写回语义的有效输入。

### `persistCommitBindingArtifact`（位于 `src/app/cli-orchestration.ts`）

- 这个 helper 的职责与 branch/subtask helper 保持对称：
  - 把 commit 归属正文写进 `artifacts/`
  - 只把 `artifact://jira/bindings/commit/<id>` ref 留在 context
- 它让 `git_commit_binding_refs` 真正从“schema 中冻结的字段”变成了可被 run 持久化和恢复的实际指针。

### `tests/integration/cli/run-record-commands.spec.ts`

- 本轮新增断言证明：当用户在 `Artifact Linking` 前后补录 fix commit 时，旧 preview 不能继续被视为有效。
- 这组测试因此不仅验证“命令存在”，还验证“输入变化会让 preview 失效并要求重建”。

## 任务 3 步骤 3 架构洞察

- `provide-fix-commit` 选择把 `Artifact Linking` 重置为 `not_started`，而不是保留 `output_ready`，是一个很关键的安全设计：只要写回输入变了，旧 preview 就不再可信。

- `git_commit_binding_refs` 被设计成数组而不是单值，说明架构上已经为一个 run 关联多个 fix commit 留好了空间；这一步虽然还没做 dedupe，但至少没有把模型锁死成“只能有一个 commit”。

- commit 归属被要求显式传入 `--issue`，体现了当前阶段对 owner 边界的保守选择：在缺少真实 Jira / project profile 装配前，宁可让用户多给一个参数，也不在 workflow 里偷偷推断 subtask 或 bug 归属。

## v2 任务 3 步骤 2 当前子任务预览接线层

这一步的目标不是把 Jira 子任务真正创建出来，而是先为 “ensure-subtask” 建立一个严格受控的入口：只有当 `Execution` 所需输入已经齐备时，run 才能被推进到 `Artifact Linking` 的 preview/approval 状态。这样子任务创建仍然服从统一写回边界，而不会变成一个脱离 workflow 的捷径命令。

## 新增/调整文件职责

### `src/cli/run/register.ts`

- 继续只负责 `run` 命令组的参数入口，本轮新增 `ensure-subtask`。
- 它不直接决定阶段能否跳转，只把 `run id`、可选 `issue key` 和 dry-run 选项转交给 app 层。

### `src/app/cli-orchestration.ts`

- 新增 `ensureCliSubtask` 后，这个文件现在开始承担“显式子任务预览入口”的应用装配职责。
- 关键职责有三层：
  - 先验证 `Execution` 是否已经完成，阻止用户绕过 branch / artifact / verification 的前置收集
  - 再生成本地 subtask preview artifact
  - 最后把 run 推到 `Artifact Linking/output_ready`
- 这一设计让 `ensure-subtask` 既是新的 CLI 入口，又没有绕开既有 checkpoint/context 更新链路。

### `persistSubtaskPreviewArtifact`（位于 `src/app/cli-orchestration.ts`）

- 这是步骤 2 新增的局部 helper，职责非常窄：
  - 把本地预览正文写入 `artifacts/`
  - 生成符合任务 2 ref 契约的 `artifact://jira/subtasks/preview/<id>`
- 它刻意只生成 preview，不生成 result，也不做 dedupe/reconcile，确保职责不越界到任务 4。

### `tests/integration/cli/run-record-commands.spec.ts`

- 这一轮它不只验证命令是否存在，还明确保护两个 workflow 事实：
  - `Execution` 没完成时，`ensure-subtask` 必须失败
  - `Execution` 完成后，`ensure-subtask` 才能留下 `jira_subtask_ref` 并把当前阶段切到 `Artifact Linking`
- 这让集成测试开始覆盖“命令入口”和“阶段门禁”的组合语义，而不是只看 help 输出。

## 任务 3 步骤 2 架构洞察

- `ensure-subtask` 被设计成“生成 preview 并推进到审批前状态”，而不是直接调用已有 `preview-write`，因为它承载的是更高层的业务意图：确保 bug 对应的开发子任务存在。这个命令先把业务意图写进 run state，后续 connector 再决定如何把它翻译成真实 Jira 请求。

- `Execution` 完成校验被放在 app 层而不是 CLI 层，是因为它依赖 run 当前有效态；CLI 只知道参数是否齐全，不知道 workflow 是否允许进入下一阶段。

- `jira_subtask_ref` 在这一步开始真正承载 preview ref，而不是仅仅存在于 schema 中。这意味着任务 2 冻结的字段第一次变成了“有实际业务含义的状态指针”，后续任务 4 可以直接围绕这个指针扩展 execute/result/dedupe，而不用重新发明入口。

## v2 任务 3 步骤 1 当前 CLI / workflow 接线层

任务 3 的第一个落点不是“真实 Jira branch 绑定”，而是先把 branch 作为一个受控、可恢复、可审计的 workflow 输入接进来。这个阶段解决的是：用户如何显式声明“当前开发分支属于这个 bug”，以及 run 怎样把这条输入稳定地纳入 `Execution -> Artifact Linking` 之间的等待语义。

## 新增/调整文件职责

### `src/cli/run/register.ts`

- 继续作为 `run` 命令组的入口注册表，本轮新增 `bind-branch` 子命令。
- 这里的职责仍然只限于参数面：
  - 要求 `--run`
  - 要求 `--branch`
  - 允许可选 `--issue`
- 它不解析 issue key 来源，也不直接改 run state；真正的业务语义仍下沉到 app/workflow。

### `src/app/cli-orchestration.ts`

- 本轮新增 `bindCliRunBranch`，让 CLI 入口第一次具备“把 branch 绑定写进 run”的能力。
- 这一层承担三件事：
  - 从显式参数或现有 run 上下文中解析 bug issue key
  - 生成本地 branch binding artifact，并返回符合 domain 契约的 branch binding ref
  - 复用 `updateRun + recordExecutionExternalInputs` 更新当前有效态
- 关键点在于它没有自行维护第二套状态机，而是继续复用现有 checkpoint / context 持久化路径，所以 branch 绑定天然继承了恢复与审计语义。

### `src/workflow/execution.ts`

- 这一轮从“Execution 等待 GitLab artifact 与 verification”升级为“Execution 等待所有进入 Artifact Linking 前必需的外部输入”。
- `branch_binding` 被并入 `ExecutionExternalInputKey` 后，这个文件开始正式定义：
  - branch 什么时候算缺失
  - 缺失时 `waiting_reason` 怎么表达
  - branch 补齐后何时还能继续等其他输入，何时才真正完成 `Execution`
- 这使 `Execution` 阶段不再只关心“代码改完没”，而是关心“后续 Jira 关联写回所需的最小前置输入是否已齐备”。

### `tests/unit/execution/execution.spec.ts`

- 现在不再只是验证 artifact / verification 的等待语义，而是成为任务 3 步骤 1 的 workflow 契约锁：
  - 三类外部输入同时缺失时的等待原因
  - 只缺 branch 时的单独等待原因
  - branch 补齐前后 `Execution` 的完成边界

### `tests/integration/cli/run-record-commands.spec.ts`

- 本轮开始保护 CLI 面与 workflow 语义的一致性：
  - `run` help 中能看到 `bind-branch`
  - `record jira` 初始化出的等待原因必须包含 branch 缺口
  - 调用 `run bind-branch` 后，context 中必须留下 `git_branch_binding_ref`
- 这组测试证明新命令不是“只注册了名字”，而是真正接通了 run state。

### `tests/integration/cli/writeback-flows.spec.ts`

- 虽然它不是为步骤 1 新建的测试，但它在这一步承担了重要回归角色：
  - 证明 `jira_writeback_only` 子流程在新前置条件下仍然可跑通
  - 逼迫我们把 branch 绑定纳入真实集成流，而不是只让单测通过

## 任务 3 步骤 1 架构洞察

- `run bind-branch` 之所以写进 `Execution` 的等待输入，而不是直接把 run 推到 `Artifact Linking`，是因为 branch 在这里更像“后续写回所需的前置事实”，不是已经执行完成的 Jira 写回结果。这样可以保持“输入收集”和“真实副作用执行”之间的边界。

- branch 绑定被持久化成独立 artifact，同时 `context.json` 只保存 `git_branch_binding_ref`，延续了任务 2 的总体原则：当前有效态只保存索引/ref，不把可读正文和原始 payload 直接塞回上下文。

- `recordExecutionExternalInputs` 被继续复用而不是新建一套 `recordBranchBinding` 状态机，说明当前架构选择把“Execution 阶段的所有外部输入”收敛到一个 owner 中。这样后续 `provide-fix-commit` 如果也需要影响 Execution/Artifact Linking 的衔接，可以优先复用这条路径，而不是再分叉出新的等待语义实现。

## v2 任务 2 当前契约与承载边界层

任务 2 完成后，v2 第一优先级新增能力终于有了稳定的运行态落点，但仍然严格停留在“契约冻结”层。这个阶段解决的是“哪些 key/ref 会进入当前有效态、哪些正文必须留在 artifact、哪些幂等与执行元数据必须进 ledger”，而不是提前实现 CLI 入口或真实 Jira 写回。

## 新增/调整文件职责

### `src/domain/schemas.ts`

- 继续作为 domain 契约中心，这一轮新增了两类职责：
  - 为 `ExecutionContext` 补齐 v2 新字段
  - 为 v2 新字段与 Jira 新 side effect 定义更细的 schema
- `active_bug_issue_key` 被建模成 nullable key，而不是直接复用 Jira snapshot artifact，是为了让 workflow/CLI 在不展开 snapshot 正文的前提下就能快速判断当前 bug 上下文。
- `jira_subtask_ref`、`jira_subtask_result_ref`、`git_branch_binding_ref`、`git_commit_binding_refs` 不再只是“随便一个字符串 ref”，而是被收紧到明确前缀：
  - `artifact://jira/subtasks/preview/<id>`
  - `artifact://jira/subtasks/result/<id>`
  - `artifact://jira/bindings/branch/<id>`
  - `artifact://jira/bindings/commit/<id>`
- 新增 `JIRA_V2_SIDE_EFFECT_OPERATIONS` 与 `JiraV2SideEffectLedgerEntrySchema`，让 `jira.create_subtask`、`jira.bind_branch`、`jira.bind_commit` 在 domain 层就拥有稳定命名与 `result_ref` 类型匹配规则，而不是等到 connector 层才临时解释。

### `src/domain/enums.ts`

- 继续承载跨层共享常量，但本轮从“纯枚举表”进一步承担“物理承载边界说明”：
  - `EXECUTION_CONTEXT_STORAGE_PROJECTION.context` 明确 v2 新字段已进入 `context.json` allowlist
  - `V2_RUNTIME_FIELD_CARRIERS` 明确每一类数据该落在哪个物理平面
- 这让 domain 层不只定义“字段叫什么”，还定义“这些字段为什么能安全存在于当前有效态里”。

### `src/app/run-lifecycle.ts`

- 继续是 run 初始化的应用装配层。
- 本轮只补默认态，不新增行为：
  - `active_bug_issue_key: null`
  - `jira_subtask_ref: null`
  - `jira_subtask_result_ref: null`
  - `git_branch_binding_ref: null`
  - `git_commit_binding_refs: []`
- 这样做的关键价值是向前兼容：任务 2 之后创建的新 run 从第一刻起就满足 v2 契约，不需要等任务 3/4 再做“补字段迁移”。

### `src/workflow/state-machine.ts`

- 任务 2 没有新增 workflow 入口，但它已经影响 rollback 的“该清什么”。
- 本轮把 v2 新 ref 接进 `STAGE_OUTPUT_RESETS`，说明这些字段虽然存在于 `ExecutionContext`，依然是“阶段产物指针”，必须随着回退被清理：
  - 回退到 `Context Resolution` 时，`active_bug_issue_key` 失效
  - 回退到 `Artifact Linking` 时，subtask / branch / commit 绑定 ref 失效
- 这能保证后续任务 3/4 加入真实 preview/execute 后，不会因为旧 ref 留在 context 里而造成恢复歧义。

### `tests/unit/domain/contracts.spec.ts`

- 现在不只验证“对象字段存在”，还开始承担 v2 契约冻结器角色：
  - 上下文字段默认态
  - artifact ref 前缀
  - v2 Jira ledger operation
  - `context.json / artifacts / side-effects.ndjson` 边界
- 这组测试已经成为任务 2 的主防线，后续如果有人把 payload 正文重新塞回 context，或者把 branch/commit ref 前缀混用，这里会第一时间报警。

### `tests/unit/storage/persistence-foundation.spec.ts`

- 继续守住 storage allowlist，但现在明确知道 v2 新字段已经是 `context.json` 的合法成员。
- 它的职责不是验证 ref 语义本身，而是验证“这些字段一旦进入有效态，就允许被安全持久化；正文仍然不允许”。

### `tests/unit/app/run-lifecycle.spec.ts`

- 现在保护 run 初始化不会漏掉 v2 新字段，避免出现“domain 契约更新了，但初始化 run 还是旧形状”的隐性回归。

### `tests/unit/workflow/state-machine.spec.ts`

- 现在保护 rollback 后 v2 ref 被清空的事实，避免未来接入真实 `ensure-subtask`、`bind-branch`、`provide-fix-commit` 时遗留过期 binding pointer。

### `tests/unit/execution/execution.spec.ts`

- 本轮只是跟进 `ExecutionContext` 新契约，让 Execution 外部输入逻辑继续建立在完整的有效态对象之上，不提前消费 v2 新字段。

### `tests/unit/jira-writeback/jira-writeback.spec.ts`

- 当前仍然测试 v1 Jira 写回流程，但通过同步 `ExecutionContext` 契约，保证旧链路可以和 v2 新字段共存，不会因为 schema 收紧而被动破坏。

### `tests/unit/feishu-writeback/feishu-writeback.spec.ts`

- 作用与 Jira 写回测试类似：它不实现 v2 新能力，但证明新的运行态契约不会把既有 Feishu 链路挤坏。

### `tests/unit/report/report-writer.spec.ts`

- 继续保护 `BugfixReport` 从“当前有效态 + ref”组装，而不是重新依赖原始正文对象；这和任务 2 强调的 key/ref 边界是一致的。

## 任务 2 架构洞察

- `active_bug_issue_key` 的引入，实际上把“当前 bug 是谁”从 heavyweight snapshot 中拆成了 lightweight 索引字段。这样 CLI/status/workflow 在很多分支上都不需要展开 artifact 才能决策。

- `jira_subtask_ref` 和 `jira_subtask_result_ref` 被拆成 preview/result 两个 ref，而 branch/commit 只保留 binding ref，是一个刻意的不对称设计：
  - subtask 创建本身有明确 preview -> execute 双态
  - branch/commit 在当前计划里更像“开发关联写回记录”
  这为任务 4 留下了足够空间，同时避免任务 2 过早发明不必要的中间对象。

- `V2_RUNTIME_FIELD_CARRIERS` 放在 domain 常量而不是文档注释里，能把“架构洞察”变成可测试约束。后续任何人如果想把 `request_payload` 直接塞回 `context.json`，不仅会违反文档，也会立刻打红测试。

- rollback reset 的最小接线很重要：即使这轮没有新命令入口，只要一个字段已经进入 `ExecutionContext`，就必须同时定义它何时失效，否则恢复语义会从第一天起就不完整。

## v2 任务 1 当前配置与检查层

任务 1 完成后，`ProjectProfile` 不再只是 v1 的静态绑定集合，而是开始承载 Jira 子任务创建规则、branch / commit 绑定目标规则，以及 GitLab branch 绑定输入模式。这个阶段仍然严格停留在“配置表达与配置检查”层，不提前实现真实 workflow、artifact 或外部写回。

## 新增/调整文件职责

### `src/domain/schemas.ts`

- 把 v2 任务 1 需要的最小配置字段收敛到 domain 层：
  - `jira.subtask`
  - `jira.branch_binding`
  - `jira.commit_binding`
  - `gitlab.branch_binding`
- 用 nested object 明确“规则对象”和既有字段的 owner 边界，避免把 branch 命名规则、branch 输入方式、Jira 绑定目标这些概念揉进同一个扁平字段表。
- 同时用 required / optional 的划分表达最小闭环：
  - 必填字段只覆盖任务 1 真正要检查的输入
  - 可选字段只表达未来 connector / workflow 会消费的补充策略，不在当前阶段偷跑执行语义

### `src/skills/config-loader/index.ts`

- 继续担任“项目画像完整性检查”的唯一入口，但现在会把 v2 任务 1 的新增字段一并纳入：
  - required field 检查
  - section schema 校验
  - `bind jira` / `bind gitlab` 写入时的 payload 约束
- 这层只回答“配置能不能用、缺什么、哪里不合法”，不决定 CLI 怎么提示，也不承担 workflow fallback。

### `src/app/project-profile.ts`

- 继续作为 CLI `bind` / `inspect` 与 config-loader 之间的应用装配层。
- 新增 `guidance` 聚合，把 `inspect config` 的缺失项和问题路径按 `bind` 命令 owner 归类，让 CLI 输出更接近开发者真正的补录动作。
- 把 `inspect connectors` 的 Jira / GitLab readiness 与新字段对齐，避免“config 检查说不完整，但 connector 健康仍显示 ready”的语义分叉。

### `tests/unit/config/config-loader.spec.ts`

- 锁定 v2 任务 1 的最小 schema 契约：
  - Jira 子任务/branch/commit 规则缺失时必须显式报错
  - GitLab branch binding 输入模式缺失或非法时必须显式报错
  - 完整配置时仍能正常归一化并加载
- 这组测试主要保护 config semantics，不直接测试 CLI 命令面。

### `tests/integration/cli/config-commands.spec.ts`

- 锁定 CLI 对 v2 新配置字段的暴露方式：
  - `bind jira` / `bind gitlab` 会拒绝缺少新规则的旧式 payload
  - `inspect config` 会输出面向 `bind` 命令的 `guidance`
- 这组测试确保“domain / config-loader 的新规则”真正传递到了用户可见的 CLI 行为。

### `tests/milestones/document-consistency.spec.ts`

- 本轮没有改变它的断言目标，只修复文档读取入口，使其兼容当前 `memory-bank/features/v1/` 的文档布局。
- 它的角色仍然是里程碑层的文档一致性守门员，而不是任务 1 的业务逻辑测试。

## 任务 1 架构洞察

- 任务 1 最关键的拆分是把“branch 怎么命名”和“branch 从哪里拿”分成两个独立职责：
  - `gitlab.branch_naming_rule` 继续负责命名策略
  - `gitlab.branch_binding.input_mode` 新增负责输入采集策略
  这样后续 CLI `run bind-branch` 才不会把“当前分支 / 显式输入”与“命名约束”混成一个字段。

- `jira.subtask`、`jira.branch_binding`、`jira.commit_binding` 采用分组对象，而不是继续扩展 `writeback_targets`，是为了让“普通 Jira 写回目标”和“v2 新增开发关联规则”保持语义隔离。后续任务 3/4 需要 preview / execute / dedupe 时，可以直接围绕这些对象扩展，而不用从通用 comment/field 目标里反推业务意图。

- `guidance` 被放在 app 层而不是 config-loader 层，是为了保持 owner 清晰：
  - domain/schema 决定字段长什么样
  - config-loader 决定配置是否合法
  - app/CLI 决定怎样把问题翻译成开发者下一步动作

- 任务 1 依旧没有进入 workflow / side-effect 语义；这能保证任务 2 之后新增 `ExecutionContext`、artifact ref、ledger operation 时，是建立在稳定配置源之上，而不是一边发明运行时字段，一边回头修改配置模型。

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

## 任务 13 当前 Feishu preview / append 写入层

任务 13 完成后，仓库里第一次把 Feishu 记录从“domain 里已有 draft/result 占位”落成了和 Jira 对称的 preview / execute 纯契约链路。这个阶段仍然不触发真实飞书网络写入，只负责把 append 目标解析、preview 生成、审批绑定、requirement binding 阻塞、ledger 顺序和去重跳过规则固定下来。

## 新增文件职责

### `src/domain/schemas.ts`

- 在既有 Feishu draft/result 契约上补齐任务 13 需要的 execute 衔接字段，而不是再发明一套平行的“Feishu preview DTO”。
- `FeishuRecordDraftSchema` 现在显式承载 `target_ref`、`request_payload_hash`、`dedupe_scope`、`expected_target_version`，让 Feishu preview 和 Jira preview 一样，既能给人审批，也能直接衔接 execute 输入与副作用账本。
- `FeishuRecordResultSchema` 现在显式承载 `already_applied`、`external_request_id`、`updated_at`，为 append 去重、恢复 reconcile 和“部分成功后只重试失败阶段”提供统一输出面。
- 同时补出 `FeishuRecordDraft`、`FeishuRecordResult` type export，避免 connector 与 workflow 自己复制类型定义。

### `src/infrastructure/connectors/feishu/index.ts`

- 这是任务 13 新增的 Feishu connector 纯映射层。
- `buildFeishuRecordPreviewDraft()` 负责把项目画像中的飞书目标位置、Jira issue 摘要、需求绑定状态、GitLab 产物、验证结果 ref、根因摘要和修复计划收敛成稳定 preview draft：显式生成 `target_ref`、append marker、`rendered_preview`、`request_payload_hash`、`idempotency_key` 与 `dedupe_scope`。
- preview 文案里会在 requirement 未绑定且项目允许继续时显式写出“未绑定需求”，把需求文档的弱约束策略前移成稳定输出，而不是留给调用方补一句提示。
- `createFeishuExecuteResult()` 与 `createFeishuAlreadyAppliedResult()` 把正常写入结果与“marker 查重发现已经追加过”的结果都折叠为统一 `FeishuRecordResult`，让 workflow 不必理解飞书响应细节。

### `src/infrastructure/connectors/index.ts`

- 在既有 Jira connector 之外新增 Feishu connector 的公共导出。
- 继续保持 infrastructure 公共面聚合职责，避免上层开始手写 `feishu/index.ts` 的深路径依赖。

### `src/workflow/feishu-writeback.ts`

- 这是任务 13 的 Feishu writeback 纯规则层，也是本轮最核心的新文件。
- `createFeishuRecordPreviewState()` 负责刷新当前有效 preview：更新 `feishu_record_draft_ref`、清空旧 `feishu_record_result_ref`、重算 `previewHash`、把 `Knowledge Recording` 拉回 `output_ready`，并使旧的活跃审批失效。
- `buildFeishuRecordApprovalRecord()` 把审批记录固定绑定到 `preview_ref + preview_hash`，确保 append 写入也遵守“审批只针对当前 preview 版本”的纪律。
- `guardFeishuRecordRequirementBinding()` 把 requirement binding 强约束阻塞点明确放在真实 Feishu execute 之前；如果项目是弱约束，它不会阻断 preview / execute 链路，而是依赖 preview 中的“未绑定需求”显式化。
- `buildFeishuRecordPreparedEntry()`、`markFeishuRecordEntryDispatched()`、`finalizeFeishuRecordEntry()` 把 Feishu append 的 `prepared -> dispatched -> terminal` ledger 顺序收敛为显式规则，保持与 Jira 对称。
- `shouldSkipFeishuRecordExecution()` 把 dry-run 和已终态/已对账 append 的去重规则收敛为统一判定，防止恢复或重试时重复追加同一条记录。

### `src/workflow/index.ts`

- 在既有 state machine、execution、jira-writeback 规则之外，新增对 `feishu-writeback.ts` 的公共导出。
- 保持 workflow 层统一公共面，让 app、CLI 和测试继续只依赖一个稳定入口。

### `tests/unit/feishu-writeback/feishu-writeback.spec.ts`

- 任务 13 的核心单元测试。
- 锁定六个最小闭环：preview draft 生成、requirement binding 强约束阻塞与弱约束“未绑定需求”显式标记、preview 刷新与旧审批失效、approval preview 绑定、append ledger 顺序、dry-run 与已写入去重边界。
- 这组测试让任务 13 的行为有了独立落点，而不是把 Feishu 规则混进 Jira 或 domain 回归里一起“顺便验证”。

### `tests/unit/domain/contracts.spec.ts`

- 在既有 domain 契约测试中补上 Feishu draft/result 的字段回归。
- 它负责防止后续把 `target_ref`、`request_payload_hash`、`dedupe_scope`、`already_applied`、`external_request_id` 等恢复与幂等关键字段退化回“调用方自己拼”的弱约束形态。

## 任务 13 架构洞察

- 任务 13 延续了任务 12 的 owner 划分，但 Feishu 比 Jira 多了一层 append 语义，所以这一步最重要的不是“再写一套对称代码”，而是把 append marker、target 解析和 `already_applied` 结果表达成一等公民。这样恢复逻辑以后就能靠标准结果和 ledger 做判断，而不是靠字符串搜索历史文档内容。
- Feishu preview 里显式携带“未绑定需求”不是展示细节，而是策略落点：弱约束项目允许继续写，但必须把未绑定事实写进知识沉淀物本身。把这件事放在 connector 生成 preview 时完成，能避免 CLI、renderer 或未来真实 execute 入口各自补文案导致漂移。
- `target_ref` 和 `dedupe_scope` 被提升为 Feishu draft 的必填字段后，Feishu 的 preview / approval / execute / reconcile 终于和 Jira 使用同一套中间态模型。这意味着后续 task 14 的 report 和更后面的 storage/CLI 接线可以按统一方式消费“外部写回草稿”和“外部写回结果”。
- 本轮仍然没有接真实飞书 API、checkpoint 或 side-effects 落盘，是刻意保持小步闭环：先把 append 语义、审批绑定和去重规则冻结，再把这些纯规则接到真实 I/O；这样能在进入任务 14 前先确保 Feishu 链路的架构边界已经稳定。

## 任务 14 当前统一报告与导出层

任务 14 完成后，仓库第一次拥有了面向“整个 run 最终结果”的统一输出面。`BugfixReport` 不再只是 domain 里的静态 schema，而是有了明确的 skill owner 和 renderer owner：skill 负责把最终 `ExecutionContext`、审批历史和外部结果摘要收敛成一份标准报告；renderer 负责把这份报告映射到 CLI、Markdown、JSON 三种输出，而不是各处重复拼装摘要。

## 新增文件职责

### `src/skills/report-writer/index.ts`

- 这是任务 14 新增的报告组装 skill，也是本轮最核心的新文件。
- `createBugfixReport()` 负责从最终 `ExecutionContext`、审批历史、验证摘要、开放风险和外部结果摘要中，生成标准 `BugfixReport`。
- 该文件把“哪些字段来自当前有效态、哪些字段要被压平成最终摘要、哪些失败语义要在 `failure_summary` 中显式表达”集中到一个地方，避免 app / CLI / renderer 各自写一套报告拼装逻辑。
- `jira_writeback_summary`、`feishu_record_summary`、`external_outcomes` 和 `failure_summary` 都在这里按最终 run 状态做统一归约，因此 success、partial_success、failed、cancelled 的差异语义不会漂移到下游展示层。
- 该 skill 继续遵守前面任务建立的边界：消费的是 ref、摘要和结构化对象，而不是重新内嵌高敏感原始 payload、checkpoint 历史或错误长正文。

### `src/skills/index.ts`

- 在既有 skill 公共面中新增 `report-writer` 导出。
- 保持 skill 层统一入口，让后续 app / CLI 按同一模式消费 report writer，而不需要深引内部实现路径。

### `src/renderers/report.ts`

- 这是任务 14 新增的统一报告 renderer。
- `renderBugfixReportCli()` 负责把 `BugfixReport` 压平成面向终端查看的分段文本，确保 CLI 场景能直接看到最终状态、写回摘要、审批历史、开放风险和 failure summary。
- `renderBugfixReportMarkdown()` 负责生成适合知识沉淀和文档归档的 Markdown 版本，但仍然只消费标准 `BugfixReport`，不重新推断业务事实。
- `renderBugfixReportJson()` 负责输出最完整、最稳定的结构化 JSON 版本，作为“同一份报告事实”的无损导出通道。
- 三种输出都先通过 `BugfixReportSchema` 校验，是为了保证 renderer 不会绕过 domain 契约吞下半结构化对象。

### `src/renderers/index.ts`

- 在既有 `requirement-brief` renderer 之外新增对 `report.ts` 的公共导出。
- 继续保持 renderer 层统一公共面，避免未来 CLI 或测试开始深引具体渲染文件。

### `tests/unit/report/report-writer.spec.ts`

- 任务 14 的核心单元测试。
- 锁定三类最小闭环：成功 run 的最终报告组装、`partial_success` / `failed` 的差异化 `failure_summary` 与写回摘要、以及 CLI / Markdown / JSON 三种导出对同一份报告事实的映射一致性。
- 这组测试把报告层行为单独固定下来，避免后续在接 CLI 命令时才发现“同一个 run 在不同输出渠道里讲了不同的话”。

## 任务 14 架构洞察

- 任务 14 最重要的 owner 收敛，是把“最终报告怎么组装”交给 skill，把“最终报告怎么展示”交给 renderer。这样任务 15 去接 CLI 命令时，只需要决定何时调用哪一个公共入口，而不用在命令处理器里重新定义报告字段。
- 报告层没有回退成“直接读取所有中间工件再现场拼装”，而是继续建立在 `ExecutionContext` 当前有效态、审批历史和外部结果摘要之上，这延续了任务 2/3 建立的物理边界纪律：最终输出消费的是 ref 和摘要，不重新打破 redaction / storage 约束。
- `failure_summary`、`jira_writeback_summary` 和 `feishu_record_summary` 被放进同一个 skill 统一生成，是为了防止 partial_success / failed / cancelled 这些跨阶段语义在不同输出渠道里各自解释。报告层应表达 run 结果，而不是让 CLI 或 Markdown 模板各自“猜一次最终状态”。
- JSON、CLI、Markdown 三种导出共享同一份 `BugfixReport`，意味着后续无论是 CLI 查看、文件导出还是知识沉淀，都能围绕同一个事实源展开；这会显著降低任务 15 接线时的重复实现和口径漂移风险。

## 任务 15 当前 CLI 命令面与子工作流接线层

任务 15 完成后，仓库第一次把“已有 workflow / storage / report 基础能力”接到了统一 CLI 命令树上。这个阶段的重点不是提前把所有业务都做成端到端自动化，而是先把 `bind`、`inspect`、`run`、`record` 四组命令的 owner 固定下来，并让主流程入口、子工作流入口、状态查看与恢复路径都有稳定的 app 层接缝和持久化语义。

## 新增与变更文件职责

### `src/app/cli-orchestration.ts`

- 这是任务 15 新增的 app 层 CLI 编排文件，也是本轮最核心的新文件。
- 它负责把 CLI 命令层真正接到已有的 run lifecycle、workflow 纯规则和 storage 持久化语义上：包括 `run start` / `run brief` 的 run 初始化、`record jira` / `record feishu` 的最小子工作流 run 创建、`run status` / `run resume` 的共享状态与恢复视图，以及审批、回退、Execution 补录、preview / execute 的最小命令接线。
- 文件里最关键的职责不是“实现业务推理”，而是把“命令触发一次要怎么读写当前有效态和 checkpoint”集中到 app 层，避免 CLI 命令处理器直接去拼 `ExecutionContext`、checkpoint 和 artifact 文件。
- `applyRunModePreset()` 明确把 `brief_only`、`jira_writeback_only`、`feishu_record_only` 三种子工作流映射成统一 `ExecutionContext` 事实：不适用阶段标记为 `skipped`，`record jira` 从 `Execution` 的外部输入等待态起步，保证子工作流仍然走同一套状态机语义，而不是走 CLI 私有捷径。
- `persistUpdatedContext()` 与 `buildCheckpoint()` 把“命令改变当前有效态后必须同步写 durable checkpoint”这件事固定下来，确保 `run resume` 仍然建立在 checkpoint 而不是临时内存态之上。

### `src/app/index.ts`

- 在既有 bootstrap / project-profile / run-lifecycle / use-case 公共面之外，新增对 `cli-orchestration` 的导出。
- 继续保持 app 层统一公共入口，让 CLI 与测试都通过 `src/app` 依赖应用装配能力，而不是直接跨文件抓内部细节。

### `src/cli/shared.ts`

- 这是任务 15 新增的 CLI 输出共用文件。
- `emitCliPayload()` 统一处理 TTY/JSON 输出与 `--output <path>` 文件落点，避免 `run`、`record`、`bind`、`inspect` 之后每组命令各自维护一套“怎么写 stdout、怎么写输出文件”的分叉逻辑。
- 这个文件的存在让 CLI 层继续只关注“用户要看什么样的结果”，而不是在每个命令里重复拼序列化与文件写入细节。

### `src/cli/run/register.ts`

- 这是任务 15 新增的 `run` 命令注册层。
- 它把技术方案中列出的主流程命令全部显式注册出来：`start`、`brief`、`resume`、`status`、`approve`、`revise`、`reject`、`provide-artifact`、`provide-verification`、`preview-write`、`execute-write`。
- 该文件的核心职责是“命令面映射”，不是业务实现：它负责声明参数、统一挂接 `--json` / `--dry-run` / `--non-interactive` / `--output` / `--checkpoint`，然后把动作委托给 app 层的 `cli-orchestration`。
- 这样可以把“命令长什么样”和“命令如何改变 run”拆开，让后续任务 16 做回归时，可以分别验证命令树契约和应用编排语义。

### `src/cli/record/register.ts`

- 这是任务 15 新增的 `record` 子工作流命令注册层。
- 它只暴露 `record jira` 和 `record feishu` 两个官方入口，显式避免 `record brief` 这类与技术方案冲突的旁路命名。
- 文件通过 app 层把 `record` 收敛为“创建最小 run 的快捷入口”，而不是绕过 workflow；后续审批、状态查看、恢复、preview / execute 仍然复用统一 `run` 生命周期。

### `src/cli/program.ts`

- 在既有 `bind`、`inspect` 命令注册基础上，新增 `run` 与 `record` 的注册。
- 这使 `createProgram()` 再次成为完整 CLI 命令树的唯一装配点，防止命令分组在不同入口被分散初始化。

### `tests/integration/cli/run-record-commands.spec.ts`

- 这是任务 15 新增的 CLI 集成测试。
- 它锁定三类最小闭环：顶层命令树和子命令可达性、`run brief` 与 `record jira` 的唯一归属及其 run mode / stage 初始化、以及 `run status` / `run resume` 对共享恢复语义的输出稳定性。
- 这组测试的重点不是把任务 16 的所有验收场景提前做完，而是先保证“命令树存在、入口归属正确、最小状态语义稳定”。

## 任务 15 架构洞察

- 任务 15 最重要的 owner 收敛，是把 CLI 真正分成了“注册层”和“应用编排层”两段：`src/cli/*/register.ts` 只定义命令树与参数面，`src/app/cli-orchestration.ts` 才负责读写 run 和 checkpoint。这样能避免 CLI 再次退化成“直接改 JSON 文件的胖命令处理器”。
- `record` 被实现成“最小 run 初始化”的快捷入口，而不是直接触发 Jira/Feishu 写回，是这一步最关键的边界保护。这样子工作流依然共享相同的 checkpoint、恢复、审批与 stage status 语义，符合需求文档和技术方案里“不绕过 workflow”的要求。
- `brief_only` / `jira_writeback_only` / `feishu_record_only` 的 preset 都收敛在 app 层，而没有散落在各个 CLI 命令处理器里。这让“哪些阶段应该 `skipped`、哪些阶段应该从 `waiting_external_input` 起步”成为一处可测的事实，而不是多个命令分支里的隐含约定。
- 当前 preview / execute 在 CLI 侧只落最小 preview/result artifact 与 checkpoint，同步固定了命令边界，但没有提前越权去实现任务 16 的验收矩阵或真实外部副作用编排。换句话说，任务 15 的价值是先把入口和语义钉住，而不是假装端到端问题已经全部解决。

## 任务 16 当前端到端回归与文档同步层

任务 16 完成后，仓库第一次把“实现是否完整”这件事收敛成了可执行资产，而不是散落在 `progress.md` 里的人工说明。这个阶段的重点不是新增业务能力，而是把任务级、任务组级、里程碑级三层验证结构钉住，让 16 个任务、8 个验收场景、5 个里程碑门槛，以及需求/方案/计划/AGENTS 的术语一致性都能被 CI 风格的命令重复验证。

## 新增与变更文件职责

### `tests/acceptance/task16-regression-coverage.spec.ts`

- 这是任务 16 的主验收测试，也是本轮最核心的新文件。
- 它不直接模拟某一个业务阶段，而是验证“验证体系本身”：检查 `tests/README.md` 是否声明三层结构、`package.json` 是否暴露 `test:milestones`、`tests/milestones/regression-plan.json` 是否为 16 个任务和 8 个验收场景都提供了最小可执行入口。
- 这个文件把“回归缺口”变成了显式失败条件，避免未来只补实现、不补测试映射时没有任何报警。

### `tests/milestones/regression-plan.json`

- 这是任务 16 新增的测试追踪矩阵事实源。
- 文件集中记录三类信息：任务 1-16 到测试文件的映射、需求文档 8 个验收场景到测试路径的映射、以及 5 个里程碑的 coverage/gate/coversTasks 定义。
- 它还显式保存任务 16 的已知假设，例如“标准主流程当前通过跨模块测试链路证明，而不是伪造一个未实现的全自动单命令入口”，让后续维护者能区分既有能力边界和未来扩展方向。

### `tests/milestones/milestone-regressions.spec.ts`

- 这是任务 16 的里程碑门禁测试。
- 它负责验证 5 个里程碑是否递进、是否没有跳级，以及最终里程碑是否覆盖任务 1 到 16。
- 这个文件的价值不在于执行业务逻辑，而在于冻结“我们如何宣称一个阶段完成”的回归口径，防止里程碑定义随进度漂移。

### `tests/milestones/document-consistency.spec.ts`

- 这是任务 16 的文档一致性执行器。
- 它读取 `memory-bank/需求文档.md`、`memory-bank/技术方案.md`、`memory-bank/实施计划.md` 与 `AGENTS.md`，检查命令组、阶段名、v1 非目标和 AGENTS 约束链路是否仍然使用同一套术语。
- 把这层检查做成测试，而不是停留在人工 review，可以更早发现“代码已经这么写了，但文档叫法变了”的漂移。

### `tests/integration/cli/writeback-flows.spec.ts`

- 这是任务 16 新增的 CLI integration 回归。
- 它补上了任务 15 没有覆盖到的两条关键路径：`record jira` 经由共享 run 生命周期完成 artifact / verification 补录、dry-run preview、审批和非交互 execute；`record feishu` 则证明飞书子工作流能不依赖完整主流程独立完成 preview / approve / execute。
- 这组测试让任务 16 的验收矩阵不只是“引用旧测试”，而是确实补齐了此前子工作流和写回链路的真实缺口。

### `tests/README.md`

- 在原有 `unit / integration / acceptance` 说明上，任务 16 把 `tests/milestones` 正式提升为一等测试层级。
- 这个文件现在不仅描述目录用途，还说明三层验证结构的 owner：任务级入口落在 `unit / integration`，任务组级入口落在 `acceptance`，里程碑级入口落在 `tests/milestones` 与追踪矩阵。

### `package.json`

- 任务 16 只对测试脚本做了最小但关键的收敛：新增 `test:milestones`，并把它并入根级 `npm test`。
- 这意味着里程碑回归与文档一致性不再依赖开发者记忆“最后再手动跑一次”，而是成为默认测试门禁的一部分。

### `memory-bank/progress.md`

- 这里记录任务 16 的实施依据、验证证据与当前边界说明，供后续开发者接手时快速判断“哪些是已经锁定的回归资产，哪些仍然只是范围声明”。
- 这份记录保持低优先级事实源定位，不反向覆盖需求、技术方案和实施计划。

## 任务 16 架构洞察

- 任务 16 最重要的 owner 收敛，不在业务代码，而在“验证资产的所有权”。以前任务是否闭环，更多依赖 `progress.md` 文本描述；现在则由 `tests/milestones/regression-plan.json` 充当追踪矩阵事实源，`task16-regression-coverage.spec.ts` / `milestone-regressions.spec.ts` / `document-consistency.spec.ts` 负责把这些声明变成机器可验证的门禁。
- 三层验证结构的设计刻意保持分工清晰：`unit / integration` 继续证明局部能力和跨层接缝，`acceptance` 负责任务组级交付门槛，`tests/milestones` 负责最终回归与文档约束。这避免了把所有责任都塞进一个“大而全”的 acceptance 测试文件里，减轻后续维护成本。
- `writeback-flows.spec.ts` 被放在 integration，而不是 acceptance，是因为它验证的是“共享 run 生命周期 + CLI 命令接缝”这一跨层能力，而不是整个任务 16 的文档追踪矩阵。这样既补齐了真实行为缺口，也不让 acceptance 层承担过多业务细节。
- 任务 16 选择用“跨模块测试链路追踪标准主流程”而不是捏造一个未实现的全自动单命令 happy path，是一次刻意的边界保护。它忠实反映了 v1 当前实现形态，避免为了追求看上去更完整的 E2E 演示而在测试中暗藏并不存在的系统能力。
