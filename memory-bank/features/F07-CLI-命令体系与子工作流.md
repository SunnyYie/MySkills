# F07 CLI 命令体系与子工作流

## 1. 目标与用户价值

本 feature 负责通过统一 CLI 暴露配置维护、流程运行、审批、补录、预览、真实写入和子工作流入口。

用户价值如下：

- 用户可以只通过 CLI 完成 v1 最小闭环，不依赖对话式入口。
- 命令树清晰，能够从命令名直接判断行为范围。
- 子工作流可复用同一状态机，而不是形成旁路。

## 2. 来源依据

### 2.1 已确认事实

- CLI 是 v1 唯一必选入口。
- CLI 只负责编排命令与展示，不拥有业务状态。
- `record` 是快捷入口，不是绕过 workflow 的后门。

### 2.2 上游约束

- 技术方案把命令解析、参数校验、交互确认、TTY/JSON 输出与错误码返回归入 CLI 层。
- 实施计划任务七冻结了 `bind`、`inspect`、`run`、`record` 命令组、输出契约和标准演示路径。
- `status --json` 最小字段集合已经在上游文档中冻结。

### 2.3 本 Feature 实现决策

- CLI 只调用 app / workflow，不保留平行业务状态。
- 命令组维持四组结构，不按平台再拆分平行入口。
- TTY 和 JSON 使用同一份业务事实，只改变展示方式。

## 3. 范围

### 3.1 本 Feature 要做什么

- 定义 `bind`、`inspect`、`run`、`record` 命令树。
- 定义参数、前置条件、交互确认与错误输出。
- 定义 `status --json` 最小字段。
- 定义三个子工作流的最小输入与补录方式。
- 固化标准演示路径。

### 3.2 本 Feature 明确不做什么

- 不重新定义 workflow 状态机。
- 不直接操作 connector 平台细节。
- 不自行推断 preview 或审批状态。
- 不直接生成最终验收矩阵。

## 4. 前置依赖与输出产物

前置依赖：

- F01 配置语义
- F02 durable state
- F05 workflow 状态机
- F06 preview / execute 行为

输出产物：

- CLI 命令树
- 参数与错误契约
- 子工作流入口说明
- `status --json` 输出契约
- 标准演示路径

## 5. 涉及的核心对象、状态与能力边界

核心对象：

- `ProjectProfile`
- `ExecutionContext`
- `StructuredError`

关键字段：

- `run_status`
- `run_lifecycle_status`
- `run_outcome_status`
- `current_stage`
- `allowed_actions`
- `required_inputs`
- `active_preview_ref`

能力边界：

- CLI 只做用户意图到 workflow 命令的映射。
- renderer 负责 TTY / JSON 表达，不决定内部状态。
- `record` 复用统一状态机，不生成平行 run 模型。

## 6. 实现设计

### 6.1 主要流程

命令树如下：

- `bind`
- `inspect`
- `run`
- `record`

标准演示路径如下：

`bind -> inspect -> run -> approve/revise -> dry-run writeback -> real writeback -> export report`

### 6.2 输入与输出

输入：

- 项目配置参数
- issue key
- run id
- stage
- preview 确认值
- artifact / verification 补录信息

输出：

- TTY 摘要
- JSON 结构化对象
- 统一错误对象

### 6.3 关键约束

- CLI 不改变 workflow 的状态真相。
- `record` 不得绕过 preview、审批、checkpoint 或 ledger。
- `status --json` 必须直接映射当前有效态，不由 renderer 自造字段语义。
- `--dry-run` 和 `--non-interactive` 必须遵守 F06 的模式规则。

### 6.4 异常与失败分支

- 参数缺失：返回 `invalid_input`。
- 命令与当前阶段不匹配：返回 `invalid_state`。
- 预览确认缺失：在非交互执行下返回 `confirmation_required`。
- 子工作流输入不全：提示缺失项并保持等待或阻止执行。

## 7. 开发任务拆解

1. 定义四组命令树与典型入口。
2. 定义 `bind` 与 `inspect` 的输入输出语义。
3. 定义 `run` 命令对应的 workflow 动作。
4. 定义 `record` 三类子工作流的最小输入与补录方式。
5. 定义 TTY / JSON / 错误输出契约。
6. 固化标准演示路径并保证文档与实现一致。

## 8. 测试与验收

单元/契约测试：

- 命令树结构
- `bind` / `inspect` 语义
- `run` 命令可达性
- `record` 子工作流边界
- `status --json` 字段完整性

集成测试：

- 可通过 CLI 完成标准演示路径
- `record jira` 与 `record feishu` 复用统一状态机
- `run resume --checkpoint` 能与 F05 恢复规则一致工作

文档一致性检查：

- 不引入自然语言对话式入口
- 不让 CLI 直接拥有状态或平台逻辑

验收标准：

- CLI 是唯一明确入口
- 用户可以通过命令和输出直接理解当前运行态与下一步动作

## 9. 与其他 Feature 的交接点

- 从 F01 获取配置维护语义。
- 从 F05 获取状态机与审批动作。
- 从 F06 获取 preview、execute 和补录行为。
- 向 F08 提供标准演示路径和 CLI 验收入口。
