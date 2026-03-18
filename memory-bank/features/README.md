# Features 实现文档索引

## 1. 项目背景与拆解原则

本目录用于把 [需求文档](/Users/sunyi/ai/MySkills/memory-bank/需求文档.md)、[技术方案](/Users/sunyi/ai/MySkills/memory-bank/技术方案.md) 与 [实施计划](/Users/sunyi/ai/MySkills/memory-bank/实施计划.md) 中已经冻结的约束，整理成可直接交给开发人员实施的 feature 级实现文档。

本目录不重新定义 v1 范围，也不替代 `architecture.md` 的架构冻结结论。它的作用是把“已经确认的边界”转成“可以按包推进的实现工作包”。

拆解原则如下：

- 按业务闭环而不是按实施计划编号拆分，便于后续落代码与端到端验收。
- 每个 feature 都要能回答“要做什么、依赖什么、产出什么、如何验证”。
- 基础设施型能力与端到端闭环型能力分开表达，避免职责混用。
- 所有文档都必须回溯到上游文档，不得私自扩展 v1 scope。
- 所有外部写入仍遵守 `preview -> approve -> execute`，所有运行态仍以 workflow 为唯一状态 owner。

## 2. Feature 总表

| ID | 文档 | 类型 | 目标摘要 | 前置依赖 |
| --- | --- | --- | --- | --- |
| F01 | [F01-项目画像与关系绑定](/Users/sunyi/ai/MySkills/memory-bank/features/F01-项目画像与关系绑定.md) | 基础设施型 | 建立 `ProjectProfile`、关系绑定和需求映射规则，形成运行时可信配置入口。 | 无 |
| F02 | [F02-run-持久化审计与安全底座](/Users/sunyi/ai/MySkills/memory-bank/features/F02-run-持久化审计与安全底座.md) | 基础设施型 | 建立 run 存储、checkpoint、ledger、redaction、锁与 dedupe 基线。 | F01 |
| F03 | [F03-只读接入与上下文解析](/Users/sunyi/ai/MySkills/memory-bank/features/F03-只读接入与上下文解析.md) | 基础设施型 | 打通 Jira、GitLab、飞书、本地仓库的只读接入与上下文解析。 | F01 |
| F04 | [F04-分析链路与结构化产物](/Users/sunyi/ai/MySkills/memory-bank/features/F04-分析链路与结构化产物.md) | 业务闭环型 | 产出 `Requirement Brief`、代码定位、修复计划、验证建议和报告草稿输入。 | F01、F03 |
| F05 | [F05-主工作流审批与恢复](/Users/sunyi/ai/MySkills/memory-bank/features/F05-主工作流审批与恢复.md) | 业务闭环型 | 落地八阶段主流程、审批门、回退、恢复、`partial_success` 等状态行为。 | F01、F02、F03、F04 |
| F06 | [F06-补录写回与幂等执行](/Users/sunyi/ai/MySkills/memory-bank/features/F06-补录写回与幂等执行.md) | 业务闭环型 | 实现补录、preview、审批绑定、真实写入、幂等去重和 reconcile。 | F02、F03、F04、F05 |
| F07 | [F07-CLI-命令体系与子工作流](/Users/sunyi/ai/MySkills/memory-bank/features/F07-CLI-命令体系与子工作流.md) | 业务闭环型 | 通过统一 CLI 暴露配置、运行、审批、补录、预览、执行与子工作流。 | F01、F02、F03、F04、F05、F06 |
| F08 | [F08-报告验收与交付收口](/Users/sunyi/ai/MySkills/memory-bank/features/F08-报告验收与交付收口.md) | 收口型 | 建立 `BugfixReport`、追踪矩阵、测试结构、成功指标和最终验收入口。 | F04、F05、F06、F07 |

## 3. 依赖关系与推荐实现顺序

推荐实现顺序如下：

1. F01 配置与绑定
2. F02 持久化与安全
3. F03 只读接入
4. F04 分析链路
5. F05 工作流与恢复
6. F06 写回与幂等执行
7. F07 CLI 与子工作流
8. F08 报告与验收

排序理由如下：

- F01 决定所有运行时配置入口，是其余 feature 的共同前提。
- F02 先冻结 durable state、checkpoint 和副作用账本，避免后续流程实现返工。
- F03 提供只读输入，F04 才能稳定产出结构化分析结果。
- F05 需要建立在 F02 的恢复底座与 F04 的产物契约上。
- F06 依赖 F05 的审批与状态机结论，并复用 F02/F03/F04 的存储、connector 与草稿能力。
- F07 只是命令入口，不应先于状态机和写回链路落地。
- F08 负责最终验收与交付收口，放在最后统一汇总。

## 4. 来源映射表

### 4.1 需求文档目标与场景 -> Feature

| 需求来源 | 对应 Feature |
| --- | --- |
| CLI 发起 bugfix 流程 | F07 |
| Jira bug intake 与需求关联 | F03、F04 |
| Requirement Brief 生成与确认 | F04、F05 |
| 代码定位建议与修复计划 | F04 |
| GitLab 产物补录与 Jira 回写 | F06、F07 |
| 飞书记录沉淀 | F06、F08 |
| 配置绑定与补录 | F01、F07 |
| 审批退回与重新生成 | F05 |
| 写回失败保留现场 | F02、F05、F06 |
| dry-run 预览 | F06、F07 |
| 中断恢复执行 | F02、F05 |

### 4.2 技术方案模块/分层 -> Feature

| 技术方案对象或分层 | 主要承接 Feature |
| --- | --- |
| CLI Layer | F07 |
| Workflow/Agent Layer | F05 |
| Skill Layer | F04 |
| Infrastructure Layer | F03、F06 |
| Renderers | F07、F08 |
| `ProjectProfile` | F01 |
| `ExecutionContext` / checkpoint / ledger | F02、F05 |
| connector registry / repo workspace | F03 |
| preview / execute / reconcile | F06 |
| `BugfixReport` 与验收矩阵 | F08 |

### 4.3 实施计划任务 -> Feature

| 实施计划任务 | 对应 Feature |
| --- | --- |
| 任务一：锁定领域边界与核心契约 | F01、F05 |
| 任务二：建立持久化、审计与安全底座 | F02 |
| 任务三：接入 Infrastructure 只读能力 | F03 |
| 任务四：落地 Skill 层契约 | F04 |
| 任务五：实现主工作流与状态机 | F05 |
| 任务六：闭环写入 preview、审批与真实执行 | F06 |
| 任务七：补齐 CLI 与子工作流 | F07 |
| 任务八：完成报告、验收与交付收口 | F08 |

## 5. 阅读导航

按阅读目的推荐如下：

- 想先理解配置与运行前提：从 F01 开始。
- 想先理解 durable state 与恢复模型：先读 F02，再读 F05。
- 想实现外部系统只读接入：先读 F03。
- 想实现分析产物与报告输入：先读 F04。
- 想实现状态机与审批/回退：先读 F05。
- 想实现 Jira/飞书写回：先读 F06。
- 想实现 CLI 入口：先读 F07。
- 想组织验收和交付：最后读 F08。

阅读顺序与实现顺序保持一致，除非后续上游文档更新了范围或依赖关系。
