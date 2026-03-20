# Progress

## 2026-03-20 - v2 任务 6 步骤 4：统一 Jira 读取失败的结构化错误语义

### 本轮完成内容

- 在 `src/infrastructure/connectors/jira/index.ts` 中把 `readJiraIssueSnapshot()` 扩展为真正的错误收口点。
- 新增并统一以下读取错误语义：
  - `createJiraPermissionDeniedError()`：权限不足 / credential scope 不可读
  - `createJiraIssueNotFoundError()`：issue key 不存在或不可见
  - `createInvalidJiraIssueError()`：原始 payload 字段缺失或为空
  - `createJiraNetworkError()`：transport 网络失败
- 在 connector 内新增最小原始字段检查逻辑，确保 `issue_key`、`issue_id`、`issue_type_id`、`project_key`、`summary`、`description`、`status_name` 等关键字段缺失时，不会把异常泄漏成原生 `TypeError`。
- `readJiraIssueSnapshot()` 现在会先识别 transport/status/code，再抛出统一的 `StructuredError`；app 层无需再理解 fixture 文件错误或未来 transport 细节。
- 在 `tests/unit/intake/jira-intake.spec.ts` 中补齐步骤 4 的 red/green 覆盖：
  - 权限不足
  - issue 不存在
  - payload 字段缺失
  - 网络错误

### 依据

- 用户指令：任务 6 每完成一个步骤必须先测试、验证，再更新 `progress.md` 与 `architecture.md`。
- `memory-bank/features/v2/实施计划.md` 任务 6 步骤 4：
  - 统一权限不足、字段缺失、找不到 issue、网络错误的错误语义。
- `memory-bank/features/v1/需求文档.md`：
  - 如果权限不足、字段缺失或接口失败，系统必须返回结构化错误，并提示用户如何补录或重试。

### 验证记录

1. 验证对象：Jira 读取错误语义 red 阶段
   触发方式：先修改 `tests/unit/intake/jira-intake.spec.ts`，再运行 `npm run test:unit -- tests/unit/intake/jira-intake.spec.ts`
   预期结果：实现前准确暴露 connector 把权限错误直接透传成原生异常
   实际结果：通过；red 阶段失败点为收到原生 `Error: Forbidden`，未被映射成 `StructuredError`

2. 验证对象：Jira 读取错误统一收敛与受影响回归
   触发方式：实现 connector 错误映射后运行 `npm run test:unit -- tests/unit/intake/jira-intake.spec.ts && npm run test:integration -- tests/integration/cli/run-record-commands.spec.ts tests/integration/cli/writeback-flows.spec.ts && npm run typecheck`
   预期结果：四类错误都映射为稳定 `StructuredError`，且真实 snapshot 读取链路不被破坏
   实际结果：通过；unit 全量 `80/80` 通过，integration 全量 `14/14` 通过，`typecheck` 退出码为 0

### 当前边界说明

- 任务 6 到此完成的是“真实 Jira 读取 + snapshot artifact + skill 边界 + 错误语义”的最小闭环，还没有进入任务 7 的主流程自动编排。
- 当前 transport 仍基于 orchestrator home 下的 Jira issue fixture 文件；这是当前仓库阶段下的真实 connector 读取实现，不假装已经具备 credential-backed HTTP adapter。
- `run start` 目前已经拥有真实 Intake 上游事实源，但仍未自动执行 `Intake`、`Context Resolution` 等主流程阶段；这些必须留给任务 7。

## 2026-03-20 - v2 任务 6 步骤 3：让 `jira-intake` 只消费结构化 snapshot artifact

### 本轮完成内容

- 在 `src/skills/jira-intake/index.ts` 中新增：
  - `loadJiraIssueSnapshotArtifact()`
  - `runJiraIntakeFromArtifact()`
- 新 helper 显式把 `jira-intake` 的输入边界固定为 `JiraIssueSnapshotSchema`：
  - 先解析 persisted snapshot artifact
  - 再调用既有 `runJiraIntake()` 生成阶段结果
- `runJiraIntake()` 本身继续只处理已经标准化的 `issueSnapshot`，没有新增任何 Jira 原始读取或 I/O 职责。
- 在 `tests/unit/intake/jira-intake.spec.ts` 中补齐步骤 3 的 red/green 覆盖：
  - 锁定 skill 可以从结构化 snapshot artifact 进入
  - 锁定 raw Jira payload 不能被当作 Intake artifact 直接消费

### 依据

- 用户指令：任务 6 每一步都必须先测、验证通过后记录进度和架构洞察，再进入下一步。
- `memory-bank/features/v2/实施计划.md` 任务 6 步骤 3：
  - 让 `jira-intake` 只消费结构化快照，而不是自己访问原始接口。
- `memory-bank/features/v1/技术方案.md`：
  - `Skill Layer` 只接受结构化输入并返回结构化输出，不直接做 I/O。

### 验证记录

1. 验证对象：`jira-intake` artifact 边界 red 阶段
   触发方式：先修改 `tests/unit/intake/jira-intake.spec.ts`，再运行 `npm run test:unit -- tests/unit/intake/jira-intake.spec.ts`
   预期结果：实现前准确暴露 skill 缺少 snapshot artifact 入口
   实际结果：通过；red 阶段失败点为 `loadJiraIssueSnapshotArtifact is not a function`

2. 验证对象：`jira-intake` 只消费结构化快照
   触发方式：实现 skill helper 后运行 `npm run test:unit -- tests/unit/intake/jira-intake.spec.ts && npm run typecheck`
   预期结果：结构化 snapshot artifact 能进入 Intake；raw Jira payload 会在 schema 边界被拒绝
   实际结果：通过；unit 全量 `79/79` 通过，`typecheck` 退出码为 0

### 当前边界说明

- 本步骤只显式化了 skill 的 artifact 输入边界，还没有把权限不足、字段缺失、issue 不存在、网络错误统一映射为稳定的结构化错误。
- app 层目前已经能落 snapshot artifact，但后续真正进入主流程时，还需要由任务 7 把 `Intake` 阶段执行串起来；本轮不越界进入任务 7。
- 当前 `runJiraIntakeFromArtifact()` 仍然是纯函数入口，不负责根据 ref 读文件；文件读取与持久化边界继续留在 app / storage 层。

## 2026-03-20 - v2 任务 6 步骤 2：把 Jira 读取结果落为 snapshot artifact

### 本轮完成内容

- 在 `src/app/cli-orchestration.ts` 中把 `createCliRun()` 接到真实 Jira snapshot 读取与持久化链路。
- 新增 `persistJiraIssueSnapshotArtifact()`，把读取后的结构化快照写入当前 run 的 `artifacts/` 目录，并固定引用格式为 `artifact://jira/issues/<issue_key>`。
- `createCliRun()` 现在在 `run start`、`run brief`、`record jira` 三类带 issue 的入口中会：
  - 先读取 Jira 快照
  - 再落盘 artifact
  - 再把 `ExecutionContext.active_bug_issue_key` 和 `jira_issue_snapshot_ref` 更新为真实快照来源
- 同步把 `stage_artifact_refs.Intake` 接到 snapshot artifact，确保后续恢复和审计能从 context 直接追到 Intake 事实源。
- 在 `tests/integration/cli/run-record-commands.spec.ts` 中新增步骤 2 的集成断言：
  - `run start` 后必须出现 `jira-issue-snapshot-<issue>.json`
  - context 中的 snapshot ref 必须指向 `artifact://jira/issues/<issue>`
- 在相关 integration fixture 中补充 Jira issue 种子，确保 `run brief`、`record jira` 等真实经过读取链路，而不是继续依赖旧的占位 ref。

### 依据

- 用户指令：任务 6 每完成一个步骤后先验证，通过后立即更新 `progress.md` 与 `architecture.md`。
- `memory-bank/features/v2/实施计划.md` 任务 6 步骤 2：
  - 把读取结果落为 Jira snapshot artifact。
- `memory-bank/features/v1/需求文档.md` 与 `memory-bank/features/v1/技术方案.md`：
  - Jira snapshot 应成为后续 Intake 与写回链路的统一事实源。
  - `ExecutionContext` 只保存 ref，不直接内嵌完整外部 payload。

### 验证记录

1. 验证对象：Jira snapshot artifact red 阶段
   触发方式：先修改 `tests/integration/cli/run-record-commands.spec.ts`，再运行 `npm run test:integration -- tests/integration/cli/run-record-commands.spec.ts`
   预期结果：实现前准确暴露 `run start` 没有落 Jira snapshot artifact
   实际结果：通过；red 阶段失败点为找不到 `artifacts/jira-issue-snapshot-BUG-120.json`

2. 验证对象：snapshot artifact 持久化与 context 接线
   触发方式：实现 app 层接线后运行 `npm run test:integration -- tests/integration/cli/run-record-commands.spec.ts tests/integration/cli/writeback-flows.spec.ts && npm run typecheck`
   预期结果：`run start`/`run brief`/`record jira` 都走真实 snapshot 读取路径，且 context 指向真实 artifact ref
   实际结果：通过；integration 全量 `14/14` 通过，`typecheck` 退出码为 0

### 当前边界说明

- 本步骤只完成了“读取后持久化 snapshot artifact”，还没有让 `jira-intake` 明确只从结构化快照 artifact 消费输入。
- 当前读取 transport 仍是基于 orchestrator home 下的 Jira issue fixture 文件；真正的错误语义标准化与 transport 异常归类仍留在任务 6 后续步骤。
- `run-lifecycle.initializeRun()` 仍然只接收 snapshot ref，不负责读取或落盘；这条边界在本步骤保持不变。

## 2026-03-20 - v2 任务 6 步骤 1：打通 Jira bug 读取入口并冻结最小读取字段

### 本轮完成内容

- 在 `src/infrastructure/connectors/jira/index.ts` 中新增 `readJiraIssueSnapshot()`，为任务 6 提供真正的 Jira 读取入口。
- 新读取入口当前收敛两件事：
  - 只接收 `projectProfile`、`issueKey` 和底层 `fetchIssue()` 依赖
  - 读取成功后统一复用 `buildJiraIssueSnapshot()` 输出结构化 `JiraIssueSnapshot`
- 在 `tests/unit/intake/jira-intake.spec.ts` 中新增步骤 1 的 red/green 覆盖：
  - 锁定 connector 必须按传入 `issue_key` 发起读取
  - 锁定 Intake 所需的最小字段都来自结构化快照，而不是调用方临时拼装

### 依据

- 用户指令：继续执行 `memory-bank/features/v2/实施计划.md` 的任务 6；每完成一个步骤先测试，测试通过后更新 `progress.md` 与 `architecture.md`，在此之前不要进入任务 7。
- `memory-bank/features/v2/实施计划.md` 任务 6 步骤 1：
  - 打通 Jira bug 读取入口，获取 issue key、状态、描述、标签、关联线索和写回目标所需字段。
- `memory-bank/features/v1/技术方案.md`：
  - `Infrastructure Layer` 是唯一外部系统访问入口。
  - `jira-intake` 应消费结构化快照，而不是自己直连原始 Jira 接口。

### 验证记录

1. 验证对象：Jira 读取入口 red 阶段
   触发方式：先修改 `tests/unit/intake/jira-intake.spec.ts`，再运行 `npm run test:unit -- tests/unit/intake/jira-intake.spec.ts`
   预期结果：实现前准确暴露 connector 读取入口缺失
   实际结果：通过；red 阶段失败点为 `readJiraIssueSnapshot is not a function`

2. 验证对象：Jira 读取入口 green 阶段与类型一致性
   触发方式：实现 `readJiraIssueSnapshot()` 后运行 `npm run test:unit -- tests/unit/intake/jira-intake.spec.ts && npm run typecheck`
   预期结果：connector 能按 `issue_key` 读取并输出结构化快照，且仓库范围类型保持一致
   实际结果：通过；unit 全量 `78/78` 通过，`typecheck` 退出码为 0

### 当前边界说明

- 本步骤只补齐了“读取入口 + 结构化快照”的 connector 层能力，还没有把读取结果落盘成 Jira snapshot artifact。
- `run start` / `run brief` 目前仍未在初始化时真实读取 Jira，也还没有更新 `jira_issue_snapshot_ref` 的实际 artifact 指向；这属于任务 6 后续步骤。
- 错误语义目前仍只覆盖已有的权限不足 / 字段非法 helper，`issue not found` 与网络错误的统一收敛仍留在任务 6 后续步骤。

## 2026-03-20 - v2 任务 5：补齐项目画像与主流程接线

### 本轮完成内容

- 在 `src/app/cli-orchestration.ts` 中新增 `loadRequiredProjectProfile()`，让 `run start`、`run brief`、`record jira`、`record feishu` 在进入 `initializeRun()` 前统一通过 `config-loader` 加载并校验项目画像。
- 新增 `mapProjectProfileValidationError()`，把 `ProjectProfileValidationError` 统一映射为结构化 CLI 错误：
  - 存在缺失字段时，返回 `configuration_missing`
  - 版本不兼容、非法引用、非法值时，返回 `validation_error`
- `createCliRun()` 不再写死 `configVersion: '2026-03-19'`，而是使用真实项目画像中的 `config_version` 写入 run context，确保后续 workflow 只能建立在已加载的可信配置之上。
- 在 `tests/integration/cli/run-record-commands.spec.ts` 中补齐任务 5 的主回归覆盖：
  - 缺失项目画像时，`run start` 直接失败且不会创建 run 目录
  - 缺失项目画像时，`record feishu` 同样被入口闸门拦下
  - 配置版本非法时，`record jira` 返回结构化 `validation_error`
  - 配置修复后，`run brief` 可重新成功创建 run，且 context 内 `config_version` 来自真实项目画像
- 在 `tests/integration/cli/run-record-commands.spec.ts` 与 `tests/integration/cli/writeback-flows.spec.ts` 中为既有 `run/record` 流程显式补齐项目画像种子，确认任务 5 的入口接线不会破坏任务 3/4 已完成的 CLI 行为。

### 依据

- 用户指令：继续执行 `memory-bank/features/v2/实施计划.md` 的任务 5；每完成一个步骤后先测试，通过后更新 `progress.md` 与 `architecture.md`，在此之前不要进行任务 6。
- `memory-bank/features/v2/实施计划.md` 任务 5：
  - 在进入 `run start`、`run brief`、`record jira`、`record feishu` 前统一加载项目画像
  - 将配置缺失、非法引用、版本不兼容等错误映射为结构化 CLI 错误
  - 阻止未绑定项目的命令继续创建 run
  - 保持既有 `bind` / `inspect` 边界不变
- `memory-bank/features/v1/技术方案.md`：
  - `src/app` 负责 CLI 到 workflow 的装配
  - `Workflow/Agent Layer` 之前的配置装配应在 app 层收敛，不能让 workflow 持有配置读取职责

### 验证记录

1. 验证对象：任务 5 的入口闸门 red 阶段
   触发方式：先修改 `tests/integration/cli/run-record-commands.spec.ts`，再运行 `npm run test:integration -- tests/integration/cli/run-record-commands.spec.ts`
   预期结果：实现前准确暴露 `run start` 在没有项目画像时仍错误创建 run
   实际结果：通过；red 阶段断言失败，实际输出为 `run start / exitCode 0`，确认缺口存在

2. 验证对象：项目画像加载接线与结构化错误映射
   触发方式：实现 `src/app/cli-orchestration.ts` 后运行 `npm run test:integration -- tests/integration/cli/run-record-commands.spec.ts tests/integration/cli/writeback-flows.spec.ts`
   预期结果：`run` / `record` 在缺配置时提前失败，在有完整配置时继续保持既有主流程与子工作流行为
   实际结果：通过；受影响 integration 全量通过，`3/3` 文件、`13/13` 用例通过

3. 验证对象：空壳 run 阻断回归与真实 `config_version` 透传
   触发方式：补充 `record feishu` 与 `config_version` 断言后，重新运行 `npm run test:integration -- tests/integration/cli/run-record-commands.spec.ts`
   预期结果：四条入口都受同一项目画像闸门约束，修复后的 run context 使用存储配置版本
   实际结果：通过；integration 全量 `13/13` 通过

### 当前边界说明

- 任务 5 只完成了“进入 workflow 之前的项目画像接线”，还没有把项目画像进一步注入 `Intake`、`Context Resolution` 或真实 Jira 读取阶段；这些仍属于任务 6 及之后的范围。
- 当前 `bind` / `inspect` 的实现与职责未改动，项目画像的写入、检查、缺失项提示仍然由既有配置链路负责。
- 当前仓库没有额外 git worktree；`git worktree list` 只显示 `/Users/sunyi/ai/MySkills [main]`，因此本轮不存在额外 worktree 可删除。

## 2026-03-20 - v2 任务 4 步骤 4：统一 dry-run / execute payload 基线并冻结 reconcile-first 恢复决策

### 本轮完成内容

- 在 `src/workflow/jira-writeback.ts` 中新增 `planJiraV2Execution()`，作为 v2 Jira 写回的统一执行决策入口。
- 新决策函数显式收敛两类规则：
  - dry-run 与真实 execute 共用同一份 draft `request_payload` / `request_payload_hash`
  - 当最新 side effect 为 `prepared`、`dispatched` 或 `outcome_unknown` 时，返回 `reconcile_before_retry`，禁止直接重发
- `planJiraV2Execution()` 当前能区分五类结果：
  - `preview_only`
  - `execute`
  - `skip_terminal`
  - `reconcile_before_retry`（`prepared_side_effect_present`）
  - `reconcile_before_retry`（`dispatched_side_effect_present` / `write_outcome_unknown`）
- 在 `tests/unit/jira-writeback/jira-writeback.spec.ts` 中补齐步骤 4 的 red/green 覆盖：
  - 锁定 dry-run 与 execute 拿到相同 payload 基线
  - 锁定 `prepared` / `dispatched` / `outcome_unknown` 三类未安全收敛状态都必须先 reconcile
- 在回归验证层补充运行：
  - `npm run typecheck`
  - `npm run test:integration -- tests/integration/cli/writeback-flows.spec.ts`
  确认新契约未破坏既有 CLI writeback 子流程

### 依据

- 用户指令：在完成每一步后测试，通过后更新 `progress.md` 与 `architecture.md`；在任务 4 完成前不得进入任务 5。
- `memory-bank/features/v2/实施计划.md` 任务 4 步骤 4：
  - 明确 dry-run 与真实 execute 共享同一 payload 基线，恢复时先 reconcile 后决定是否重试。
- `memory-bank/features/v1/实施计划.md` 与 `memory-bank/features/v1/技术方案.md`：
  - 遇到 `outcome_unknown` 或 `prepared` / `dispatched` 未终态副作用时，恢复入口必须优先进入 reconcile。

### 验证记录

1. 验证对象：v2 Jira 执行决策基线与 reconcile-first 规则
   触发方式：先修改 `tests/unit/jira-writeback/jira-writeback.spec.ts`，再运行 `npm run test:unit -- tests/unit/jira-writeback/jira-writeback.spec.ts`
   预期结果：实现前准确暴露执行决策 helper 缺失；实现后 dry-run / execute payload 基线一致，且未终态副作用返回 reconcile
   实际结果：通过；red 阶段暴露 `planJiraV2Execution` 缺失，green 后 unit 全量 `77/77` 通过

2. 验证对象：TypeScript 类型一致性
   触发方式：运行 `npm run typecheck`
   预期结果：新的执行决策 union 与现有 v2 draft/ledger 类型在仓库范围内一致
   实际结果：通过；命令退出码为 0

3. 验证对象：受影响的 CLI writeback 回归
   触发方式：运行 `npm run test:integration -- tests/integration/cli/writeback-flows.spec.ts`
   预期结果：既有 `record jira` / `record feishu` 子工作流仍能完成 preview / approve / execute
   实际结果：通过；integration 全量 `12/12` 通过

### 当前边界说明

- 任务 4 到此完成的是 Jira connector 与 workflow 的最小契约层：preview、execute result、target resolution、ledger 顺序、payload baseline 与 reconcile-first 决策都已冻结。
- 目前还没有把这些 v2 helper 真正接进 CLI `execute-write`、run 恢复入口或 side-effects 文件持久化；这属于后续 app / workflow 接线工作，不能在本轮越界进入任务 5。
- 当前仓库不存在额外 worktree；`git worktree list` 只显示 `/Users/sunyi/ai/MySkills` 上的 `main`。

## 2026-03-20 - v2 任务 4 步骤 3：固定三类 Jira v2 side effect 的账本顺序与 result_ref 约束

### 本轮完成内容

- 在 `src/workflow/jira-writeback.ts` 中新增 v2 专用 side-effect ledger helper：
  - `buildJiraV2PreparedEntry()`
  - `markJiraV2EntryDispatched()`
  - `finalizeJiraV2Entry()`
- 新 helper 统一覆盖三类 operation：
  - `jira.create_subtask`
  - `jira.bind_branch`
  - `jira.bind_commit`
- 新 helper 通过 `JiraV2SideEffectLedgerEntrySchema` 强制以下约束：
  - 账本顺序固定为 `prepared -> dispatched -> terminal`
  - terminal `result_ref` 必须与 operation 对应
    - subtask -> `artifact://jira/subtasks/result/...`
    - branch -> `artifact://jira/bindings/branch/...`
    - commit -> `artifact://jira/bindings/commit/...`
  - `already_applied`、`external_request_id` 与终态 status 从结构化 result 回灌账本
- 在 `tests/unit/jira-writeback/jira-writeback.spec.ts` 中补齐步骤 3 的 red/green 覆盖：
  - 锁定 subtask / branch / commit 三条链路都走统一账本顺序
  - 锁定 commit 在 `outcome_unknown` 下仍保留 operation-specific `result_ref`

### 依据

- 用户指令：每完成一个步骤必须先验证，验证通过后更新文档，再进入下一步骤。
- `memory-bank/features/v2/实施计划.md` 任务 4 步骤 3：
  - 固定三类操作的 `prepared`、`dispatched`、`succeeded`、`failed`、`outcome_unknown` 账本顺序。
- `memory-bank/features/v1/技术方案.md`：
  - side-effect ledger 是恢复与审计的唯一历史面，不能把 operation-specific 语义留给调用方临时拼接。

### 验证记录

1. 验证对象：v2 Jira side-effect ledger 顺序与 operation-specific `result_ref`
   触发方式：先修改 `tests/unit/jira-writeback/jira-writeback.spec.ts`，再运行 `npm run test:unit -- tests/unit/jira-writeback/jira-writeback.spec.ts`
   预期结果：实现前准确暴露 v2 ledger helper 缺失；实现后三类 operation 都能形成稳定 `prepared -> dispatched -> terminal` 顺序
   实际结果：通过；red 阶段暴露 `buildJiraV2PreparedEntry` 缺失，green 后 unit 全量 `76/76` 通过

2. 验证对象：TypeScript 类型一致性
   触发方式：运行 `npm run typecheck`
   预期结果：v2 ledger helper、draft/result union 与 workflow export 在仓库范围内类型一致
   实际结果：通过；命令退出码为 0

### 当前边界说明

- 本步骤只冻结 v2 side-effect ledger 的对象顺序与 result_ref 语义，还没有把 dry-run / execute 的共享 payload 基线与 reconcile-first 恢复判断接进 workflow。
- 当前 helper 只负责构造账本条目，不负责持久化 `side-effects.ndjson` 或从历史记录中做 dedupe/reconcile 决策。
- CLI 仍未消费这些 v2 helper；真正把 `ensure-subtask` / branch / commit 接入统一写回 execute，仍属于任务 4 后续步骤或更后续的 app 接线。

## 2026-03-20 - v2 任务 4 步骤 2：为 `jira.bind_branch` / `jira.bind_commit` 冻结 preview / result 与目标解析语义

### 本轮完成内容

- 在 `src/domain/schemas.ts` 中新增 branch / commit 绑定所需的最小 schema：
  - `JiraBindingDraftSchema`
  - `JiraBindingResultSchema`
- 在 `src/infrastructure/connectors/jira/index.ts` 中新增共享的 binding 目标解析与纯映射逻辑：
  - `resolveBindingTarget()`
    - 当 profile 要求绑到 `subtask` 且显式提供了 subtask key 时，目标解析为子任务
    - 当 branch binding 缺少 subtask key 且 profile 允许 `fallback_to_bug` 时，回落到 bug
    - 当 commit binding 缺少 subtask key 且 profile 未授权 fallback 时，直接拒绝，避免静默写错目标
  - `buildJiraBranchBindingPreviewDraft()`
  - `buildJiraCommitBindingPreviewDraft()`
  - `createJiraBranchBindingExecuteResult()`
  - `createJiraCommitBindingExecuteResult()`
- 新 draft / result 契约统一显式携带：
  - `target_issue_key`
  - `target_issue_source`
  - `target_ref`
  - `binding_value`
  - `linked_value`
  - `request_payload_hash`
  - `dedupe_scope`
- 在 `tests/unit/jira-writeback/jira-writeback.spec.ts` 中补齐步骤 2 的 red/green 覆盖：
  - 锁定 branch 优先绑定 subtask、缺少 subtask 时允许 fallback 到 bug
  - 锁定 commit 在未授权 fallback 时必须显式失败
  - 锁定 branch / commit execute result 的统一结果形状

### 依据

- 用户指令：任务 4 必须按步骤推进；每步测试通过并同步文档后，才能进入下一步。
- `memory-bank/features/v2/实施计划.md` 任务 4 步骤 2：
  - 为 `jira.bind_branch`、`jira.bind_commit` 定义 preview draft、execute result 和目标解析语义。
- `memory-bank/features/v1/技术方案.md`：
  - 外部写回目标解析必须收敛在 infrastructure 层，不允许 CLI / workflow 临时猜测真实外部目标。
  - 缺失关键信息时必须提示补录，不能静默猜测。

### 验证记录

1. 验证对象：branch / commit preview / result 契约与目标解析边界
   触发方式：先修改 `tests/unit/jira-writeback/jira-writeback.spec.ts`，再运行 `npm run test:unit -- tests/unit/jira-writeback/jira-writeback.spec.ts`
   预期结果：实现前准确暴露 branch / commit connector 能力缺失；实现后 target resolution、fallback 和结果断言成立
   实际结果：通过；red 阶段暴露 `buildJiraBranchBindingPreviewDraft` 缺失与 commit target 解析缺失，green 后 unit 全量 `75/75` 通过

2. 验证对象：TypeScript 类型一致性
   触发方式：运行 `npm run typecheck`
   预期结果：新增 binding schema、connector helper 与测试调用在仓库范围内类型一致
   实际结果：通过；命令退出码为 0

### 当前边界说明

- 本步骤只冻结 branch / commit 的 connector 输入输出和目标解析规则，还没有把这两类操作接入 `prepared -> dispatched -> terminal` 的 v2 专用账本 helper。
- 目前 execute result 仍是纯结构化对象；真正的 ledger result_ref 绑定、状态推进和恢复策略仍属于任务 4 后续步骤。
- branch/commit 的 dedupe 目前只冻结在 draft 层的 `dedupe_scope`，尚未实现 reconcile 命中后的终态判定。

## 2026-03-20 - v2 任务 4 步骤 1：为 `jira.create_subtask` 冻结 preview / execute / dedupe 契约

### 本轮完成内容

- 在 `src/domain/schemas.ts` 中新增子任务写回所需的最小 schema：
  - `JiraSubtaskDedupeQuerySchema`
  - `JiraSubtaskDraftSchema`
  - `JiraSubtaskResultSchema`
- 在 `src/infrastructure/connectors/jira/index.ts` 中新增 `jira.create_subtask` 的最小纯映射能力：
  - `buildJiraSubtaskPreviewDraft()`
    - 使用 `ProjectProfile.jira.subtask.summary_template`
    - 生成稳定 `target_ref`
    - 生成 `request_payload`、`request_payload_hash`
    - 固定 `dedupe_scope = jira:<bug>:subtask`
    - 生成基于 parent issue、issue type、summary 的 `dedupe_query`
  - `createJiraSubtaskExecuteResult()`
    - 将真实创建结果标准化为带 `created_issue_key` / `created_issue_id` 的结构化 result
  - `createJiraSubtaskAlreadyAppliedResult()`
    - 将 dedupe 命中结果标准化为 `already_applied = true` 的统一 result
- 在 `tests/unit/jira-writeback/jira-writeback.spec.ts` 中补齐步骤 1 的 red/green 覆盖：
  - 锁定 subtask preview draft 的 summary 模板、payload、hash、dedupe 查询与幂等 key
  - 锁定新建子任务结果与 dedupe 命中结果的统一输出形状

### 依据

- 用户指令：继续执行 `memory-bank/features/v2/实施计划.md` 的任务 4；每完成一个步骤先测试，通过后更新 `progress.md` 与 `architecture.md`，然后再进入下一步骤。
- `memory-bank/features/v2/实施计划.md` 任务 4 步骤 1：
  - 为 `jira.create_subtask` 定义 preview draft、execute result 和 dedupe 查询语义。
- `memory-bank/features/v1/技术方案.md`：
  - `Infrastructure Layer` 是唯一外部系统访问入口，preview / execute 契约应先在 connector 收敛为结构化对象。
  - 所有外部写回都要有稳定的 preview、幂等与恢复字段，不能只保留人类可读文本。

### 验证记录

1. 验证对象：`jira.create_subtask` preview / execute / dedupe 契约
   触发方式：先修改 `tests/unit/jira-writeback/jira-writeback.spec.ts`，再运行 `npm run test:unit -- tests/unit/jira-writeback/jira-writeback.spec.ts`
   预期结果：实现前准确暴露子任务 connector 契约缺失；实现后 subtask draft / result 断言成立
   实际结果：通过；red 阶段暴露 `buildJiraSubtaskPreviewDraft` 与 `createJiraSubtaskExecuteResult` 缺失，green 后 unit 全量 `73/73` 通过

2. 验证对象：TypeScript 类型一致性
   触发方式：运行 `npm run typecheck`
   预期结果：新增 subtask schema、type export 与 connector 返回结构在仓库范围内保持类型一致
   实际结果：通过；命令退出码为 0

### 当前边界说明

- 本步骤只完成 `jira.create_subtask` 的 connector 契约冻结，还没有进入 `jira.bind_branch` / `jira.bind_commit` 的目标解析与结果建模。
- 目前只定义了“如何形成稳定 preview / result / dedupe query”，尚未把 subtask result 接入 CLI execute、side-effect ledger 终态或 reconcile 路由。
- `ensure-subtask` 仍然沿用任务 3 的本地 preview artifact 入口；真正把它切到 connector execute 链路，仍属于任务 4 后续步骤。

## 2026-03-20 - v2 任务 3 步骤 4：收敛三条入口的 workflow 状态语义与 status 引导

### 本轮完成内容

- 在 `src/app/cli-orchestration.ts` 中收紧 `run status` 的允许动作生成逻辑：
  - `Execution` 处于 `waiting_external_input` 时，不再一律展示所有补录命令
  - 现在会根据实际缺失的输入，只提示：
    - 缺 branch 时显示 `run bind-branch`
    - 缺 artifact 时显示 `run provide-artifact`
    - 缺 verification 时显示 `run provide-verification`
- 保持 `Artifact Linking` 阶段的可执行动作与新入口一致：
  - `run provide-fix-commit` 现在会作为 `Artifact Linking` 的稳定补录动作出现在 status 中
  - 补录 commit 后，`run status` 会引导用户重新 `preview-write`，而不是继续批准旧 preview
- 在测试侧补齐步骤 4 的状态路由覆盖：
  - `tests/integration/cli/run-record-commands.spec.ts` 现在验证 branch 已补齐后 `run status` 不再误报 `run bind-branch`
  - 同时验证补录 fix commit 后 `Artifact Linking` 只暴露重新生成 preview 所需动作，而不继续暴露旧审批动作

### 依据

- 用户指令：完成每一步后先测试、验证通过再继续，并在进入下一任务前同步文档。
- `memory-bank/features/v2/实施计划.md` 任务 3 步骤 4：
  - 把 `bind-branch`、`ensure-subtask`、`provide-fix-commit` 接到统一 workflow 状态语义中
  - branch 未提供时 `Execution` 可进入 `waiting_external_input`
  - branch / commit 关联写回落在 `Artifact Linking`
  - 不存在绕过 `preview -> approve -> execute` 的旁路
- `memory-bank/features/v1/需求文档.md` 与 `memory-bank/features/v1/技术方案.md`：
  - `run status` 应准确表达当前等待原因和下一步可执行动作
  - 写回输入变化后必须重新回到可审阅、可确认的 preview 链路

### 验证记录

1. 验证对象：`run status` 对 Execution 缺失输入的精确引导
   触发方式：先修改 `tests/integration/cli/run-record-commands.spec.ts`，再运行 `npm run test:integration -- tests/integration/cli/run-record-commands.spec.ts`
   预期结果：branch 已绑定后，status 不再提示 `run bind-branch`；仍缺的 artifact / verification 会继续提示
   实际结果：通过；red 阶段暴露 1 个失败断言，green 后 integration 全量 `12/12` 通过

2. 验证对象：补录 fix commit 后的 Artifact Linking 路由
   触发方式：继续运行 `npm run test:integration`
   预期结果：status 提示重新 `preview-write` 与继续 `provide-fix-commit`，但不再提示批准旧 preview
   实际结果：通过；integration 全量 `12/12` 通过

### 当前边界说明

- 任务 3 到此只完成 CLI 入口与 workflow 路由接线，尚未进入任务 4 的 Jira connector preview / execute / dedupe / reconcile 实现。
- `run status` 目前只对 `Execution` 缺失输入做精确动作过滤；更细粒度的 `Artifact Linking` 预览内容和 side-effect 账本语义仍等待任务 4 接入。
- 任务 4 之前，所有 branch / subtask / commit 相关操作都仍然是本地 artifact + context ref 驱动，不产生真实外部写入。

## 2026-03-20 - v2 任务 3 步骤 3：新增 `run provide-fix-commit`，显式补录 commit 归属并重置 Artifact Linking 预览

### 本轮完成内容

- 在 `src/cli/run/register.ts` 中新增 `run provide-fix-commit` 命令，最小输入为：
  - `--run <id>`
  - `--issue <key>`
  - `--commit <sha>`
- 在 `src/app/cli-orchestration.ts` 中新增 `provideCliFixCommit`，负责：
  - 校验 `Execution` 已完成，避免在 branch / artifact / verification 未齐时提前补录 commit
  - 将 fix commit 归属持久化为本地 artifact，并生成 `artifact://jira/bindings/commit/<id>` ref
  - 把 ref 追加到 `ExecutionContext.git_commit_binding_refs`
  - 将当前阶段切回 `Artifact Linking/not_started`，清空已有 Jira writeback draft/result，强制后续重新生成 preview
- 在 `src/app/cli-orchestration.ts` 的状态摘要中补充 `run provide-fix-commit` 作为 `Artifact Linking` 阶段的可执行动作，保证 CLI status 能引导用户继续补录。
- 在测试侧补齐步骤 3 的红绿覆盖：
  - `tests/integration/cli/run-record-commands.spec.ts` 锁定新命令曝光、commit 归属写入，以及补录后 `Artifact Linking` 重新回到 `not_started`

### 依据

- 用户指令：继续执行 `memory-bank/features/v2/实施计划.md` 的任务 3；每完成一个步骤先测试，通过后更新文档。
- `memory-bank/features/v2/实施计划.md` 任务 3 步骤 3：
  - 新增 `run provide-fix-commit`，用于补录 fix commit 并声明归属 issue
- `memory-bank/features/v2/实施计划.md` 任务 3 步骤 4：
  - branch / commit 关联写回落在 `Artifact Linking`
  - 不允许绕过 preview / approve / execute 的旁路
- `memory-bank/features/v1/技术方案.md`：
  - 写回阶段的输入变化后，应通过统一状态机重新生成 preview，而不是沿用陈旧 draft

### 验证记录

1. 验证对象：`run provide-fix-commit` 命令曝光与补录后的阶段回退
   触发方式：先修改 `tests/integration/cli/run-record-commands.spec.ts`，再运行 `npm run test:integration -- tests/integration/cli/run-record-commands.spec.ts`
   预期结果：实现前暴露“命令不存在”；实现后能记录 commit 归属 ref，并把 `Artifact Linking` 置回 `not_started`
   实际结果：通过；red 阶段出现 2 个失败断言，green 后 integration `12/12` 通过

2. 验证对象：TypeScript 类型一致性
   触发方式：运行 `npm run typecheck`
   预期结果：新增 commit binding artifact helper、CLI 参数与 orchestration 输出结构在仓库范围内类型一致
   实际结果：通过；命令退出码为 0

### 当前边界说明

- 当前 `run provide-fix-commit` 只记录“commit 应关联到哪个 issue”的本地 artifact 和 context ref，不执行真实 Jira commit 关联写回。
- 本步骤只清空 `jira_writeback_draft_ref` / `jira_writeback_result_ref` 并重置 `Artifact Linking` 状态，不扩展 subtask result 或 side-effect ledger 终态；这些仍保留给任务 4。
- 暂未实现 commit 归属的 dedupe / reconcile 规则；这一步只建立显式入口和安全的 preview 失效机制。

## 2026-03-20 - v2 任务 3 步骤 2：新增 `run ensure-subtask`，把 Jira 子任务预览接到 Artifact Linking

### 本轮完成内容

- 在 `src/cli/run/register.ts` 中新增 `run ensure-subtask` 命令，支持：
  - `--run <id>`
  - 可选 `--issue <key>`
  - 继承既有 `--dry-run`、`--json`、`--non-interactive` 输出方式
- 在 `src/app/cli-orchestration.ts` 中新增 `ensureCliSubtask`，负责：
  - 校验 `Execution` 阶段已经完成，不允许绕过 branch / artifact / verification 前置输入直接进入子任务预览
  - 从显式参数或 run 上下文解析 issue key
  - 持久化本地 subtask preview artifact，并生成 `artifact://jira/subtasks/preview/<id>` ref
  - 把 run 推进到 `Artifact Linking` 的 `output_ready` 状态，等待后续审批
- 在 `src/app/cli-orchestration.ts` 中新增 `persistSubtaskPreviewArtifact`，用于把 `jira.create_subtask` 的本地 preview 记录到 `artifacts/`，并保留 dry-run 标记。
- 在测试侧补齐步骤 2 的红绿覆盖：
  - `tests/integration/cli/run-record-commands.spec.ts` 锁定新命令曝光、Execution 未完成时拒绝预览，以及 Execution 补齐后生成 subtask preview 的上下文结果

### 依据

- 用户指令：继续执行 `memory-bank/features/v2/实施计划.md` 的任务 3；每完成一个步骤先测试，通过后先更新 `progress.md` 与 `architecture.md`。
- `memory-bank/features/v2/实施计划.md` 任务 3 步骤 2：
  - 新增 `run ensure-subtask`，用于创建或确认该 bug 对应的开发子任务
  - 子任务创建前必须先 preview 和审批
- `memory-bank/features/v1/技术方案.md`：
  - `Artifact Linking` 属于写回阶段，必须通过统一 preview / approval / execute 语义推进
  - CLI Layer 只负责参数与展示，状态推进仍由 app / workflow owner 统一处理

### 验证记录

1. 验证对象：`run ensure-subtask` 命令曝光与执行前置约束
   触发方式：先修改 `tests/integration/cli/run-record-commands.spec.ts`，再运行 `npm run test:integration -- tests/integration/cli/run-record-commands.spec.ts`
   预期结果：实现前暴露“命令不存在”和“无法表达 Execution 未完成时的拒绝”；实现后命令 help、早期失败和成功预览都成立
   实际结果：通过；red 阶段出现 2 个失败断言，green 后 integration `11/11` 通过

2. 验证对象：TypeScript 类型一致性
   触发方式：运行 `npm run typecheck`
   预期结果：新增的 subtask preview artifact helper、CLI 命令与 orchestration 返回结构在仓库范围内类型一致
   实际结果：通过；命令退出码为 0

### 当前边界说明

- 目前的 `run ensure-subtask` 只负责生成本地 preview artifact 并把 run 推进到 `Artifact Linking` 的审批前状态，不执行真实 Jira 子任务创建。
- `jira_subtask_result_ref` 仍保持 `null`，直到后续任务 4 为 `jira.create_subtask` 补齐真实 execute / dedupe / reconcile 语义。
- 本步骤没有扩展 generic `run execute-write` 的 subtask-specific 行为，避免提前进入任务 4。

## 2026-03-20 - v2 任务 3 步骤 1：新增 `run bind-branch` 并把 branch 绑定接入 Execution 等待输入

### 本轮完成内容

- 在 `src/cli/run/register.ts` 中新增 `run bind-branch` 命令，最小输入为：
  - `--run <id>`
  - `--branch <name>`
  - 可选 `--issue <key>` 作为 issue key 覆盖
- 在 `src/app/cli-orchestration.ts` 中新增 `bindCliRunBranch`，负责：
  - 从显式 `--issue`、`active_bug_issue_key` 或 `jira_issue_snapshot_ref` 中解析当前 bug issue key
  - 将 branch 绑定请求持久化为本地 artifact 文件
  - 生成符合任务 2 契约的 `artifact://jira/bindings/branch/<id>` ref
  - 通过统一 `updateRun` 路径把 branch 绑定写回当前 run
- 在 `src/workflow/execution.ts` 中把 `branch_binding` 纳入 `Execution` 阶段的外部输入判定：
  - `Execution` 现在同时等待 `gitlab_artifacts`、`verification_results`、`branch_binding`
  - `recordExecutionExternalInputs` 支持补录 `branchBindingRef`
  - 等待摘要和 `waiting_reason` 会准确反映 branch 是否已绑定
- 在 `src/app/cli-orchestration.ts` 的状态摘要中补充 `run bind-branch` 为 `waiting_external_input` 时的允许动作，保证 CLI 能直接提示下一步。
- 在测试侧补齐步骤 1 的红绿覆盖：
  - `tests/unit/execution/execution.spec.ts` 锁定 `branch_binding` 缺失/补齐后的等待语义
  - `tests/integration/cli/run-record-commands.spec.ts` 锁定新命令曝光、`record jira` 的新等待原因以及 branch 绑定后的上下文更新
  - `tests/integration/cli/writeback-flows.spec.ts` 同步到新前置条件，显式在 Jira 写回子流程中先执行 `run bind-branch`

### 依据

- 用户指令：继续执行 `memory-bank/features/v2/实施计划.md` 的任务 3；每完成一个步骤先测试，通过后再继续；测试通过后先更新 `progress.md` 与 `architecture.md`，在此之前不进入下一步骤。
- `memory-bank/features/v2/实施计划.md` 任务 3 步骤 1：
  - 新增 `run bind-branch`，用于显式绑定 bug Jira 与当前开发分支
  - 把 branch 输入接到统一 workflow 状态语义中，branch 未提供时 `Execution` 可进入 `waiting_external_input`
- `memory-bank/features/v1/需求文档.md`：
  - `CLI 需求` 要求能力通过显式 CLI 命令暴露
  - `工作流需求` 与 `检查点与恢复要求` 要求等待外部输入时使用统一 `waiting_external_input` 语义，并能从持久化状态恢复
- `memory-bank/features/v1/技术方案.md`：
  - `Execution` 阶段允许因外部输入缺失进入 `waiting_external_input`
  - CLI 入口只做参数校验与结果展示，业务状态仍由 workflow/app 层统一更新

### 验证记录

1. 验证对象：`run bind-branch` 命令入口与 `Execution` 的 branch 等待语义
   触发方式：先修改 `tests/unit/execution/execution.spec.ts` 与 `tests/integration/cli/run-record-commands.spec.ts`，再运行 `npm run test:unit -- tests/unit/execution/execution.spec.ts` 与 `npm run test:integration -- tests/integration/cli/run-record-commands.spec.ts`
   预期结果：实现前准确暴露“缺少 branch_binding 等待逻辑”和“CLI 命令不存在”；实现后命令、等待原因与上下文更新都成立
   实际结果：通过；red 阶段分别暴露 unit 3 个失败断言与 integration 4 个失败断言，green 后 unit `71/71`、integration `10/10` 通过

2. 验证对象：受影响的 Jira 写回子流程回归
   触发方式：在 `tests/integration/cli/writeback-flows.spec.ts` 中补上 `run bind-branch` 前置动作后运行 `npm run test:integration`
   预期结果：`jira_writeback_only` 子流程在显式绑定 branch 后仍能继续完成 preview / approve / execute
   实际结果：通过；integration 全量 `10/10` 通过

3. 验证对象：TypeScript 类型一致性
   触发方式：运行 `npm run typecheck`
   预期结果：新增命令、workflow 输入与持久化 artifact 辅助函数在仓库范围内类型一致
   实际结果：通过；命令退出码为 0

### 当前边界说明

- 目前只完成了任务 3 的步骤 1，不包含 `run ensure-subtask`、`run provide-fix-commit` 或 task 4 的 Jira connector preview / execute 语义。
- `run bind-branch` 当前负责记录“branch 已显式绑定”的本地 artifact 与 context ref，不会执行真实 Jira branch 关联写回；真实外部写入仍保留给后续 `preview -> approve -> execute` 链路。
- `Execution` 现阶段把 branch 视为继续进入 `Artifact Linking` 的必要外部输入之一，但 commit 仍未纳入这一等待条件，避免在步骤 1 里提前扩展步骤 3 的范围。

## 2026-03-19 - v2 任务 2：扩展核心数据模型、artifact 与 side-effect ledger 契约

### 本轮完成内容

- 在 `src/domain/schemas.ts` 中扩展 `ExecutionContext`，新增并冻结以下 v2 最小字段：
  - `active_bug_issue_key`
  - `jira_subtask_ref`
  - `jira_subtask_result_ref`
  - `git_branch_binding_ref`
  - `git_commit_binding_refs`
- 在 `src/domain/schemas.ts` 中为上述 ref 新增明确形状约束：
  - `artifact://jira/subtasks/preview/<id>`
  - `artifact://jira/subtasks/result/<id>`
  - `artifact://jira/bindings/branch/<id>`
  - `artifact://jira/bindings/commit/<id>`
- 在 `src/domain/schemas.ts` 中新增 `JIRA_V2_SIDE_EFFECT_OPERATIONS` 与 `JiraV2SideEffectLedgerEntrySchema`，固定：
  - `jira.create_subtask`
  - `jira.bind_branch`
  - `jira.bind_commit`
  并要求 terminal `result_ref` 与对应 artifact ref 类型匹配，避免 branch/commit/subtask 结果串用。
- 在 `src/domain/enums.ts` 中扩展 `EXECUTION_CONTEXT_STORAGE_PROJECTION.context`，把 v2 新字段纳入 `context.json` 的允许投影。
- 在 `src/domain/enums.ts` 中新增 `V2_RUNTIME_FIELD_CARRIERS`，显式记录：
  - `active_bug_issue_key` 只在 `context.json` 保存短 key
  - subtask / branch / commit 只在 `context.json` 保存 artifact ref
  - preview / execute 正文与可读摘要进入 `artifacts/`
  - 幂等、dedupe、payload hash、target/result ref、状态和尝试次数进入 `side-effects.ndjson`
- 在 `src/app/run-lifecycle.ts` 中为 run 初始化补齐这些字段的默认态，避免 v2 任务 2 之后出现“旧 run 无法序列化到新 schema”的问题。
- 在 `src/workflow/state-machine.ts` 中把这些 v2 运行态字段接入 rollback reset：
  - 回退到 `Context Resolution` 会清空 `active_bug_issue_key`
  - 回退到 `Artifact Linking` 会清空 subtask / branch / commit 绑定 ref
- 在测试侧补齐任务 2 的红绿覆盖：
  - `tests/unit/domain/contracts.spec.ts` 锁定新增上下文字段、artifact ref 约定、v2 Jira ledger operation 与 carrier 边界
  - `tests/unit/storage/persistence-foundation.spec.ts` 锁定 `context.json` allowlist 已纳入上述新增字段
  - `tests/unit/app/run-lifecycle.spec.ts`、`tests/unit/workflow/state-machine.spec.ts`、`tests/unit/execution/execution.spec.ts`、`tests/unit/jira-writeback/jira-writeback.spec.ts`、`tests/unit/feishu-writeback/feishu-writeback.spec.ts`、`tests/unit/report/report-writer.spec.ts` 同步到新 `ExecutionContext` 契约

### 依据

- 用户指令：继续执行 `memory-bank/features/v2/实施计划.md` 的任务 2；每完成一个步骤先测试，通过后再继续；测试通过后更新 `progress.md` 与 `architecture.md`，在此之前不进入任务 3。
- `memory-bank/features/v2/实施计划.md` 任务 2：
  - 为 `ExecutionContext` 增加 `active_bug_issue_key`、`jira_subtask_ref`、`jira_subtask_result_ref`、`git_branch_binding_ref`、`git_commit_binding_refs`
  - 为 branch 绑定、子任务 preview/result、commit 绑定补齐 artifact ref 约定
  - 固定 `jira.create_subtask`、`jira.bind_branch`、`jira.bind_commit` 的 side-effect operation 命名与最小账本字段
  - 明确这些新增字段在 `context.json`、artifact、ledger 之间的承载边界
- `memory-bank/features/v1/需求文档.md`：
  - `ExecutionContext` 需支持序列化、恢复执行、失败留场与 CLI 摘要展示
  - Jira 写回契约要求保留 `idempotency_key`、`target_ref`、`result_id`、`updated_at` 等结构化字段
- `memory-bank/features/v1/技术方案.md`：
  - `ExecutionContext` 只保存当前有效态，`context.json` 只允许保存索引、摘要、hash 与 artifact ref
  - `SideEffectLedgerEntry` 负责幂等、dedupe、payload hash、target/result ref 与执行状态历史

### 验证记录

1. 验证对象：任务 2 步骤 1 的新增 `ExecutionContext` 字段与初始化默认态
   触发方式：先修改 `tests/unit/domain/contracts.spec.ts` 与 `tests/unit/app/run-lifecycle.spec.ts`，再运行 `npm run test:unit -- tests/unit/domain/contracts.spec.ts` 和 `npm run test:unit -- tests/unit/app/run-lifecycle.spec.ts`
   预期结果：实现前暴露新增字段缺口；实现后 `ExecutionContext` 与 run 初始化都包含这些字段
   实际结果：通过；相关单元测试回到 69/69 通过

2. 验证对象：任务 2 步骤 2 的 subtask / branch / commit artifact ref 约定
   触发方式：先在 `tests/unit/domain/contracts.spec.ts` 增加合法/非法 ref 断言，再运行 `npm run test:unit -- tests/unit/domain/contracts.spec.ts`
   预期结果：preview/result、branch/commit ref 不能串位，非法前缀必须被 schema 拒绝
   实际结果：通过；domain contracts 新增 ref 约束后，单测 70/70 通过

3. 验证对象：任务 2 步骤 3 的 v2 Jira side-effect operation 与 ledger 契约
   触发方式：先在 `tests/unit/domain/contracts.spec.ts` 增加 `JIRA_V2_SIDE_EFFECT_OPERATIONS` 与 `JiraV2SideEffectLedgerEntrySchema` 断言，再运行 `npm run test:unit -- tests/unit/domain/contracts.spec.ts`
   预期结果：只接受 `jira.create_subtask`、`jira.bind_branch`、`jira.bind_commit`；`result_ref` 需与 operation 对应
   实际结果：通过；domain contracts 新增 ledger 契约后，单测 71/71 通过

4. 验证对象：任务 2 步骤 4 的 `context.json / artifacts / side-effects.ndjson` 承载边界
   触发方式：先在 `tests/unit/domain/contracts.spec.ts` 与 `tests/unit/storage/persistence-foundation.spec.ts` 增加 `EXECUTION_CONTEXT_STORAGE_PROJECTION`、`EXECUTION_CONTEXT_ALLOWLIST` 和 `V2_RUNTIME_FIELD_CARRIERS` 断言，再运行 `npm run test:unit -- tests/unit/domain/contracts.spec.ts` 和 `npm run test:unit -- tests/unit/storage/persistence-foundation.spec.ts`
   预期结果：`context.json` 只新增 key/ref 字段；payload 正文不进入 allowlist；carrier 说明与 artifact/ledger 分工一致
   实际结果：通过；domain/storage 单测保持 71/71 通过

### 当前边界说明

- 尚未开始 `memory-bank/features/v2/实施计划.md` 的任务 3；本轮只冻结运行态字段、ref 约定、v2 Jira ledger operation 和 context/artifact/ledger 边界，不新增 CLI 命令、不接 workflow 入口、不实现 connector preview/execute。
- `jira_subtask_ref` 当前只固定为 subtask preview artifact ref；真正的 subtask preview draft/result payload、target 解析和 dedupe 细节仍属于任务 4。
- `git_branch_binding_ref` 与 `git_commit_binding_refs` 当前只固定 artifact ref 语义，不提前决定 branch/commit 绑定命令的交互输入、审批流或 execute 行为，这些仍保留给任务 3/4。

## 2026-03-19 - v2 任务 1：扩展项目画像与配置检查，支持 Jira 子任务 / branch / commit 绑定规则

### 本轮完成内容

- 在 `src/domain/schemas.ts` 中扩展 `ProjectProfile.jira`，新增：
  - `subtask.issue_type_id`、`subtask.summary_template` 作为子任务创建的最小必填字段
  - `subtask.description_template` 作为可选补充字段
  - `branch_binding.target_issue_source`、`commit_binding.target_issue_source` 作为 branch / commit 绑定的最小必填规则
  - `branch_binding.fallback_to_bug`、`commit_binding.fallback_to_bug` 作为可选回退边界
- 在 `src/domain/schemas.ts` 中扩展 `ProjectProfile.gitlab`，新增 `branch_binding.input_mode` 作为 branch 绑定输入模式的最小必填字段，并以 `validate_naming_rule` 保留可选校验开关；既有 `branch_naming_rule` 保持不变，继续承担命名规则职责。
- 在 `src/skills/config-loader/index.ts` 中把上述新增字段纳入项目画像完整性检查、缺失字段提示与 section schema 校验；`bind jira` / `bind gitlab` 现在会拒绝缺少 v2 绑定规则的旧式 payload。
- 在 `src/app/project-profile.ts` 中扩展 `inspect config` 输出，新增 `guidance` 分组，把缺失项按 `bind jira`、`bind gitlab` 等命令 owner 聚合，方便开发者按命令补录；同时把 `inspect connectors` 的 Jira / GitLab 就绪判断与新字段保持一致。
- 在测试侧补齐任务 1 的红绿覆盖：
  - `tests/unit/config/config-loader.spec.ts` 覆盖 Jira 子任务/branch/commit 规则、GitLab branch binding 输入模式、缺失字段、非法字段、旧配置兼容边界
  - `tests/integration/cli/config-commands.spec.ts` 覆盖 `bind jira` / `bind gitlab` 对旧式 payload 的拒绝，以及 `inspect config` 对新增缺口的命令级提示
- 在全量验证时发现 `tests/milestones/document-consistency.spec.ts` 仍读取旧的 `memory-bank/*.md` 路径；本轮按最小修复把它调整为优先读取 `memory-bank/features/v1/*.md`，旧路径兜底，避免文档目录迁移导致回归测试误报。

### 依据

- 用户指令：阅读所有 `memory-bank` 文档，继续执行 `memory-bank/features/v2/实施计划.md` 的任务 1；每完成一个步骤先测试，通过后再继续；验证完成后更新 `progress.md` 和 `architecture.md`，且在此之前不进入任务 2。
- `memory-bank/features/v2/实施计划.md` 任务 1：
  - 扩展 `ProjectProfile.jira` 的子任务创建、branch 绑定、commit 绑定最小配置字段
  - 扩展 `ProjectProfile.gitlab` 的 branch 绑定输入模式，并保持与 `branch_naming_rule` 兼容
  - 扩展 `bind jira`、`bind gitlab` 的配置写入与 schema 校验
  - 扩展 `inspect config` 的完整性检查与缺失项提示逻辑
- `memory-bank/features/v1/需求文档.md`：
  - “项目关系绑定需求”要求项目画像作为唯一可信配置源，缺失关键信息时必须提示补录，不能静默猜测
  - “CLI 需求”要求配置通过 CLI 显式维护和检查
- `memory-bank/features/v1/技术方案.md`：
  - `ProjectProfile` 作为运行期唯一可信配置来源，需可版本化、可校验完整性、支持凭证与规则隔离
  - `CLI Layer` 只负责命令入口、参数校验和结果展示；配置语义仍应由 domain / config-loader 收敛

### 验证记录

1. 验证对象：任务 1 步骤 1 的 Jira 新字段与缺失检查
   触发方式：先修改 `tests/unit/config/config-loader.spec.ts`，再运行 `npm run test:unit -- tests/unit/config/config-loader.spec.ts`
   预期结果：在实现前暴露 `jira.subtask.*`、`jira.branch_binding.*`、`jira.commit_binding.*` 缺口；实现后相关断言通过
   实际结果：通过；新增 Jira 配置规则被纳入 `ProjectProfile` 与 config inspection，unit 测试最终 69/69 通过

2. 验证对象：任务 1 步骤 2-4 的 GitLab 新字段、`bind` 校验与 `inspect config` 提示
   触发方式：先修改 `tests/unit/config/config-loader.spec.ts` 与 `tests/integration/cli/config-commands.spec.ts`，再运行 `npm run test:integration -- tests/integration/cli/config-commands.spec.ts`
   预期结果：`gitlab.branch_binding.input_mode` 缺失或非法时被识别；`bind jira` / `bind gitlab` 拒绝旧式 payload；`inspect config` 能按命令 owner 提示新增字段缺口
   实际结果：通过；CLI integration 共 9/9 通过，`guidance` 输出与缺失字段分组符合预期

3. 验证对象：TypeScript 契约完整性
   触发方式：运行 `npm run typecheck`
   预期结果：新增 schema、CLI 输出与测试夹具在全仓库范围内类型一致
   实际结果：通过；命令退出码为 0

4. 验证对象：全量测试回归
   触发方式：运行 `npm run test`
   预期结果：unit / integration / acceptance / milestone 全部通过，且不再受旧文档路径影响
   实际结果：通过；unit 69/69、integration 9/9、acceptance 7/7、milestones 3/3 全部通过

5. 验证对象：构建入口
   触发方式：运行 `npm run build`
   预期结果：扩展后的 `ProjectProfile`、config-loader、CLI app 层和测试修复不影响构建
   实际结果：通过；命令退出码为 0

### 当前边界说明

- 尚未开始 `memory-bank/features/v2/实施计划.md` 的任务 2；本轮只完成项目画像 schema、配置写入/校验、CLI 检查输出与相关测试，不涉及 `ExecutionContext`、artifact ref、side-effect ledger 或 workflow 新字段。
- 当前 `ProjectProfile.jira` / `ProjectProfile.gitlab` 新增字段只表达“配置规则”，不提前实现真实 Jira 子任务创建、branch / commit 写回 payload、preview / execute、dedupe 或 reconcile。
- `inspect config` 的 `guidance` 目前只做命令 owner 聚合，不承担自动修复或交互式补录能力，继续遵守 CLI-first、显式配置优先的边界。

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

## 2026-03-19 - 任务 7：实现 Jira Intake 与项目上下文解析

### 本轮完成内容

- 在 `src/domain/enums.ts` 与 `src/domain/schemas.ts` 中补齐任务 7 的最小契约：新增 `StageResult` 状态、`JiraIssueSnapshot`、`JiraIssueRequirementHint`、`JiraIssueWritebackTarget`、`RequirementCandidate`、`JiraIntakeData`、`ProjectContextData` 及对应 stage result schema，让 `Intake` / `Context Resolution` 先有稳定输入输出，再由后续 workflow 编排接入。
- 在 `src/infrastructure/connectors/jira/index.ts` 中实现 Jira connector 的最小只读映射能力：把原始 issue 记录规整为 `JiraIssueSnapshot`，显式保留描述、状态、标签、需求线索和写回目标，并补充 `permission_denied` / `validation_error` 的结构化错误语义。
- 在 `src/skills/jira-intake/index.ts` 中实现 `runJiraIntake()`，把结构化快照整理为 `StageResult`，确保 skill 只消费快照、不依赖 Jira 原始接口。
- 在 `src/infrastructure/repo/workspace.ts` 中实现 Repo Workspace Adapter 的最小只读能力：验证 `repo.local_path` 的绝对路径与可访问性，根据 issue 标签/文本信号解析模块候选，并在 repo 不可访问时返回 `repo_resolution_failed`。
- 在 `src/skills/project-context/index.ts` 中实现 `resolveProjectContext()`：按 `ProjectProfile.jira.requirement_link_rules` 的优先级解析 requirement 绑定，覆盖唯一命中、多候选等待人工选择、未命中但允许 `unresolved` 继续，以及 repo 打不开时的失败语义。
- 新增 `tests/unit/intake/jira-intake.spec.ts` 与 `tests/unit/intake/project-context.spec.ts`，通过红绿测试锁定任务 7 的最小行为闭环。

### 依据

- 用户指令：阅读 `memory-bank` 全部文档后继续执行实施计划任务 7；在验证通过前不开始任务 8；测试通过后更新 `progress.md` 与 `architecture.md`；在 worktree 代码测试通过后合并到 `main`。
- `memory-bank/实施计划.md` 任务 7：要求实现 Jira bug 读取、需求线索提取、项目匹配、仓库定位和模块候选解析，并定义合法 issue、权限不足、需求映射失败和多候选需求时的错误或等待语义。
- `memory-bank/需求文档.md`：
  - “Jira 集成需求”：`Intake` 需要读取 bug 基础信息、描述、状态、标签和需求线索。
  - “关联需求识别规则”：绑定规则必须支持多来源、优先级排序、无法识别时的阻塞/人工指定/降级为 `unresolved`，以及多候选时人工确认。
  - “未绑定需求处理策略”：当允许继续时必须显式标记 `requirement_binding_status = unresolved` 并保留 `binding_reason`。
- `memory-bank/技术方案.md`：
  - `jira-intake` / `project-context`：skill 只消费已读取的结构化对象并返回结构化 `StageResult<T>`。
  - “11.2 Jira Connector”：connector 负责读取状态、描述、标签、关联线索和回写目标。
  - “11.5 Repo Workspace Adapter”：负责根据 `repo.local_path` 打开本地仓库，并根据 `repo.module_rules` 解析模块候选。

### 验证记录

1. 验证对象：任务 7 红灯起点
   触发方式：先运行 `npm run test:unit -- tests/unit/intake/jira-intake.spec.ts tests/unit/intake/project-context.spec.ts`
   预期结果：在实现前准确因为缺少 Jira connector / intake / project-context 模块而失败，而不是误绿
   实际结果：通过；首轮失败准确暴露 `src/infrastructure/connectors/jira/index.ts` 缺失，说明新增测试确实在覆盖任务 7 的新能力面

2. 验证对象：任务 7 Intake / Context Resolution 单元闭环
   触发方式：补实现后再次运行 `npm run test:unit -- tests/unit/intake/jira-intake.spec.ts tests/unit/intake/project-context.spec.ts`
   预期结果：Jira 快照映射、权限错误语义、需求绑定优先级、多候选等待、`unresolved` 回退和 repo 解析异常全部通过
   实际结果：通过；新增 7 项断言全部通过，其中一次失败暴露“显式 `module:` 标签应优先于自由文本匹配”，修正后重新验证通过

3. 验证对象：根级测试聚合入口
   触发方式：运行 `npm test`
   预期结果：任务 7 新增 unit 测试通过，任务 1-6 的既有 unit / integration / acceptance 回归继续通过
   实际结果：通过；unit 共 32/32 通过，integration `config-commands` 2/2 通过，acceptance `task1-project-skeleton` 4/4 通过

4. 验证对象：TypeScript 类型检查
   触发方式：运行 `npm run typecheck`
   预期结果：新增 domain 契约、connector、repo adapter、skills 与测试夹具可通过类型检查
   实际结果：通过；命令退出码为 0

5. 验证对象：构建入口
   触发方式：运行 `npm run build`
   预期结果：新增 `src/infrastructure/connectors/jira`、`src/infrastructure/repo/workspace.ts`、`src/skills/jira-intake`、`src/skills/project-context` 可正常编译到 `dist/`
   实际结果：通过；命令退出码为 0

### 当前边界说明

- 尚未开始任务 8；当前只实现 `Intake` / `Context Resolution` 所需的最小结构化快照、绑定策略和 repo 解析，不生成 `Requirement Brief`，也不补 `Requirement Synthesis` 的 renderer / 导出逻辑。
- 当前 Jira connector 仍然是“结构化映射层”，不直接发起真实 Jira 网络读取；真实 reader capability、认证和远端健康检查仍属于后续 infrastructure 任务。
- 当前 requirement 绑定依赖 `JiraIssueSnapshot.requirement_hints` 这一已标准化输入；它刻意避免 skill 直接读取 Jira 原始字段，以保持 connector owner 清晰。
- 当前模块候选收敛规则为“显式 `module:<id>` 标签优先，其次才是 summary/description/label 自由文本命中”；如果没有模块信号，会保留 repo 上下文并输出 warning，而不是静默猜测唯一模块。

## 2026-03-19 - 任务 8：实现 `Requirement Synthesis` 与 brief 渲染

### 本轮完成内容

- 在 `src/domain/schemas.ts` 中新增 `RequirementSynthesisStageResultSchema` 与对应类型导出，让 `Requirement Synthesis` 与前两阶段一样遵守统一 `StageResult<T>` 契约，而不是由 renderer 或 workflow 临时拼接半结构化对象。
- 在 `src/skills/requirement-summarizer/index.ts` 中实现 `synthesizeRequirementBrief()`：基于 `JiraIssueSnapshot`、`ProjectContextData` 和 `ProjectProfile` 生成结构化 `Requirement Brief`，固定 `known_context`、`fix_goal`、`pending_questions` 与 `source_refs` 的最小表达。
- 在 `src/skills/requirement-summarizer/index.ts` 中显式处理 unresolved requirement：当 requirement 仍未绑定且项目策略要求最终绑定时，brief 会继续生成，但同时输出稳定 warning 与待确认问题，避免后续阶段误把 unresolved 状态当成可静默忽略。
- 在 `src/renderers/requirement-brief.ts` 与 `src/renderers/index.ts` 中实现 brief 的 CLI / Markdown 双渲染，保证 `issue_key`、`project_id`、关联需求、已知上下文、修复目标、待确认事项和 `source_refs` 在两种展示渠道中的业务信息保持一致。
- 在 `src/skills/index.ts` 中纳入 `requirement-summarizer` 公共导出，并新增 `tests/unit/requirement-brief/requirement-brief.spec.ts`，通过红绿测试锁定任务 8 的最小闭环。

### 依据

- 用户指令：阅读 `memory-bank` 全部文档后继续执行实施计划任务 8；每在验证测试结果之前不开始下一个任务；验证通过后更新 `progress.md` 与 `architecture.md`；在 worktree 代码测试通过后合并到 `main`。
- `memory-bank/实施计划.md` 任务 8：要求实现 `Requirement Synthesis` 与 brief 渲染，覆盖最小字段、unresolved requirement 展示规则、CLI/Markdown 一致渲染，以及 brief 作为后续阶段输入依据的稳定表达。
- `memory-bank/需求文档.md`：
  - “需求文档生成需求”：`Requirement Brief` 至少包含 bug 摘要、关联需求、已知上下文、修复目标、待确认事项，且必须可在 CLI 展示、导出为 Markdown、作为后续输入依据。
  - “Requirement Brief 最小字段集”：`issue_key`、`project_id`、`linked_requirement`、`requirement_binding_status`、`binding_reason`、`known_context`、`fix_goal`、`pending_questions`、`generated_at`、`source_refs`。
  - “未绑定需求处理策略”：允许在 requirement 未绑定时继续生成 `Requirement Brief`，但必须显式标记 `unresolved` 并保留 `binding_reason`。
- `memory-bank/技术方案.md`：
  - “7.3 RequirementBrief”：要求同时支持 CLI 展示、Markdown 导出，并作为后续阶段输入依据。
  - “10.2 requirement-summarizer”：`requirement-summarizer` 负责生成 `Requirement Brief`。
  - “Renderers” 设计：渲染逻辑应独立于 skill，避免把 CLI / Markdown 展示混入业务推理。

### 验证记录

1. 验证对象：任务 8 红灯起点
   触发方式：先运行 `npm run test:unit -- tests/unit/requirement-brief/requirement-brief.spec.ts`
   预期结果：实现前因缺少 `requirement-summarizer` 模块而失败，而不是误绿
   实际结果：通过；首轮失败准确暴露 `src/skills/requirement-summarizer/index.ts` 缺失，说明新增测试确实覆盖到了任务 8 的新能力面

2. 验证对象：任务 8 Requirement Brief 单元闭环
   触发方式：补实现后再次运行 `npm run test:unit -- tests/unit/requirement-brief/requirement-brief.spec.ts`
   预期结果：resolved / unresolved brief 生成、待确认问题、warning 语义，以及 CLI / Markdown 渲染一致性全部通过
   实际结果：通过；新增 3 项断言全部通过，确认 brief 结构和双渲染输出已稳定

3. 验证对象：根级测试聚合入口
   触发方式：运行 `npm test`
   预期结果：任务 8 新增 unit 测试通过，任务 1-7 的既有 unit / integration / acceptance 回归继续通过
   实际结果：通过；unit 共 35/35 通过，integration `config-commands` 2/2 通过，acceptance `task1-project-skeleton` 4/4 通过

4. 验证对象：TypeScript 类型检查
   触发方式：运行 `npm run typecheck`
   预期结果：新增 stage result schema、summarizer、renderers 与测试夹具可通过类型检查
   实际结果：通过；命令退出码为 0

5. 验证对象：构建入口
   触发方式：运行 `npm run build`
   预期结果：新增 `src/skills/requirement-summarizer` 与 `src/renderers/requirement-brief.ts` 可正常编译到 `dist/`
   实际结果：通过；命令退出码为 0

### 当前边界说明

- 尚未开始任务 9；当前只实现 `Requirement Brief` 的结构化生成与 CLI / Markdown 渲染，不实现代码搜索、候选文件定位、影响模块扩展分析或根因假设推断。
- 当前 brief 的 `source_refs` 已作为后续 artifact / checkpoint 绑定的稳定输入面，但本轮没有提前把 brief 真正写入 run artifacts、审批记录或 checkpoint；这些物理绑定仍属于后续 workflow / storage 接入任务。
- 当前 `fix_goal` 与 `known_context` 采用“结构化输入归纳 + 稳定模板表达”的方式生成，刻意避免引入自由发挥式总结或额外需求扩写。

## 2026-03-19 - 任务 9：实现 `Code Localization`

### 本轮完成内容

- 在 `src/domain/schemas.ts` 中新增 `CodeLocalizationDataSchema` 与 `CodeLocalizationStageResultSchema`，把任务 9 的最小输出面固定为 `impact_modules`、`code_targets`、`root_cause_hypotheses` 三部分，并继续复用统一 `StageResult<T>` 契约。
- 在 `src/infrastructure/repo/workspace.ts` 中补充 Repo Workspace Adapter 的只读代码搜索能力：解析 `repo.module_rules` 的搜索根路径、递归读取候选目录、归一化为相对仓库路径，并基于 issue / brief 信号做最小命中排序。
- 在 `src/skills/code-locator/index.ts` 中实现 `locateCodeTargets()`：消费 `ProjectProfile`、`JiraIssueSnapshot`、`ProjectContextData`、`RequirementBrief`，输出唯一命中、无结果、多个候选三类稳定结构化结果，并显式保留 `source_refs`、影响模块和根因假设。
- 在 `src/skills/index.ts` 中纳入 `code-locator` 公共导出，保持 skills 层统一入口不漂移。
- 新增 `tests/unit/code-locator/code-locator.spec.ts`，通过红绿测试锁定任务 9 的最小闭环：路径归一化、唯一命中完成态、无结果等待态、多候选等待态、影响模块输出与根因假设表达。

### 依据

- 用户指令：请阅读所有 `memory-bank` 文档，并继续执行实施计划的任务 9；在验证测试结果之前不要开始下一个任务；测试验证通过后更新 `progress.md`，补充架构文档，并且不要进入任务 10。
- `memory-bank/实施计划.md` 任务 9：要求实现 `Code Localization`，覆盖模块规则解析、仓库只读搜索、候选路径归一化、唯一/无结果/多候选分支、影响模块、根因假设以及可回溯输出。
- `memory-bank/需求文档.md`：
  - “Code Localization” 阶段要求：在不改代码的前提下生成候选代码位置、影响模块和根因假设。
  - “ExecutionContext 最小字段集”：后续运行态必须保留 `repo_selection`、`code_targets`、`root_cause_hypotheses`。
  - “Requirement Brief” 作为后续阶段输入依据：任务 9 需要消费已生成的 brief，而不是重新从 Jira 原始文本自由拼接。
- `memory-bank/技术方案.md`：
  - “10.2 code-locator”：`code-locator` 负责输出代码位置候选、影响模块和根因假设。
  - “11.5 Repo Workspace Adapter”：基础设施层负责根据 `repo.local_path` 打开本地仓库、执行文件搜索、路径归一化和候选定位，且必须保持只读。
  - “7.2 ExecutionContext”：代码定位结果最终需要以 `code_targets` / `root_cause_hypotheses` 的形式进入 workflow 当前有效态。

### 验证记录

1. 验证对象：任务 9 红灯起点
   触发方式：先运行 `npm run test:unit -- tests/unit/code-locator/code-locator.spec.ts`
   预期结果：实现前因缺少 `src/skills/code-locator/index.ts` 而失败，而不是误绿
   实际结果：通过；首轮失败准确暴露 `src/skills/code-locator/index.ts` 缺失，说明新增测试确实覆盖到了任务 9 的新能力面

2. 验证对象：任务 9 Code Localization 单元闭环
   触发方式：补实现后再次运行 `npm run test:unit -- tests/unit/code-locator/code-locator.spec.ts`
   预期结果：唯一命中、无结果、多候选三类结果，以及路径归一化、影响模块和根因假设字段全部通过
   实际结果：通过；新增 3 项断言全部通过，期间一次失败准确暴露 `code-locator` 内部字段名接错，修正后重新验证通过

3. 验证对象：根级测试聚合入口
   触发方式：运行 `npm test`
   预期结果：任务 9 新增 unit 测试通过，任务 1-8 的既有 unit / integration / acceptance 回归继续通过
   实际结果：通过；unit 共 38/38 通过，integration `config-commands` 2/2 通过，acceptance `task1-project-skeleton` 4/4 通过

4. 验证对象：TypeScript 类型检查
   触发方式：运行 `npm run typecheck`
   预期结果：新增 `Code Localization` 契约、repo 搜索能力与 skill 导出可通过类型检查
   实际结果：通过；命令退出码为 0

5. 验证对象：构建入口
   触发方式：运行 `npm run build`
   预期结果：新增 `src/skills/code-locator` 与 `src/infrastructure/repo/workspace.ts` 的更新可正常编译到 `dist/`
   实际结果：通过；命令退出码为 0

### 当前边界说明

- 尚未开始任务 10；当前只实现任务 9 所需的只读代码定位与结构化输出，不生成 fix summary、验证建议、开放风险，也不接入 `Fix Planning` 审批门。
- 当前代码搜索策略刻意保持最小：只在 `repo.module_rules` 解析出的目录下递归读取文本文件，并基于 issue / brief 的稳定词项做命中排序；没有提前引入 AST、语义索引、Git 历史或复杂启发式。
- 当前“定位产物保存与可回溯”先通过 `StageResult` 的 `source_refs`、归一化 `code_targets` 和稳定 `impact_modules` 输出面固定下来；真正写入 run artifact、checkpoint 或审批绑定仍属于后续 workflow / storage 任务。
- 当前 `impact_modules` 仍以 `ProjectContext` 阶段已有的模块候选为主，命中结果只在未预先缩窄模块时作为补充，不在本轮抢先重定义 `ExecutionContext` 字段。

## 2026-03-19 - 任务 10：实现 `Fix Planning`

### 本轮完成内容

- 在 `src/domain/schemas.ts` 中新增 `FixPlanningDataSchema` 与 `FixPlanningStageResultSchema`，把任务 10 的最小输出面固定为 `fix_summary`、`impact_scope`、`verification_plan`、`open_risks`、`pending_external_inputs`，以及对 `code_targets` / `root_cause_hypotheses` 的显式引用。
- 在 `src/skills/fix-planner/index.ts` 中实现 `createFixPlan()`：消费 `ProjectProfile`、`JiraIssueSnapshot`、`ProjectContextData`、`RequirementBrief` 与 `CodeLocalizationStageResult`，输出可审批、可追溯、可交给 `Execution` 阶段消费的结构化 fix plan。
- 在 `src/skills/fix-planner/index.ts` 中显式处理 `Code Localization` 未收敛的场景：当定位结果仍是 `waiting` 或没有有效定位数据时，`Fix Planning` 返回 `waiting`，保留原有 `waiting_for` 语义，并明确阻止凭空生成计划。
- 在 `src/skills/index.ts` 中纳入 `fix-planner` 公共导出，保持 skills 层统一入口不漂移。
- 新增 `tests/unit/fix-planner/fix-planner.spec.ts`、扩展 `tests/unit/domain/contracts.spec.ts`、补充 `tests/unit/workflow/state-machine.spec.ts` 回归用例，通过红绿测试锁定任务 10 的最小闭环与既有审批/回退语义。

### 依据

- 用户指令：请阅读所有 `memory-bank` 文档，并继续执行实施计划的任务 10；每在验证测试结果之前，请勿开始下一个任务；测试验证通过后记录到 `progress.md`，补充 `architecture.md`，并且在此之前不要进行任务 11；在 worktree 代码测试通过后合并到 `main`。
- `memory-bank/实施计划.md` 任务 10：要求实现 `Fix Planning`，覆盖最小字段、与代码定位结果的引用关系、审批门和 revise 后旧计划失效规则，以及到 `Execution` 阶段的交接字段。
- `memory-bank/需求文档.md`：
  - “工作流需求”：`Fix Planning` 阶段需要输出修复建议和验证建议，并作为第二个关键审批门。
  - “审批与人工确认需求”：`Fix Planning` 后用户需要确认是否进入修复执行。
  - “ExecutionContext 最小字段集”：运行态至少保留 `fix_plan` 与 `verification_plan`，说明本阶段输出必须能被后续执行消费。
- `memory-bank/技术方案.md`：
  - “9.1 主流程说明”：`Fix Planning` 负责生成修复建议、影响范围和验证建议。
  - “10.2 fix-planner”：`fix-planner` 负责输出修复建议、验证建议与开放风险。
  - “工作流状态机设计”：`Fix Planning` 属于审批门阶段，`revise` 后需要让旧输出失效。

### 验证记录

1. 验证对象：任务 10 红灯起点
   触发方式：先运行 `npm run test:unit -- tests/unit/fix-planner/fix-planner.spec.ts`
   预期结果：实现前因缺少 `src/skills/fix-planner/index.ts` 与 `FixPlanning` domain 契约而失败，而不是误绿
   实际结果：通过；首轮失败准确暴露 `src/skills/fix-planner/index.ts` 缺失以及 `FixPlanningDataSchema` / `FixPlanningStageResultSchema` 未定义

2. 验证对象：任务 10 Fix Planning 单元闭环
   触发方式：补实现后再次运行 `npm run test:unit -- tests/unit/fix-planner/fix-planner.spec.ts`
   预期结果：审批前 fix plan 字段、引用追溯、Execution 交接字段，以及未收敛定位时的 waiting 语义全部通过
   实际结果：通过；新增 3 项断言全部通过，确认 `completed` / `waiting` 两类输出，以及“completed 但缺少 actionable code target 时不崩溃”的输入护栏均已稳定

3. 验证对象：Fix Planning domain 契约与 workflow 回归
   触发方式：运行 `npm run test:unit -- tests/unit/domain/contracts.spec.ts` 与 `npm run test:unit -- tests/unit/workflow/state-machine.spec.ts`
   预期结果：`FixPlanning` schema 能固定最小字段集，且既有 workflow 仍把 `Fix Planning` 视为审批门并在 revise 回退时清空当前有效 plan
   实际结果：通过；domain 契约 10/10 通过，workflow 状态机 5/5 通过

4. 验证对象：根级测试聚合入口
   触发方式：运行 `npm test`
   预期结果：任务 10 新增 unit 测试通过，任务 1-9 的既有 unit / integration / acceptance 回归继续通过
   实际结果：通过；unit 共 43/43 通过，integration `config-commands` 2/2 通过，acceptance `task1-project-skeleton` 4/4 通过

5. 验证对象：TypeScript 类型检查
   触发方式：运行 `npm run typecheck`
   预期结果：新增 `Fix Planning` 契约、skill 与测试夹具可通过类型检查
   实际结果：通过；命令退出码为 0

6. 验证对象：构建入口
   触发方式：运行 `npm run build`
   预期结果：新增 `src/skills/fix-planner` 与相关 domain 更新可正常编译到 `dist/`
   实际结果：通过；命令退出码为 0

### 当前边界说明

- 尚未开始任务 11；当前只实现 `Fix Planning` 所需的结构化计划生成与 waiting 语义，不实现 `Execution` 阶段的外部输入补录、验证结果标准化或 GitLab 产物录入。
- 当前 `Fix Planning` 仍是纯 skill 输出，不提前把 fix plan 真正写入 run artifacts、审批记录或 checkpoint；这些物理绑定仍属于后续 workflow / storage 接入任务。
- 当前 plan 内容刻意保持为稳定模板式归纳，依赖 `Requirement Brief` 与 `Code Localization` 已产出的结构化输入，不引入自由发挥式方案扩写或自动改代码承诺。

## 2026-03-19 - 任务 11：实现 `Execution` 阶段的外部输入补录与标准化

### 本轮完成内容

- 在 `src/domain/enums.ts` 与 `src/domain/schemas.ts` 中新增任务 11 需要的验证结果契约：`VERIFICATION_OUTCOMES`、`VERIFICATION_CHECK_STATUSES`、`VERIFICATION_INPUT_SOURCES`、`VerificationCheckSchema`、`VerificationResultSchema`、`VerificationRecordingStageResultSchema`，把 `Execution` 阶段可落入当前有效态的验证摘要结构固定为 outcome、summary、checks、input source、recorded_at，而不是直接塞入大段原始文本。
- 在 `src/skills/verification-recorder/index.ts` 中实现 `recordVerificationResult()`，把外部补录的 checks 折叠为稳定 `verification_summary`，同时保留 `source_refs`、`recorded_at` 与 `input_source`，满足任务 11 对验证结果标准化和摘要化的要求。
- 在 `src/skills/gitlab-linker/index.ts` 中实现 `normalizeGitLabArtifacts()`，对 commit / branch / MR 三类 GitLab 产物做统一裁剪、默认值补齐和 schema 校验，确保后续 Jira / 飞书链路只消费标准化产物。
- 在 `src/workflow/execution.ts` 中实现 `getExecutionExternalInputState()` 与 `recordExecutionExternalInputs()`：固定 `Execution` 在缺少 GitLab 产物、缺少验证结果、两者都缺失时的 `waiting_external_input` 语义；支持首次补录、重复补录去重、验证结果 ref 更新，以及冲突 GitLab 产物的拒绝与当前有效态保护。
- 更新 `src/skills/index.ts`、`src/workflow/index.ts`、`tests/unit/domain/contracts.spec.ts`，并新增 `tests/unit/verification-recorder/verification-recorder.spec.ts`、`tests/unit/gitlab-linker/gitlab-linker.spec.ts`、`tests/unit/execution/execution.spec.ts`，用红绿测试把任务 11 的最小闭环锁定下来。

### 依据

- 用户指令：请阅读所有 `memory-bank` 文档，并继续执行实施计划的任务 11；每在验证测试结果之前，请勿开始下一个任务；测试验证通过后记录到 `progress.md`，补充 `architecture.md`，并且在此之前不要进行任务 12；在 worktree 代码测试通过后合并到 `main`。
- `memory-bank/实施计划.md` 任务 11：要求实现 `Execution` 阶段的等待外部输入语义、v1 不自动改代码的边界、验证结果标准化、GitLab 产物标准化，以及补录后的继续执行 / 重复补录合并 / 非法输入拒绝规则。
- `memory-bank/需求文档.md`：
  - “Execution”：v1 只推进修复动作编排，不承诺自动改代码。
  - “状态机要求”：等待 GitLab 产物、验证结果或其他外部输入时必须进入 `waiting_external_input`。
  - “GitLab 产物契约要求”：commit / branch / MR 三类产物具备条件必填字段，且 `artifact_source` 必须区分系统生成与外部导入。
  - “ExecutionContext 最小字段集” 与 “Bugfix Report 最小字段集”：运行态和报告必须能承接 `verification_results` 与 GitLab 产物。
- `memory-bank/技术方案.md`：
  - “9.1 主流程说明” 中的 `Execution`：只负责挂起等待外部修复动作、接收补录验证结果、接收 GitLab 产物、标准化外部输入。
  - “10.2 各 Skill 职责”：`verification-recorder` 负责校验并标准化验证结果，`gitlab-linker` 负责校验并标准化 GitLab 产物引用。
  - “8.6 / 8.8 状态流转与检查点策略”：补录阶段进入 `waiting_external_input`，恢复时继续等待，不重放副作用。

### 验证记录

1. 验证对象：任务 11 红灯起点
   触发方式：先运行 `npm run test:unit -- tests/unit/verification-recorder/verification-recorder.spec.ts`、`npm run test:unit -- tests/unit/gitlab-linker/gitlab-linker.spec.ts`、`npm run test:unit -- tests/unit/execution/execution.spec.ts tests/unit/domain/contracts.spec.ts`
   预期结果：实现前因缺少任务 11 的 domain 契约、skill 和 workflow 入口而失败，而不是误绿
   实际结果：通过；首轮失败准确暴露 `VerificationResultSchema` / `VerificationRecordingStageResultSchema` 缺失，以及 `src/skills/verification-recorder/index.ts`、`src/skills/gitlab-linker/index.ts`、`src/workflow/execution.ts` 尚未实现

2. 验证对象：任务 11 unit 红绿闭环
   触发方式：补实现后再次运行 `npm run test:unit -- tests/unit/verification-recorder/verification-recorder.spec.ts`、`npm run test:unit -- tests/unit/gitlab-linker/gitlab-linker.spec.ts`、`npm run test:unit -- tests/unit/execution/execution.spec.ts tests/unit/domain/contracts.spec.ts`
   预期结果：验证结果摘要、GitLab 产物标准化、Execution 等待语义、重复补录去重和冲突拒绝全部通过
   实际结果：通过；新增 8 项断言全部通过，并确认 commit / branch / MR 三类产物标准化、`waiting_external_input` 三类缺口判断、验证 ref 更新与冲突补录保护均已稳定

3. 验证对象：根级测试聚合入口
   触发方式：运行 `npm test`
   预期结果：任务 11 新增 unit 测试通过，任务 1-10 的既有 unit / integration / acceptance 回归继续通过
   实际结果：通过；unit 共 51/51 通过，integration `config-commands` 2/2 通过，acceptance `task1-project-skeleton` 4/4 通过

4. 验证对象：TypeScript 类型检查
   触发方式：运行 `npm run typecheck`
   预期结果：新增 verification / gitlab / execution 模块与导出入口可通过类型检查
   实际结果：通过；命令退出码为 0。期间曾暴露 `GitLabArtifact` 未从 domain 导出的问题，补充 type export 后重新验证通过

5. 验证对象：构建入口
   触发方式：运行 `npm run build`
   预期结果：新增 `src/skills/verification-recorder`、`src/skills/gitlab-linker`、`src/workflow/execution.ts` 与相关 domain 更新可正常编译到 `dist/`
   实际结果：通过；命令退出码为 0

### 当前边界说明

- 尚未开始任务 12；当前只实现 `Execution` 阶段的等待外部输入、补录标准化与当前有效态保护，不生成 Jira preview、不执行 Jira 写回，也不进入 Feishu 写入链路。
- 当前验证结果仍通过 `verification_results_ref` 挂到 `ExecutionContext` 当前有效态，原始外部正文和长输出继续遵循 artifact ref / redaction 边界，不直接内嵌到 `context.json`。
- 当前 GitLab 产物标准化只覆盖任务 11 需要的 commit / branch / MR 引用校验与默认字段补齐，不提前实现 task 12 所需的 Jira draft 生成或更完整的 connector 预览职责。

## 2026-03-19 - 任务 12：实现 Jira preview 与写回执行链路

### 本轮完成内容

- 在 `src/domain/schemas.ts` 中补齐任务 12 所需的 Jira 写回契约：为 `JiraWritebackDraft` 新增 `target_ref`、`request_payload_hash`、`dedupe_scope`、`expected_target_version`，为 `JiraWritebackResult` 新增 `already_applied`、`external_request_id`，并补出 `RequirementReference`、`JiraWritebackDraft`、`JiraWritebackResult` type export。
- 在 `src/infrastructure/connectors/jira/index.ts` 中新增 Jira 写回 connector 的最小纯映射能力：`buildJiraWritebackPreviewDraft()` 负责把 canonical 输入转成稳定 preview draft，自动注入 comment marker、生成脱敏 `request_payload`、`request_payload_hash`、`idempotency_key` 与 `dedupe_scope`；`createJiraExecuteResult()` / `createJiraAlreadyAppliedResult()` 负责把 execute 结果和查重命中结果标准化为统一 `JiraWritebackResult`。
- 在 `src/workflow/jira-writeback.ts` 中实现任务 12 的 workflow 纯规则层：`createJiraWritebackPreviewState()` 负责刷新 preview、回写 `jira_writeback_draft_ref`、计算 `previewHash`、使旧审批失效；`guardJiraWritebackRequirementBinding()` 负责在真实写回前执行 requirement binding 强约束阻塞；`buildJiraWritebackPreparedEntry()`、`markJiraWritebackEntryDispatched()`、`finalizeJiraWritebackEntry()` 固定 `prepared -> dispatched -> terminal` 的 Jira 副作用账本顺序；`shouldSkipJiraWritebackExecution()` 负责 dry-run 与已终态/已对账写入的去重跳过判定。
- 更新 `src/workflow/index.ts` 暴露 Jira writeback 规则层能力，保持 workflow 公共面稳定，不让调用方深引内部文件。
- 新增 `tests/unit/jira-writeback/jira-writeback.spec.ts`，并扩展 `tests/unit/domain/contracts.spec.ts`，通过红绿测试锁定 preview draft、强约束阻塞、preview 刷新与旧审批失效、approval preview 绑定、ledger 顺序、dry-run 边界和已写入不重复 execute 的最小闭环。

### 依据

- 用户指令：实施既定“任务 12：Jira Preview 与写回执行链路”计划；先在新的 `task12` worktree 中补测试，再实现；验证通过前不更新文档，不进入任务 13；验证通过后更新 `progress.md`、`architecture.md`，最后合并回 `main`。
- `memory-bank/实施计划.md` 任务 12：要求建立 Jira preview、审批绑定、requirement binding 强约束阻塞、副作用账本顺序、幂等 marker、恢复前 reconcile 的完整链路。
- `memory-bank/需求文档.md`：
  - “dry-run 与真实写入验收”：外部写回必须先预览，再审批，再执行；dry-run 不产生真实外部副作用。
  - “未绑定需求处理策略”：允许分析阶段继续，但 requirement binding 强约束项目在外部写回前必须阻塞。
  - “状态机要求”“检查点与恢复要求”：遇到 `outcome_unknown` 或未终态副作用恢复时，必须先对账，不能盲重试。
- `memory-bank/技术方案.md`：
  - “11.2 Jira Connector”：preview / execute 契约、comment marker、幂等去重、`outcome_unknown` 恢复先按 marker 对账。
  - “12.4 审计与副作用账本”：Jira/飞书真实写入的 ledger 顺序固定为 `prepared -> dispatched -> terminal`，且真实请求前必须先落 `prepared`。
  - “13.3 命令语义约束”：审批必须绑定不可变 `preview_ref`，旧 preview 不能越过新 preview 继续执行。

### 验证记录

1. 验证对象：任务 12 红灯起点
   触发方式：先运行 `npm run test:unit -- tests/unit/jira-writeback/jira-writeback.spec.ts tests/unit/domain/contracts.spec.ts`
   预期结果：实现前因缺少 Jira 写回 connector / workflow 入口和新增 schema 字段而失败，而不是误绿
   实际结果：通过；首轮失败准确暴露 `buildJiraWritebackPreviewDraft`、`guardJiraWritebackRequirementBinding`、`buildJiraWritebackApprovalRecord`、`createJiraAlreadyAppliedResult` 等接口不存在，且 `JiraWritebackDraftSchema` 还未接收任务 12 所需字段

2. 验证对象：任务 12 unit 红绿闭环
   触发方式：补实现后再次运行 `npm run test:unit -- tests/unit/jira-writeback/jira-writeback.spec.ts tests/unit/domain/contracts.spec.ts`
   预期结果：preview draft、强约束阻塞、preview 刷新与旧审批失效、approval preview 绑定、ledger 顺序、dry-run 跳过和已写入不重复 execute 全部通过
   实际结果：通过；新增 `jira-writeback` 6 项断言与更新后的 domain 契约断言全部通过。过程中暴露过一个测试层细节（对象 payload 断言方式）和一个公共 type export 缺口，修正后重新验证通过

3. 验证对象：根级测试聚合入口
   触发方式：运行 `npm test`
   预期结果：任务 12 新增 unit 测试通过，任务 1-11 的既有 unit / integration / acceptance 回归继续通过
   实际结果：通过；unit 共 57/57 通过，integration `config-commands` 2/2 通过，acceptance `task1-project-skeleton` 4/4 通过

4. 验证对象：TypeScript 类型检查
   触发方式：运行 `npm run typecheck`
   预期结果：新增 Jira writeback connector、workflow 规则层与 domain type export 可通过类型检查
   实际结果：通过；命令退出码为 0。期间曾暴露 `RequirementReference` 未从 domain 公共面导出的问题，补充 export 后重新验证通过

5. 验证对象：构建入口
   触发方式：运行 `npm run build`
   预期结果：新增 `src/workflow/jira-writeback.ts` 与 Jira connector 更新可正常编译到 `dist/`
   实际结果：通过；命令退出码为 0

### 当前边界说明

- 尚未开始任务 13；当前只实现 Jira preview / execute 链路的纯契约与纯规则层，不进入 Feishu preview / append 写入链路。
- 当前 Jira 写回仍停留在 connector 纯映射与 workflow 纯规则层：不发真实网络请求、不写 `side-effects.ndjson`、不接 checkpoint 持久化，也不注册 CLI `preview-write` / `execute-write` 命令。
- 当前 preview draft 中的 `request_payload` 是为审批和 execute 输入对齐服务的脱敏 payload 形态；真正“默认不落原始 request_payload、只落 hash 与 preview”的 storage 策略仍由后续持久化接线任务承接。

## 2026-03-19 - 任务 13：实现飞书 preview 与写入执行链路

### 本轮完成内容

- 在 `src/domain/schemas.ts` 中补齐任务 13 所需的 Feishu 写入契约：为 `FeishuRecordDraftSchema` 新增 `target_ref`、`request_payload_hash`、`dedupe_scope`、`expected_target_version`，为 `FeishuRecordResultSchema` 新增 `already_applied`、`external_request_id`、`updated_at`，并补出 `FeishuRecordDraft`、`FeishuRecordResult` type export，使飞书 preview / execute 与 Jira 一样具备审批绑定、幂等和恢复所需字段面。
- 在 `src/infrastructure/connectors/feishu/index.ts` 中新增 Feishu connector 的最小纯映射能力：`buildFeishuRecordPreviewDraft()` 负责把项目画像中的飞书目标、Jira issue 摘要、需求绑定结果、GitLab 产物、验证结果 ref、根因摘要和修复计划收敛为稳定 preview draft，自动注入 append marker、生成 `rendered_preview`、`request_payload_hash`、`idempotency_key`、`dedupe_scope` 和显式 `target_ref`；`createFeishuExecuteResult()` / `createFeishuAlreadyAppliedResult()` 负责把真实写入结果和查重命中结果标准化为统一 `FeishuRecordResult`。
- 在 `src/workflow/feishu-writeback.ts` 中实现任务 13 的 workflow 纯规则层：`createFeishuRecordPreviewState()` 负责刷新 preview、回写 `feishu_record_draft_ref`、计算 `previewHash` 并使旧审批失效；`guardFeishuRecordRequirementBinding()` 负责在真实飞书写入前执行 requirement binding 强约束阻塞，同时允许弱约束项目继续写入并在 preview 中显式标记“未绑定需求”；`buildFeishuRecordPreparedEntry()`、`markFeishuRecordEntryDispatched()`、`finalizeFeishuRecordEntry()` 固定 `prepared -> dispatched -> terminal` 的飞书副作用账本顺序；`shouldSkipFeishuRecordExecution()` 负责 dry-run 与 append 已写入场景的去重跳过判定。
- 更新 `src/infrastructure/connectors/index.ts` 与 `src/workflow/index.ts` 暴露 Feishu writeback 能力，保持 infrastructure / workflow 公共面稳定，不让调用方深引内部文件。
- 新增 `tests/unit/feishu-writeback/feishu-writeback.spec.ts`，并扩展 `tests/unit/domain/contracts.spec.ts`，通过红绿测试锁定 Feishu preview 草稿、requirement binding 强约束阻塞、未绑定需求显式标记、preview 刷新与旧审批失效、approval preview 绑定、append ledger 顺序、dry-run 边界与已写入不重复 append 的最小闭环。

### 依据

- 用户指令：阅读所有 `memory-bank` 文档并继续执行实施计划任务 13；每在验证测试结果之前不得开始下一个任务；测试验证通过后更新 `progress.md` 和 `architecture.md`；在此之前不进入任务 14；在 worktree 代码测试通过后合并到 `main`。
- `memory-bank/实施计划.md` 任务 13：要求建立 Feishu preview、requirement binding 强约束阻塞、append marker 与 preview 绑定、失败现场保留语义、append 去重与恢复优先 reconcile 的完整链路。
- `memory-bank/需求文档.md`：
  - “飞书集成需求” 与 “飞书写入契约要求”：飞书记录至少承载 requirement / Jira / GitLab / 根因 / 解决方案 / 验证结果，并支持 preview、独立补写、`space_id` / `doc_id` / `block_id_or_anchor` / `template_version` / `request_payload` / `idempotency_key` / `result_url` 等最小契约字段。
  - “未绑定需求处理策略”：弱约束项目允许继续写入，但飞书记录必须显式标记“未绑定需求”；强约束项目在外部写回前必须阻塞。
  - “错误处理需求” 与“部分成功语义”：Jira 成功、飞书失败时需要保留现场并支持只重试失败阶段。
- `memory-bank/技术方案.md`：
  - “11.4 飞书 Connector”：preview / execute input、append marker、`dedupe_scope`、`expected_target_version`、`already_applied` / `external_request_id` 等结果字段。
  - “12.4 审计与副作用账本”：Jira/飞书真实写入都必须遵守 `prepared -> dispatched -> terminal` 的固定顺序。
  - “13.3 命令语义约束” 与恢复设计：preview 审批必须绑定不可变 `preview_ref`，`outcome_unknown` 或未终态副作用恢复时必须先 reconcile 再决定是否重试。

### 验证记录

1. 验证对象：任务 13 红灯起点
   触发方式：先运行 `npm run test:unit -- tests/unit/feishu-writeback/feishu-writeback.spec.ts tests/unit/domain/contracts.spec.ts`
   预期结果：实现前因缺少 Feishu connector / workflow 入口和新增 schema 字段而失败，而不是误绿
   实际结果：通过；首轮失败准确暴露 `src/infrastructure/connectors/feishu/index.ts` 不存在，以及 `FeishuRecordDraftSchema` 尚未接收 `target_ref` / `request_payload_hash` / `dedupe_scope` / `expected_target_version` 等任务 13 所需字段

2. 验证对象：任务 13 unit 红绿闭环
   触发方式：补实现后再次运行 `npm run test:unit -- tests/unit/feishu-writeback/feishu-writeback.spec.ts tests/unit/domain/contracts.spec.ts`
   预期结果：preview draft、requirement binding 阻塞与弱约束标记、preview 刷新与旧审批失效、approval preview 绑定、append ledger 顺序、dry-run 跳过和已写入不重复 append 全部通过
   实际结果：通过；`tests/unit/feishu-writeback/feishu-writeback.spec.ts` 6 项断言全部通过，更新后的 domain 契约回归通过。期间曾暴露一个测试口径问题：第一次 preview 刷新才会 supersede 旧审批，第二次刷新若未重新挂接审批则不会重复产出 superseded id，已对齐现有 Jira 不变式后重新验证通过

3. 验证对象：根级测试聚合入口
   触发方式：运行 `npm test`
   预期结果：任务 13 新增 unit 测试通过，任务 1-12 的既有 unit / integration / acceptance 回归继续通过
   实际结果：通过；unit 共 63/63 通过，integration `config-commands` 2/2 通过，acceptance `task1-project-skeleton` 4/4 通过

4. 验证对象：TypeScript 类型检查
   触发方式：运行 `npm run typecheck`
   预期结果：新增 Feishu connector、workflow 规则层和 domain type export 可通过类型检查
   实际结果：通过；命令退出码为 0

5. 验证对象：构建入口
   触发方式：运行 `npm run build`
   预期结果：新增 `src/infrastructure/connectors/feishu/index.ts`、`src/workflow/feishu-writeback.ts` 与相关 domain 更新可正常编译到 `dist/`
   实际结果：通过；命令退出码为 0

### 当前边界说明

- 尚未开始任务 14；当前只实现 Feishu preview / append execute 链路的纯契约与纯规则层，不进入 `report-writer` 与统一导出。
- 当前 Feishu 写入仍停留在 connector 纯映射与 workflow 纯规则层：不发真实网络请求、不写 `side-effects.ndjson`、不接 checkpoint 持久化，也不注册 CLI 的 preview / execute 子命令。
- 当前 preview draft 中保留的是审批和 execute 输入对齐所需的脱敏 payload；真正“默认不落原始 request_payload、只落 hash 与 preview”的 storage 策略，以及失败现场与 checkpoint 的物理绑定，仍由后续持久化接线任务承接。

## 2026-03-19 - 任务 14：实现 `report-writer` 与统一导出

### 本轮完成内容

- 新增 `src/skills/report-writer/index.ts`，实现任务 14 的统一报告组装能力 `createBugfixReport()`：从最终 `ExecutionContext`、审批历史和外部结果摘要生成标准 `BugfixReport`，统一收敛 `requirement_refs`、`code_locations`、`artifacts`、`approval_history`、`open_risks`、`failure_summary` 等最终输出字段，不再要求调用方自己去拼中间工件。
- 新增 `src/renderers/report.ts`，提供 `renderBugfixReportCli()`、`renderBugfixReportMarkdown()`、`renderBugfixReportJson()` 三种导出方式，三者统一消费同一份 `BugfixReport` 事实源，满足 CLI 查看、结构化 JSON 导出和 Markdown 沉淀三类输出要求。
- 更新 `src/skills/index.ts` 与 `src/renderers/index.ts`，把 `report-writer` 与报告渲染能力纳入公共导出面，避免后续 app / CLI /测试深引内部路径。
- 新增 `tests/unit/report/report-writer.spec.ts`，通过红绿测试锁定三类能力：成功 run 的最终报告组装、`partial_success` / `failed` 的差异化 failure summary，以及 CLI / Markdown / JSON 三种输出对同一报告字段的映射一致性。

### 依据

- 用户指令：阅读所有 `memory-bank` 文档并继续执行实施计划任务 14；每在验证测试结果之前不得开始下一个任务；测试验证通过后更新 `progress.md`，补充 `architecture.md` 中的架构洞察与文件职责说明；在此之前不进入任务 15；在 worktree 代码测试通过后合并到 `main`。
- `memory-bank/实施计划.md` 任务 14：要求实现统一 `Bugfix Report`，覆盖最小字段集、success / partial_success / failed / cancelled 等结果表达、多种导出方式映射，以及审批历史、外部结果、开放风险和 failure summary 的归档规则。
- `memory-bank/需求文档.md`：
  - “输出与报告需求”：`Bugfix Report` 必须成为整个流程的统一输出，至少包含报告标识、bug 基本信息、关联需求、代码定位、修复方案摘要、验证结果、GitLab 链接、Jira 回写摘要、飞书记录摘要、审批历史、开放风险和最终状态。
  - “安全与凭证需求”：`Bugfix Report` 必须支持 redaction，因此报告层应继续只汇总 ref、摘要和结构化事实，而不反向塞回高敏感原始正文。
- `memory-bank/技术方案.md`：
  - “7.4 BugfixReport”：报告字段必须与既有 domain 契约一致。
  - “10 Skill 设计 / report-writer”：`report-writer` 的 owner 是“基于最终上下文输出 `Bugfix Report`”。
  - “11.1.1 owner 约束”：Renderers 只负责把 preview 或结果对象格式化成 CLI / Markdown / JSON，因此多渠道导出应共享同一报告事实来源，而不是各写各的拼装逻辑。

### 验证记录

1. 验证对象：任务 14 红灯起点
   触发方式：先运行 `npm run test:unit -- tests/unit/report/report-writer.spec.ts`
   预期结果：实现前因缺少 `createBugfixReport()` 与报告渲染导出而失败，而不是误绿
   实际结果：通过；首轮失败准确暴露 `createBugfixReport` 不存在，说明任务 14 的测试确实先锁定了新增能力缺口

2. 验证对象：任务 14 unit 红绿闭环
   触发方式：补实现后再次运行 `npm run test:unit -- tests/unit/report/report-writer.spec.ts`
   预期结果：成功 run 报告、`partial_success` / `failed` 差异化 summary，以及 CLI / Markdown / JSON 导出一致性全部通过
   实际结果：通过；`tests/unit/report/report-writer.spec.ts` 3 项断言全部通过

3. 验证对象：根级测试聚合入口
   触发方式：运行 `npm test`
   预期结果：任务 14 新增 unit 测试通过，任务 1-13 的既有 unit / integration / acceptance 回归继续通过
   实际结果：通过；unit 共 66/66 通过，integration `config-commands` 2/2 通过，acceptance `task1-project-skeleton` 4/4 通过

4. 验证对象：TypeScript 类型检查
   触发方式：运行 `npm run typecheck`
   预期结果：新增 `report-writer`、报告 renderers 与测试夹具均可通过类型检查
   实际结果：通过；首次验证暴露新测试夹具把 `GitLabArtifact` 可选字段误写成 `null`，按既有 domain 契约修正为可选缺省后重新验证通过，命令退出码为 0

5. 验证对象：构建入口
   触发方式：运行 `npm run build`
   预期结果：新增 `src/skills/report-writer/index.ts` 与 `src/renderers/report.ts` 可正常编译到 `dist/`
   实际结果：通过；命令退出码为 0

### 当前边界说明

- 尚未开始任务 15；当前只补齐统一 `Bugfix Report` 组装与导出能力，不进入 CLI 命令树扩展、`run` / `record` 子工作流注册或真实命令接线。
- 当前 `report-writer` 继续建立在“最终上下文 + 摘要 + ref”的事实源之上：不会回退到直接嵌入 Jira/Feishu 原始 payload、完整 checkpoint 历史或错误长正文，保持与需求文档、技术方案一致的 redaction / storage 边界。
- 当前导出层只提供纯 renderer，不承担状态查询、文件落盘或命令交互；真正把报告挂接到 CLI 命令面仍属于任务 15 的范围。

## 2026-03-19 - 任务 15：实现 CLI 命令面与子工作流

### 本轮完成内容

- 新增 `src/cli/run/register.ts` 与 `src/cli/record/register.ts`，把实施计划要求的四组命令树补齐到 CLI：在既有 `bind`、`inspect` 基础上，新增 `run` 和 `record` 两组命令，并注册 `run start`、`run brief`、`run resume`、`run status`、`run approve`、`run revise`、`run reject`、`run provide-artifact`、`run provide-verification`、`run preview-write`、`run execute-write` 以及 `record jira`、`record feishu` 的稳定入口。
- 新增 `src/app/cli-orchestration.ts`，在 app 层集中承接任务 15 需要的 CLI 编排接缝：把主流程启动、`brief_only` / `jira_writeback_only` / `feishu_record_only` 三类子工作流 run 初始化、共享状态查看、恢复入口、审批/回退动作、Execution 补录入口以及 write preview / execute 的最小持久化语义统一收敛到 app 层，而不是让 CLI 直接拼业务状态。
- 新增 `src/cli/shared.ts`，统一 `TTY/JSON` 输出与 `--output <path>` 落点；所有新命令都共享同一份输出路径，避免 `run` 与 `record` 各自定义不同的 JSON 结构或文件写法。
- 更新 `src/cli/program.ts` 与 `src/app/index.ts`，把新命令注册层和 app 公共导出接入现有 CLI 启动链路，保持 `bootstrapCli()` 仍是唯一 CLI 装配入口。
- 新增 `tests/integration/cli/run-record-commands.spec.ts`，先用红绿测试锁定任务 15 的最小 CLI 契约：命令树完整性、`run brief` 与 `record jira` 的唯一入口归属、子工作流 run mode 与 stage/status 初始化，以及 `run status` / `run resume` 对共享恢复语义的输出稳定性。

### 依据

- 用户指令：阅读所有 `memory-bank` 文档并继续执行实施计划任务 15；在验证通过之前不得开始任务 16；验证通过后更新 `progress.md`，再补充 `architecture.md` 解释文件职责；worktree 代码测试通过后合并到 `main`。
- `memory-bank/实施计划.md` 任务 15：要求通过统一 CLI 提供主流程、审批、补录、dry-run、子工作流和状态查看入口，并固定 `bind`、`inspect`、`run`、`record` 四组命令的职责边界。
- `memory-bank/需求文档.md`：
  - “CLI 需求”：CLI 至少分为 `bind`、`inspect`、`run`、`record` 四类，且必须支持 JSON 输出、dry-run、明确错误码、阶段结果序列化保存与恢复执行。
  - “子工作流要求”：必须支持“仅生成 Requirement Brief”“仅回写 Jira”“仅写入飞书记录”，并且子工作流不得绕过必要审批，必须复用与主流程一致的状态机和错误语义。
- `memory-bank/技术方案.md`：
  - “9.2 子工作流”：不适用阶段要标记为 `skipped`，子工作流具备独立最小输入校验，并复用统一状态机。
  - “13. CLI 设计”：固定 `run` / `record` 命令分组、命令列表、`--json` / `--dry-run` / `--non-interactive` / `--output` / `--checkpoint` 全局参数语义，以及 `record` 只是创建最小 run 的快捷入口，不是绕过 workflow 的后门。

### 验证记录

1. 验证对象：任务 15 CLI 红灯起点
   触发方式：先运行 `npm run test:integration -- tests/integration/cli/run-record-commands.spec.ts`
   预期结果：实现前因缺少 `run` / `record` 命令注册与最小 run 接线而失败，而不是误绿
   实际结果：通过；首轮失败准确暴露顶层帮助里缺少 `run`、`record` 命令组，且 `run brief` / `record jira` 调用会落到 unknown command，证明新增测试确实先锁定了任务 15 的缺口

2. 验证对象：任务 15 CLI 集成红绿闭环
   触发方式：补实现后再次运行 `npm run test:integration -- tests/integration/cli/run-record-commands.spec.ts`
   预期结果：命令树、子工作流入口归属、run mode 初始化、状态查看与恢复输出全部通过
   实际结果：通过；`tests/integration/cli/run-record-commands.spec.ts` 3 项断言全部通过

3. 验证对象：根级测试聚合入口
   触发方式：运行 `npm test`
   预期结果：任务 15 新增 integration 测试通过，任务 1-14 的既有 unit / integration / acceptance 回归继续通过
   实际结果：通过；unit 共 66/66 通过，integration 共 5/5 通过（含新增 `run-record-commands` 3 项断言），acceptance `task1-project-skeleton` 4/4 通过

4. 验证对象：TypeScript 类型检查
   触发方式：运行 `npm run typecheck`
   预期结果：新增 app/cli 模块与命令注册入口可通过类型检查
   实际结果：通过；首次验证暴露 `revise` / `provide-artifact` / `provide-verification` 复用了带必填 `stage` 的输入类型，修正为可选后重新验证通过，命令退出码为 0

5. 验证对象：构建入口
   触发方式：运行 `npm run build`
   预期结果：新增 `src/app/cli-orchestration.ts`、`src/cli/run/register.ts`、`src/cli/record/register.ts`、`src/cli/shared.ts` 可正常编译到 `dist/`
   实际结果：通过；命令退出码为 0

### 当前边界说明

- 尚未开始任务 16；当前只补齐 CLI 命令树、子工作流 run 初始化和最小共享状态/恢复接线，不扩展到需求验收矩阵、三层回归结构或最终文档一致性巡检。
- 当前 `run approve/reject/revise/provide-artifact/provide-verification/preview-write/execute-write` 已具备最小持久化入口与稳定输出，但仍属于任务 15 的“CLI 命令面接线”层级：它们复用已有 workflow / storage 语义，不代表已经完成任务 16 的端到端恢复场景覆盖。
- 当前 write preview / execute 在 CLI 侧只落最小 preview / result artifact 与 checkpoint 更新，用于固定命令边界和状态语义；真实外部 connector 调用、side-effect ledger 全链路持久化与需求验收级场景映射仍由后续端到端验证任务承接。

## 2026-03-19 - 任务 16：端到端恢复、回归与文档同步

### 本轮完成内容

- 新增 `tests/acceptance/task16-regression-coverage.spec.ts`、`tests/milestones/milestone-regressions.spec.ts`、`tests/milestones/document-consistency.spec.ts` 与 `tests/milestones/regression-plan.json`，把任务 16 要求的三层验证结构正式落地：任务级入口继续落在 `tests/unit` / `tests/integration`，任务组级入口固定为 `tests/acceptance`，里程碑级回归与文档一致性检查固定为 `tests/milestones`。
- 在 `tests/milestones/regression-plan.json` 中建立任务 1 到 16 的最小回归入口映射、需求文档 8 个验收场景到测试路径的追踪矩阵、以及实施计划要求的 5 个里程碑回归门槛；同时把任务 16 允许采用“跨模块测试链路追踪标准主流程而不伪造未实现全自动主命令”的已知假设显式记录下来。
- 新增 `tests/integration/cli/writeback-flows.spec.ts`，补齐此前缺失的 CLI 回归：覆盖 `record jira` 子工作流经由共享 run 生命周期完成 artifact / verification 补录、dry-run preview、审批、非交互 execute 的路径，以及 `record feishu` 子工作流在不依赖完整主流程时独立完成 preview / approve / execute 的路径。
- 更新 `tests/README.md` 与根级 `package.json`，把 `tests/milestones` 和 `test:milestones` 纳入正式测试约定与聚合入口，让里程碑回归不再只是文档说明，而是 `npm test` 的一部分。

### 依据

- 用户指令：阅读所有 `memory-bank` 文档并继续执行实施计划任务 16；每在验证测试结果之前不得开始下一个任务；测试验证通过后更新 `progress.md` 供其他开发人员参考，再补充 `architecture.md` 中的架构见解与文件职责说明；在 worktree 代码测试通过后合并到 `main`。
- `memory-bank/实施计划.md` 任务 16：要求建立任务级、任务组级、里程碑级三层验证结构，将 8 个验收场景映射到测试套件，定义 5 个里程碑回归，并同步检查需求文档、技术方案、实施计划与 AGENTS 的术语一致性与已知假设。
- `memory-bank/需求文档.md`：
  - “验收标准”：8 个验收场景必须全部可追踪到验证路径，尤其包括审批分支、配置缺失补录、dry-run/真实写入、中断恢复、部分成功与子工作流独立验收。
  - “成功指标”：恢复执行成功率与 dry-run 覆盖率都属于最终交付口径，因此任务 16 的回归入口需要把恢复和写回链路纳入正式测试体系。
- `memory-bank/技术方案.md`：
  - “CLI 设计” 与 “子工作流”：`record` 不得绕过统一 workflow，子工作流应共享审批、错误和结果记录语义，因此任务 16 需要把 `record jira` / `record feishu` 的 CLI integration 回归补齐。
  - “方案总结” 与 “Renderers/Workflow owner 约束”：阶段命名、命令组、分层职责与 v1 非目标必须保持一致，不能让进度文档或临时实现漂移出上位文档约束。

### 验证记录

1. 验证对象：任务 16 红灯起点
   触发方式：先运行 `npm run test:acceptance -- tests/acceptance/task16-regression-coverage.spec.ts`
   预期结果：在未补齐 `tests/milestones`、追踪矩阵与里程碑脚本前明确失败，而不是误绿
   实际结果：通过；首轮失败准确暴露 `tests/README.md` 尚未声明 `tests/milestones`，且缺少 `tests/milestones/regression-plan.json`，证明任务 16 的测试先锁定了真实缺口

2. 验证对象：任务 16 CLI 写回与子工作流 integration 回归
   触发方式：运行 `npm run test:integration -- tests/integration/cli/writeback-flows.spec.ts`
   预期结果：`record jira` 能共享 run 生命周期完成补录、dry-run preview、审批与 execute，`record feishu` 能独立完成 preview / approve / execute
   实际结果：通过；`tests/integration/cli/writeback-flows.spec.ts` 2 项断言全部通过，补齐了此前未覆盖的 `record feishu` 子工作流与 writeback 命令链路

3. 验证对象：任务 16 三层验证结构与里程碑文档一致性
   触发方式：运行 `npm run test:acceptance -- tests/acceptance/task16-regression-coverage.spec.ts` 与 `npm run test:milestones`
   预期结果：16 个任务组、8 个验收场景、5 个里程碑和 4 份文档一致性检查范围都能被解析并验证通过
   实际结果：通过；acceptance 7/7 通过，milestones 3/3 通过

4. 验证对象：全量测试聚合入口
   触发方式：运行 `npm test`
   预期结果：新增 `test:milestones` 被纳入根级测试入口，任务 1-16 的既有 unit / integration / acceptance 回归继续通过
   实际结果：通过；unit 共 66/66 通过，integration 共 7/7 通过，acceptance 共 7/7 通过，milestones 共 3/3 通过

5. 验证对象：TypeScript 类型检查
   触发方式：运行 `npm run typecheck`
   预期结果：新增 tests 夹具、CLI integration 回归与里程碑校验可通过类型检查
   实际结果：通过；命令退出码为 0

6. 验证对象：构建入口
   触发方式：运行 `npm run build`
   预期结果：新增任务 16 改动不破坏 TypeScript 构建输出
   实际结果：通过；命令退出码为 0

### 当前边界说明

- 任务 16 的“标准主流程”目前采用跨模块测试链路追踪：用 Intake / Requirement Brief / Code Localization / Fix Planning / Execution / Jira / Feishu / Report 的现有测试共同证明闭环能力，而不是伪造一个仓库中尚未落地的“全自动单命令主流程”。这一点已作为已知假设写入 `tests/milestones/regression-plan.json`。
- 当前新增的 CLI integration 仍只验证本地持久化、checkpoint 与共享状态语义，不触发真实 Jira / Feishu 网络副作用，也不把 task 12/13 的纯规则层越权扩展成外部写入实现。
- `progress.md` 与 `architecture.md` 继续作为实施跟踪与架构说明补充材料，不反向覆盖需求文档、技术方案与实施计划的上位约束。
