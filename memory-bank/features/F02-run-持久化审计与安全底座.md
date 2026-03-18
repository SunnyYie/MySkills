# F02 run 持久化审计与安全底座

## 1. 目标与用户价值

本 feature 负责把 run 运行过程变成可恢复、可审计、可去重、可脱敏的 durable state。它是所有状态机、写回执行和恢复场景的底座。

用户价值如下：

- 中断后的 run 可以从 checkpoint 恢复，而不是重头开始。
- Jira / 飞书副作用具备账本追踪，避免重复写入。
- 敏感信息不会被明文落盘。
- 审计记录能支撑问题排查和最终验收。

## 2. 来源依据

### 2.1 已确认事实

- run 数据必须有固定目录结构。
- 所有关键状态迁移都必须落 checkpoint。
- 所有外部写入都必须经过 side-effect ledger。
- 敏感信息不得明文落盘。

### 2.2 上游约束

- 技术方案将 `ExecutionContext`、`CheckpointRecord`、`SideEffectLedgerEntry`、`StructuredError` 列为核心对象。
- 实施计划任务二冻结了存储布局、allowlist、ledger 生命周期、锁与 dedupe 基线。
- `Workflow/Agent Layer` 是唯一业务状态 owner，storage 只负责 durable 结果。

### 2.3 本 Feature 实现决策

- run 根目录作为单次执行的唯一持久化根。
- `context.json` 只保存有效态索引、摘要和引用，不保存原文正文。
- `prepared -> executing_side_effect checkpoint -> dispatched -> terminal status` 作为唯一写入顺序。

## 3. 范围

### 3.1 本 Feature 要做什么

- 定义项目配置与 run 的持久化布局。
- 定义 checkpoint 的触发点和快照边界。
- 定义 side-effect ledger 与幂等线索。
- 定义 redaction、allowlist、目录权限和文件权限要求。
- 定义 run 级锁、target 级锁或 dedupe index、reconcile 前置判断。

### 3.2 本 Feature 明确不做什么

- 不决定主流程阶段推进顺序。
- 不负责 Jira / Feishu 业务 payload 生成。
- 不负责 CLI 命令语义。
- 不负责只读 connector 的业务字段解释。

## 4. 前置依赖与输出产物

前置依赖：

- F01 提供 `ProjectProfile` 与脱敏/序列化策略配置。

输出产物：

- run 目录结构定义
- `context.json` / `events.ndjson` / `side-effects.ndjson` / `checkpoints/` / `artifacts/` 的职责定义
- checkpoint 策略
- ledger 状态机
- 锁、去重和 reconcile 基线

## 5. 涉及的核心对象、状态与能力边界

核心对象：

- `ExecutionContext`
- `CheckpointRecord`
- `SideEffectLedgerEntry`
- `StructuredError`

相关状态：

- `executing_side_effect`
- `outcome_unknown`
- `partial_success`

能力边界：

- storage 负责 durable state，不决定业务阶段推进。
- workflow 决定什么时候写 checkpoint，但不自行发明落盘格式。
- connector 不直接修改 ledger 规则。

## 6. 实现设计

### 6.1 主要流程

主要流程如下：

1. run 创建时初始化目录与锁。
2. workflow 在关键状态迁移时更新 `context.json` 与 checkpoint。
3. 外部写入前先写 `prepared` ledger，再落写前 checkpoint。
4. 请求发出后落 `dispatched`，再根据结果落终态。
5. 恢复时先检查未终态副作用，再决定是否进入 reconcile。

### 6.2 输入与输出

输入：

- `ProjectProfile` 中的序列化、脱敏与策略配置
- workflow 提供的当前有效引用与状态
- F06 提供的副作用目标与幂等线索

输出：

- durably stored run context
- checkpoints
- side-effect ledger records
- redacted artifacts
- 审计事件流

### 6.3 关键约束

- 敏感正文与凭证不得明文落盘。
- 同类信息只能有一个主落位。
- `outcome_unknown` 不能直接降级为 `failed` 自动重试。
- target 级去重不能只依赖当前 run。
- 恢复执行必须仅依赖持久化状态。

### 6.4 异常与失败分支

- 锁获取失败：返回锁冲突错误，阻止并发写入。
- checkpoint 缺失：阻止恢复并提示 durable state 不完整。
- `prepared` / `dispatched` 无终态：恢复流程必须先进入 reconcile。
- redaction 失败：视为安全错误，阻止落盘。

## 7. 开发任务拆解

1. 定义 run 目录与文件职责。
2. 定义 `ExecutionContext` 的 allowlist 落盘规则。
3. 定义 checkpoint 的最小快照内容与写入时机。
4. 定义 ledger 生命周期、终态和顺序不变式。
5. 定义 run 级锁与 target 级 dedupe 机制。
6. 定义 reconcile 前置判断与结果分类。
7. 定义 redaction 执行点与安全失败处理。

## 8. 测试与验收

单元/契约测试：

- run 目录结构存在性与职责一致性
- allowlist 与 redaction 规则
- checkpoint 触发点
- ledger 顺序约束
- 锁与 dedupe 基线

集成测试：

- 中断后可从 checkpoint 恢复
- 重复写入请求被 dedupe 或拦截
- `outcome_unknown` 场景下先 reconcile 再决定后续动作

文档一致性检查：

- 不把正文重新塞回 `ExecutionContext`
- 不把安全策略下沉到 CLI 或 connector

验收标准：

- durable state 能支撑恢复、审计和幂等去重
- 敏感信息落盘限制明确且可执行

## 9. 与其他 Feature 的交接点

- 为 F05 提供恢复与状态持久化基础。
- 为 F06 提供写入账本、去重和 reconcile 约束。
- 为 F08 提供审计证据和统计数据来源。
