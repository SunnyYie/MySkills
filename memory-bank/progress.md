# 2026-03-18

## 本轮目标

- 阅读 `memory-bank` 全部核心文档与 `AGENTS.md`，继续执行 [实施计划](/Users/sunyi/ai/MySkills/memory-bank/实施计划.md) 的任务一。
- 严格按步骤推进，在验证通过前不进入任务二。
- 在验证通过后记录工作结果，并补充 `architecture.md` 说明当前文件职责与架构冻结结论。

## 已完成工作

1. 通读并对齐了以下文档基线：
   - [需求文档](/Users/sunyi/ai/MySkills/memory-bank/需求文档.md)
   - [技术方案](/Users/sunyi/ai/MySkills/memory-bank/技术方案.md)
   - [实施计划](/Users/sunyi/ai/MySkills/memory-bank/实施计划.md)
   - [AGENTS.md](/Users/sunyi/ai/MySkills/AGENTS.md)
2. 新增 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md)，冻结了任务一要求的六类核心契约：
   - 1.1 v1 范围与非范围基线
   - 1.2 五层架构职责与禁止行为
   - 1.3 八个核心对象的 owner 与边界
   - 1.4 状态枚举、`run_lifecycle_status` / `run_outcome_status` / `run_status` 映射
   - 1.5 分析审批与写入审批的绑定对象分型规则
   - 1.6 条件必填与标准错误语义
3. 在同一份架构文档中补充了“当前仓库文件职责”索引，便于后续开发者快速理解各文档用途。
4. 新增 [tests/test_task1_architecture_contract.py](/Users/sunyi/ai/MySkills/tests/test_task1_architecture_contract.py)，把任务一步骤拆成 6 个文档契约测试，并额外覆盖 `architecture.md` 的文件职责索引。

## 验证记录

### 验证对象

- 任务一六个步骤的架构冻结结果
- `architecture.md` 的文件职责说明

### 触发方式

命令：

```bash
python3 -m unittest tests/test_task1_architecture_contract.py -v
```

### 预期结果

- 7 条测试全部通过
- 不存在缺失章节、缺失核心对象、缺失状态映射或审批绑定规则

### 实际结果

- 7/7 测试通过
- 已确认在进入任务二之前，任务一文档冻结结果具备最小可验证证据

## 对后续开发的提醒

- 当前仓库仍是文档先行状态，尚未开始 `src/` 代码骨架实现。
- 进入任务二前，应继续以 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 的冻结结论作为实现边界。
- `run_status` 已被明确为兼容字段，后续实现不得把它当作状态机真源。

---

# 2026-03-18 任务二续写

## 本轮目标

- 再次通读 `memory-bank` 全部核心文档，继续执行 [实施计划](/Users/sunyi/ai/MySkills/memory-bank/实施计划.md) 的任务二。
- 严格按步骤推进：每完成一个步骤就立即验证，在验证通过前不进入下一个步骤，也不进入任务三。
- 在验证通过后补充架构文档，并为其他开发人员记录可追溯的进度说明。

## 已完成工作

1. 重新核对了 [需求文档](/Users/sunyi/ai/MySkills/memory-bank/需求文档.md)、[技术方案](/Users/sunyi/ai/MySkills/memory-bank/技术方案.md)、[实施计划](/Users/sunyi/ai/MySkills/memory-bank/实施计划.md)、[architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 之间与持久化、审计、安全相关的上游约束。
2. 扩展了 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 的“任务二冻结结果”，新增以下五个章节：
   - 2.1 项目配置与 run 存储布局
   - 2.2 落盘 allowlist 与脱敏规则
   - 2.3 checkpoint 触发点
   - 2.4 side-effect ledger 生命周期
   - 2.5 锁、去重与对账基线
3. 在 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 的文件职责索引中补充了 [tests/test_task2_persistence_contract.py](/Users/sunyi/ai/MySkills/tests/test_task2_persistence_contract.py) 的用途说明。
4. 新增 [tests/test_task2_persistence_contract.py](/Users/sunyi/ai/MySkills/tests/test_task2_persistence_contract.py)，以最小文档契约测试覆盖任务二五个步骤及文件职责索引更新。

## 验证记录

### 分步验证

每个步骤都遵循了“先写失败测试，再补文档，再回测”的顺序，单步验证命令均使用：

```bash
python3 -m unittest tests.test_task2_persistence_contract.<具体测试名> -v
```

### 任务二整体验证

命令：

```bash
python3 -m unittest tests/test_task2_persistence_contract.py -v
```

预期结果：

- 任务二相关 6 条测试全部通过

实际结果：

- 6/6 测试通过

### 任务一 + 任务二总回归

命令：

```bash
python3 -m unittest tests/test_task1_architecture_contract.py tests/test_task2_persistence_contract.py -v
```

预期结果：

- 已冻结的任务一、任务二文档契约都继续成立

实际结果：

- 13/13 测试通过

## 对后续开发的提醒

- 当前仍停留在任务二，尚未开始任务三的 Infrastructure 只读能力冻结。
- 后续如果进入代码实现阶段，应继续保持 `context.json`、`checkpoints/`、`artifacts/`、`side-effects.ndjson` 的职责分离，不要把全文正文重新塞回 `ExecutionContext`。
- `outcome_unknown` 已在架构文档中被明确为“先 reconcile 再决定是否可重试”，后续实现不得降级成普通失败重试。

---

# 2026-03-18 任务三续写

## 本轮目标

- 继续执行 [实施计划](/Users/sunyi/ai/MySkills/memory-bank/实施计划.md) 的任务三，只推进 Infrastructure 只读能力冻结，不进入任务四。
- 严格按步骤推进：每完成一个步骤就立即验证，验证通过后才记录进度并进入下一步。
- 在 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 中补充与 Infrastructure 接口边界相关的架构见解，并持续维护文件职责索引。

## 已完成工作

1. 按隔离执行要求，在项目内创建了 `.worktrees/task3-infra-readonly` worktree，并确认任务一、任务二现有 13 条测试在隔离工作区内全部通过，作为任务三的基线。
2. 新增 [tests/test_task3_infrastructure_contract.py](/Users/sunyi/ai/MySkills/.worktrees/task3-infra-readonly/tests/test_task3_infrastructure_contract.py)，先以失败测试锁定任务三步骤 3.1 的目标。
3. 扩展 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md)：
   - 新增“## 5. 任务三冻结结果”
   - 新增“### 3.1 能力接口清单冻结”
   - 明确 `HealthCheckCapability`、`ReaderCapability`、`TargetResolverCapability`、`PreviewWriterCapability`、`SideEffectExecutorCapability`、`ArtifactResolverCapability`、`RepoWorkspaceCapability` 的唯一职责与禁止行为
   - 在文件职责索引中补充 [tests/test_task3_infrastructure_contract.py](/Users/sunyi/ai/MySkills/.worktrees/task3-infra-readonly/tests/test_task3_infrastructure_contract.py) 的用途说明
4. 继续扩展 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 的“### 3.2 Jira 只读契约冻结”，明确：
   - Jira bug 读取字段最小集
   - `requirement_link_rules` 下的需求线索读取标准化结果
   - `writeback_targets` 的目标解析输入
   - Jira 只读链路的标准错误出口
5. 继续扩展 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 的“### 3.3 GitLab 只读契约冻结”，明确：
   - commit、branch、MR 的统一 artifact 表示
   - `project_id`、`default_branch`、`web_url`、`artifact_url` 等项目信息与链接生成规则
   - 这些统一结构如何作为 Jira 回写与报告导出的共同输入
6. 继续扩展 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 的“### 3.4 Feishu 与本地仓库只读契约冻结”，明确：
   - Feishu 目标定位、模板读取、锚点解析和模板版本输入
   - `repo.local_path`、`module_rules`、`candidate_modules`、`code search` 命中摘要
   - 这些只读结果如何分别支撑 preview 生成与代码定位分析
7. 继续扩展 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 的“### 3.5 connector registry 与路由规则冻结”，明确：
   - 以 `ProjectProfile + capability` 作为唯一平台选择输入
   - `connector registry` / `resolveConnector` 的标准解析结果
   - “workflow 不直接依赖具体平台实现”的路由不变式

## 验证记录

### 步骤 3.1

验证对象：

- Infrastructure 能力接口清单
- 新增任务三契约测试文件的职责索引

触发方式：

```bash
python3 -m unittest tests.test_task3_infrastructure_contract.TaskThreeInfrastructureContractTest.test_step_3_1_capability_interface_catalog_is_frozen -v
```

预期结果：

- 测试先失败，证明现有文档尚未覆盖任务三步骤 3.1
- 补充文档后再次执行通过，证明接口边界已被冻结

实际结果：

- 红灯阶段失败原因为缺少“## 5. 任务三冻结结果”与“### 3.1 能力接口清单冻结”章节
- 绿灯阶段 1/1 测试通过

### 步骤 3.2

验证对象：

- Jira connector 的只读字段契约
- 需求线索读取与 `writeback_targets` 解析输入

触发方式：

```bash
python3 -m unittest tests.test_task3_infrastructure_contract.TaskThreeInfrastructureContractTest.test_step_3_2_jira_read_contract_is_frozen -v
```

预期结果：

- 测试先失败，证明 `architecture.md` 尚未显式冻结 Jira 只读契约
- 补充文档后再次执行通过，证明任务三步骤 3.2 已具备最小可验证证据

实际结果：

- 红灯阶段失败原因为缺少“### 3.2 Jira 只读契约冻结”章节
- 绿灯阶段 1/1 测试通过

### 步骤 3.3

验证对象：

- GitLab connector 的只读 artifact 标准化契约
- GitLab 项目信息与链接生成规则

触发方式：

```bash
python3 -m unittest tests.test_task3_infrastructure_contract.TaskThreeInfrastructureContractTest.test_step_3_3_gitlab_read_contract_is_frozen -v
```

预期结果：

- 测试先失败，证明 `architecture.md` 尚未冻结 GitLab 统一 artifact 结构
- 补充文档后再次执行通过，证明任务三步骤 3.3 已具备最小可验证证据

实际结果：

- 红灯阶段失败原因为缺少“### 3.3 GitLab 只读契约冻结”章节
- 绿灯阶段 1/1 测试通过

### 步骤 3.4

验证对象：

- Feishu 目标定位与模板读取契约
- 本地仓库工作区、模块候选与只读搜索契约

触发方式：

```bash
python3 -m unittest tests.test_task3_infrastructure_contract.TaskThreeInfrastructureContractTest.test_step_3_4_feishu_and_repo_read_contracts_are_frozen -v
```

预期结果：

- 测试先失败，证明 `architecture.md` 尚未冻结 Feishu 与 repo 只读输入
- 补充文档后再次执行通过，证明任务三步骤 3.4 已具备最小可验证证据

实际结果：

- 红灯阶段失败原因为缺少“### 3.4 Feishu 与本地仓库只读契约冻结”章节
- 绿灯阶段 1/1 测试通过

### 步骤 3.5

验证对象：

- connector registry 的路由输入与解析结果
- capability 驱动的 connector 选择不变式

触发方式：

```bash
python3 -m unittest tests.test_task3_infrastructure_contract.TaskThreeInfrastructureContractTest.test_step_3_5_connector_registry_routing_is_frozen -v
```

预期结果：

- 测试先失败，证明 `architecture.md` 尚未冻结 connector registry 路由规则
- 补充文档后再次执行通过，证明任务三步骤 3.5 已具备最小可验证证据

实际结果：

- 红灯阶段失败原因为缺少“### 3.5 connector registry 与路由规则冻结”章节
- 绿灯阶段 1/1 测试通过

### 任务三整体验证

触发方式：

```bash
python3 -m unittest tests/test_task3_infrastructure_contract.py -v
```

预期结果：

- 任务三相关 5 条测试全部通过

实际结果：

- 5/5 测试通过

### 任务一到任务三总回归

触发方式：

```bash
python3 -m unittest tests/test_task1_architecture_contract.py tests/test_task2_persistence_contract.py tests/test_task3_infrastructure_contract.py -v
```

预期结果：

- 已冻结的任务一、任务二、任务三文档契约继续同时成立

实际结果：

- 18/18 测试通过

## 对后续开发的提醒

- 任务三后续步骤仍需继续使用同一个 `tests/test_task3_infrastructure_contract.py` 逐步扩展，不要把 3.2-3.5 一次性并入同一轮未验证改动。
- `PreviewWriterCapability` 与 `SideEffectExecutorCapability` 的职责已经冻结分离，后续任何 connector 设计都不能把 preview 生成和真实写入耦合成单一入口。
- Jira connector 的上层输出现在必须同时覆盖 bug 主体字段、需求线索和 `writeback_targets`，后续实现中不要把这些解析逻辑重新散落到 workflow 或 skill 中。
- GitLab 链接生成规则已经被固定为 connector 职责，后续实现不得在 workflow、skill 或 renderer 中各自维护一套 commit / branch / MR URL 拼接逻辑。
- Feishu block 定位和 repo 模块候选解析现在都被要求经由 Infrastructure 暴露，后续若进入代码实现，不应让 workflow 直接解析文档树或直接执行仓库扫描。
- connector 选择规则现在也已被冻结；进入任务四之前，所有上层设计都应默认“先通过 registry 取 capability，再消费标准化结果”，不要引入新的旁路平台选择逻辑。

---

# 2026-03-18 任务四续写

## 本轮目标

- 继续执行 [实施计划](/Users/sunyi/ai/MySkills/memory-bank/实施计划.md) 的任务四，只推进 Skill 层契约冻结，不进入任务五。
- 严格按步骤推进：每完成一个步骤就立即验证，在验证通过前不进入下一个步骤。
- 在验证通过后补充 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 的文件职责说明，并记录可供后续开发者复用的验证证据。

## 已完成工作

1. 重新核对了 [需求文档](/Users/sunyi/ai/MySkills/memory-bank/需求文档.md)、[技术方案](/Users/sunyi/ai/MySkills/memory-bank/技术方案.md)、[实施计划](/Users/sunyi/ai/MySkills/memory-bank/实施计划.md)、[architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 中与 Skill Layer 有关的上游边界，确认当前任务仍是文档契约冻结，而非进入 `src/` 代码实现。
2. 新增 [tests/test_task4_skill_contract.py](/Users/sunyi/ai/MySkills/tests/test_task4_skill_contract.py)，先以失败测试锁定任务四六个步骤与文件职责说明的目标。
3. 扩展 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 的“## 6. 任务四冻结结果”，新增以下六个章节：
   - 4.1 skill 清单与职责冻结
   - 4.2 统一输出封装冻结
   - 4.3 需求映射与人工覆盖规则冻结
   - 4.4 分析类产物最小字段集冻结
   - 4.5 写入类 canonical draft 规则冻结
   - 4.6 skill 错误语义冻结
4. 补充了 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 的“当前仓库文件职责”索引，新增并解释了以下文件的作用：
   - [`.gitignore`](/Users/sunyi/ai/MySkills/.gitignore)
   - [`temp/prompt.md`](/Users/sunyi/ai/MySkills/temp/prompt.md)
   - [tests/test_task4_skill_contract.py](/Users/sunyi/ai/MySkills/tests/test_task4_skill_contract.py)
5. 将 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 顶部说明从“前三项任务持续产物”同步更新为“前四项任务持续产物”，避免任务描述与当前冻结范围不一致。

## 验证记录

### 分步验证

每个步骤都遵循了“先写失败测试，再补文档，再回测”的顺序，单步验证命令均使用：

```bash
python3 -m unittest tests.test_task4_skill_contract.<具体测试名> -v
```

分步结果：

- 步骤 4.1 红灯原因为缺少“## 6. 任务四冻结结果”与“### 4.1 skill 清单与职责冻结”章节，补充后 1/1 通过。
- 步骤 4.2 红灯原因为缺少“### 4.2 统一输出封装冻结”章节，补充后 1/1 通过。
- 步骤 4.3 红灯原因为缺少“### 4.3 需求映射与人工覆盖规则冻结”章节，补充后 1/1 通过。
- 步骤 4.4 红灯原因为缺少“### 4.4 分析类产物最小字段集冻结”章节，补充后 1/1 通过。
- 步骤 4.5 红灯原因为缺少“### 4.5 写入类 canonical draft 规则冻结”章节，补充后 1/1 通过。
- 步骤 4.6 红灯原因为缺少“### 4.6 skill 错误语义冻结”章节，补充后 1/1 通过。
- 文件职责补充验证的红灯原因为 `architecture.md` 尚未解释 `.gitignore`、`temp/prompt.md` 与 `tests/test_task4_skill_contract.py`，补充后 1/1 通过。

### 任务四整体验证

命令：

```bash
python3 -m unittest tests/test_task4_skill_contract.py -v
```

预期结果：

- 任务四相关 7 条测试全部通过

实际结果：

- 7/7 测试通过

### 任务一到任务四总回归

命令：

```bash
python3 -m unittest tests/test_task1_architecture_contract.py tests/test_task2_persistence_contract.py tests/test_task3_infrastructure_contract.py tests/test_task4_skill_contract.py -v
```

预期结果：

- 已冻结的任务一到任务四文档契约继续同时成立

实际结果：

- 25/25 测试通过

## 对后续开发的提醒

- 当前已完成到任务四，下一步仍应先从 [实施计划](/Users/sunyi/ai/MySkills/memory-bank/实施计划.md) 的任务五读取八阶段主工作流与状态机要求，再决定代码骨架如何承接。
- `StageResult<T>` 已被冻结为 Skill 层统一输出外壳，后续进入实现时不要再为单个 skill 设计特例返回结构。
- `project-context` 的需求映射结果必须继续保留 `requirement_binding_status`、`binding_reason` 与 `allowed_next_actions`，不要把这部分逻辑散落回 workflow 的自由文本分支。
- `gitlab-linker` 与 `feishu-recorder` 只能生成 canonical draft；preview、`preview hash`、marker 与 `idempotency_key` 的正式生成 owner 仍然是 Infrastructure。
- skill 错误输出必须继续复用任务一冻结的 `StructuredError` 语义，以便任务五状态机能够直接消费“等待输入 / 人工修正 / 终止失败”三类结果。

---

# 2026-03-18 任务五续写

## 本轮目标

- 继续执行 [实施计划](/Users/sunyi/ai/MySkills/memory-bank/实施计划.md) 的任务五，只推进主工作流与状态机冻结，不进入任务六。
- 严格按步骤推进：每完成一个步骤就立即验证，在验证通过前不进入下一个步骤。
- 在验证通过后补充 [progress.md](/Users/sunyi/ai/MySkills/memory-bank/progress.md) 与 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md)，为后续开发者记录可恢复的上下文与文件职责。

## 已完成工作

1. 重新核对了 [需求文档](/Users/sunyi/ai/MySkills/memory-bank/需求文档.md)、[技术方案](/Users/sunyi/ai/MySkills/memory-bank/技术方案.md)、[实施计划](/Users/sunyi/ai/MySkills/memory-bank/实施计划.md)、[architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 之间与任务五相关的上游约束，确认当前任务仍然是文档契约冻结，而不是进入任务六或 `src/` 代码实现。
2. 尝试按隔离执行要求创建 `.worktrees/task5-workflow-state-machine` worktree，但确认当前仓库的 `memory-bank/architecture.md`、`memory-bank/progress.md`、`tests/`、`temp/` 等关键基线文件仍处于未跟踪状态，新 worktree 无法继承这些内容，因此改回当前工作区继续推进，避免在过期基线上实施任务五。
3. 新增 [tests/test_task5_workflow_contract.py](/Users/sunyi/ai/MySkills/tests/test_task5_workflow_contract.py)，并严格按“先红后绿”的顺序逐步锁定任务五的 6 个实施步骤与文件职责说明。
4. 扩展 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md)：
   - 将顶部说明从“前四项任务持续产物”同步更新为“前五项任务持续产物”
   - 新增“## 7. 任务五冻结结果”
   - 新增“### 5.1 八阶段主流程冻结”
   - 新增“### 5.2 审批门与审批结果语义冻结”
   - 新增“### 5.3 Execution 阶段输入完成矩阵冻结”
   - 新增“### 5.4 stale 与 superseded 规则冻结”
   - 新增“### 5.5 恢复执行规则冻结”
   - 新增“### 5.6 partial_success 语义冻结”
5. 补充了 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 的“当前仓库文件职责”索引，新增并解释了 [tests/test_task5_workflow_contract.py](/Users/sunyi/ai/MySkills/tests/test_task5_workflow_contract.py) 的作用。

## 验证记录

### 分步验证

每个步骤都遵循了“先写失败测试，再补文档，再回测”的顺序。由于当前 Python 3.14 环境下 `tests/` 目录不是可导入 package，`python3 -m unittest tests/...` 与 `discover -s tests` 不能稳定工作，因此本轮统一采用直接执行测试脚本的方式验证：

```bash
python3 tests/test_task5_workflow_contract.py
```

分步结果：

- 步骤 5.1 红灯原因为缺少“## 7. 任务五冻结结果”与“### 5.1 八阶段主流程冻结”章节，补充后 1/1 通过。
- 步骤 5.2 红灯原因为缺少“### 5.2 审批门与审批结果语义冻结”章节；首次补充后因缺少“严格分离”表述再次失败，补齐后 2/2 通过。
- 步骤 5.3 红灯原因为缺少“### 5.3 Execution 阶段输入完成矩阵冻结”章节，补充后 3/3 通过。
- 步骤 5.4 红灯原因为缺少“### 5.4 stale 与 superseded 规则冻结”章节，补充后 4/4 通过。
- 步骤 5.5 红灯原因为缺少“### 5.5 恢复执行规则冻结”章节，补充后 5/5 通过。
- 步骤 5.6 红灯原因为缺少“### 5.6 partial_success 语义冻结”章节，补充后 6/6 通过。
- 文件职责补充验证的红灯原因为 `architecture.md` 尚未解释 `tests/test_task5_workflow_contract.py`，补充后 7/7 通过。

### 任务五整体验证

命令：

```bash
python3 tests/test_task5_workflow_contract.py
```

预期结果：

- 任务五相关 7 条测试全部通过

实际结果：

- 7/7 测试通过

### 任务一到任务五总回归

触发方式：

- [tests/test_task1_architecture_contract.py](/Users/sunyi/ai/MySkills/tests/test_task1_architecture_contract.py)
- [tests/test_task2_persistence_contract.py](/Users/sunyi/ai/MySkills/tests/test_task2_persistence_contract.py)
- [tests/test_task3_infrastructure_contract.py](/Users/sunyi/ai/MySkills/tests/test_task3_infrastructure_contract.py)
- [tests/test_task4_skill_contract.py](/Users/sunyi/ai/MySkills/tests/test_task4_skill_contract.py)
- [tests/test_task5_workflow_contract.py](/Users/sunyi/ai/MySkills/tests/test_task5_workflow_contract.py)

统一命令模式：

```bash
python3 tests/<test_file>.py
```

预期结果：

- 已冻结的任务一到任务五文档契约继续同时成立

实际结果：

- 7 + 6 + 5 + 7 + 7，共 32/32 测试通过

## 对后续开发的提醒

- 当前已完成到任务五，下一步应严格从 [实施计划](/Users/sunyi/ai/MySkills/memory-bank/实施计划.md) 的任务六继续，先冻结 preview、审批绑定、execute 前置条件与对账规则，再决定代码骨架如何承接。
- `Execution` 阶段现在已被明确定义为“吸收外部补录并维护当前有效摘要”的编排阶段，后续实现不得把它扩展成自动改代码或自动执行测试。
- `stale` 与 `superseded` 已被明确区分为“对象内容过期”和“审批事实过期”，后续实现不要把这两个状态合并成一个布尔值。
- 恢复执行必须继续以 checkpoint、当前有效引用和 ledger 为真源；`waiting_external_input` 与 `outcome_unknown` 都是合法恢复分支，不能被简化成“直接重跑”。
- `partial_success` 已被冻结为最终结果语义之一，后续实现必须允许只重试失败副作用，而不是重放已成功部分。

---

# 2026-03-18 任务六续写

## 本轮目标

- 继续执行 [实施计划](/Users/sunyi/ai/MySkills/memory-bank/实施计划.md) 的任务六，只推进写入 preview、审批与真实执行链路冻结，不进入任务七。
- 严格按步骤推进：每完成一个步骤就立即验证，在验证通过并记录进度之前不进入下一步。
- 持续补充 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 的架构见解与文件职责说明，保证后续开发人员可追溯。

## 已完成工作

1. 重新核对了 [需求文档](/Users/sunyi/ai/MySkills/memory-bank/需求文档.md)、[技术方案](/Users/sunyi/ai/MySkills/memory-bank/技术方案.md)、[实施计划](/Users/sunyi/ai/MySkills/memory-bank/实施计划.md)、[architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 与任务六有关的上游约束，确认当前仍是文档契约冻结，不进入任务七或 `src/` 代码实现。
2. 新增 [tests/test_task6_writeback_contract.py](/Users/sunyi/ai/MySkills/tests/test_task6_writeback_contract.py)，先以红灯方式锁定任务六步骤 6.1。
3. 扩展 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md)：
   - 将顶部说明从“前五项任务持续产物”同步更新为“前六项任务持续产物”
   - 新增“## 8. 任务六冻结结果”
   - 新增“### 6.1 preview 生成规则冻结”
   - 明确 Jira 回写与飞书写入 preview 的输入来源、允许变化字段、必须稳定字段，以及与真实写入 payload 的一致性要求
4. 继续扩展 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md)：
   - 新增“### 6.2 preview 版本与审批绑定冻结”
   - 明确 `preview_ref`、`preview_hash`、旧审批失效、`superseded` 标记和 execute 前一致性校验要求
5. 继续扩展 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md)：
   - 新增“### 6.3 execute 前置条件冻结”
   - 明确审批通过、preview 一致、目标查重通过、账本准备完成、checkpoint 已落盘五类 execute 门禁
6. 继续扩展 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md)：
   - 新增“### 6.4 marker、幂等键与去重规则冻结”
   - 明确 `marker`、`target ref`、`idempotency_key` 在 dry-run、resume、record 与主流程中的统一生成与去重规则
7. 继续扩展 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md)：
   - 新增“### 6.5 non-interactive 与 dry-run 语义冻结”
   - 明确交互式、`--non-interactive`、`dry-run` 三种模式的允许动作、失败条件与副作用约束
8. 继续扩展 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md)：
   - 新增“### 6.6 对账与未知结果收敛规则冻结”
   - 明确 `confirmed_applied`、`confirmed_not_applied`、`still_unknown` 三类 reconcile 结果及 `outcome_unknown` 的恢复约束
9. 补充了 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 的“当前仓库文件职责”索引，新增并解释了 [tests/test_task6_writeback_contract.py](/Users/sunyi/ai/MySkills/tests/test_task6_writeback_contract.py) 的作用。

## 验证记录

### 步骤 6.1

验证对象：

- Jira 回写与飞书写入的 preview 生成规则
- 任务六章节是否已在 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 中冻结

触发方式：

```bash
python3 tests/test_task6_writeback_contract.py
```

预期结果：

- 测试先失败，证明 `architecture.md` 尚未覆盖任务六步骤 6.1
- 补充文档后再次执行通过，证明 preview 生成规则已具备最小可验证证据

实际结果：

- 红灯阶段失败原因为缺少“## 8. 任务六冻结结果”与“### 6.1 preview 生成规则冻结”章节
- 绿灯阶段 1/1 测试通过

### 步骤 6.2

验证对象：

- preview 刷新后的版本标识与审批绑定规则
- 旧 preview 审批失效与 execute 前一致性校验

触发方式：

```bash
python3 tests/test_task6_writeback_contract.py
```

预期结果：

- 新增 6.2 测试后先失败，证明 `architecture.md` 尚未显式冻结 preview 版本与审批绑定
- 补充文档后再次执行通过，证明旧审批失效与当前有效 preview 绑定规则已具备最小可验证证据

实际结果：

- 红灯阶段失败原因为缺少“### 6.2 preview 版本与审批绑定冻结”章节
- 绿灯阶段 2/2 测试通过

### 步骤 6.3

验证对象：

- Jira / 飞书真实写入的 execute 前置条件
- 缺审批、preview 不一致、重复目标、未落账四类阻断场景

触发方式：

```bash
python3 tests/test_task6_writeback_contract.py
```

预期结果：

- 新增 6.3 测试后先失败，证明 `architecture.md` 尚未显式冻结 execute 门禁
- 补充文档后再次执行通过，证明真实写入前的前置条件已具备最小可验证证据

实际结果：

- 红灯阶段失败原因为缺少“### 6.3 execute 前置条件冻结”章节
- 绿灯阶段 3/3 测试通过

### 步骤 6.4

验证对象：

- Jira / 飞书写入的 `marker`、`target ref`、`idempotency_key` 规则
- dry-run、resume、record 与主流程跨入口去重一致性

触发方式：

```bash
python3 tests/test_task6_writeback_contract.py
```

预期结果：

- 新增 6.4 测试后先失败，证明 `architecture.md` 尚未显式冻结统一去重口径
- 补充文档后再次执行通过，证明重复写入防护已具备最小可验证证据

实际结果：

- 红灯阶段失败原因为缺少“### 6.4 marker、幂等键与去重规则冻结”章节
- 绿灯阶段 4/4 测试通过

### 步骤 6.5

验证对象：

- `--non-interactive` 的 `preview_hash` 确认规则
- `dry-run` 的允许动作、禁止真实写入与禁止成功副作用记录

触发方式：

```bash
python3 tests/test_task6_writeback_contract.py
```

预期结果：

- 新增 6.5 测试后先失败，证明 `architecture.md` 尚未显式冻结模式差异语义
- 补充文档后再次执行通过，证明 CLI 模式差异已具备最小可验证证据

实际结果：

- 红灯阶段失败原因为缺少“### 6.5 non-interactive 与 dry-run 语义冻结”章节
- 绿灯阶段 5/5 测试通过

### 步骤 6.6

验证对象：

- `outcome_unknown` 的 reconcile 收敛规则
- `confirmed_applied`、`confirmed_not_applied`、`still_unknown` 三类对账结果及后续动作

触发方式：

```bash
python3 tests/test_task6_writeback_contract.py
```

预期结果：

- 新增 6.6 测试后先失败，证明 `architecture.md` 尚未显式冻结未知结果恢复规则
- 补充文档后再次执行通过，证明任务六最后一步已具备最小可验证证据

实际结果：

- 红灯阶段失败原因为缺少“### 6.6 对账与未知结果收敛规则冻结”章节
- 绿灯阶段 6/6 测试通过

### 文件职责索引补充

验证对象：

- [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 是否已解释 `tests/test_task6_writeback_contract.py` 的文件职责

触发方式：

```bash
python3 tests/test_task6_writeback_contract.py
```

预期结果：

- 文件职责索引测试先失败，证明任务六测试文件尚未被纳入架构文档索引
- 补充索引后再次执行通过，证明“每个文件做什么”的说明已同步更新

实际结果：

- 红灯阶段失败原因为 `architecture.md` 尚未包含 `tests/test_task6_writeback_contract.py`
- 绿灯阶段 7/7 测试通过

### 任务六整体验证

命令：

```bash
python3 tests/test_task6_writeback_contract.py
```

预期结果：

- 任务六相关 7 条测试全部通过

实际结果：

- 7/7 测试通过

### 任务一到任务六总回归

命令：

```bash
python3 tests/test_task1_architecture_contract.py && python3 tests/test_task2_persistence_contract.py && python3 tests/test_task3_infrastructure_contract.py && python3 tests/test_task4_skill_contract.py && python3 tests/test_task5_workflow_contract.py && python3 tests/test_task6_writeback_contract.py
```

预期结果：

- 已冻结的任务一到任务六文档契约继续同时成立

实际结果：

- 7 + 6 + 5 + 7 + 7 + 7，共 39/39 测试通过

## 对后续开发的提醒

- 进入 6.2 前，必须继续保持“先红灯锁定，再补文档，再回测”的顺序，不要把 preview 版本绑定、execute 门禁和 reconcile 规则提前混入同一次未验证改动。
- preview 的正式 owner 已继续冻结为 `PreviewWriterCapability`，后续实现不能把 canonical draft 和最终 preview 混成同一个对象。
- 进入 6.3 后，应只处理真实写入的 execute 前置门禁，不要把 marker / 幂等键或 dry-run 语义提前混入同一步。
- `审批通过` 与 execute 门禁现在已经被拆开；后续实现不能把“批准事件”直接映射成“真实写入已发生”。
- 进入 6.5 时，应只处理交互模式与 dry-run 语义差异，不要把未知结果 reconcile 规则提前塞进模式判断里。
- `dry-run` 现在已被明确定义为“允许读取与 preview、禁止真实写入和成功副作用记录”；后续实现不得在 dry-run 路径偷偷落成功账本。
- 任务六六个步骤已经具备逐步验证证据；后续若进入代码实现，应先从这些冻结规则派生最小接口与状态断言，而不是先写平台适配细节。
- 当前工作已明确停在任务六；进入任务七前，应先以这里冻结的 preview / execute / reconcile 规则作为 CLI 命令树与子工作流设计的前置约束。

---

# 2026-03-18 任务七续写

## 本轮目标

- 继续执行 [实施计划](/Users/sunyi/ai/MySkills/memory-bank/实施计划.md) 的任务七，只推进 CLI 与子工作流契约冻结，不进入任务八。
- 严格按步骤推进：每完成一个步骤就立即验证，验证通过后才进入下一步。
- 在 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 中补充 CLI 命令树、命令语义、输出契约和标准演示路径，并同步记录文件职责说明。

## 已完成工作

1. 再次核对了 [需求文档](/Users/sunyi/ai/MySkills/memory-bank/需求文档.md)、[技术方案](/Users/sunyi/ai/MySkills/memory-bank/技术方案.md)、[实施计划](/Users/sunyi/ai/MySkills/memory-bank/实施计划.md)、[architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 之间与 CLI、子工作流、preview / execute 边界有关的上游约束。
2. 新增 [tests/test_task7_cli_contract.py](/Users/sunyi/ai/MySkills/tests/test_task7_cli_contract.py)，按任务七的六个步骤分别建立最小文档契约测试，延续“先失败测试，再补文档，再回测”的节奏。
3. 扩展了 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 的“## 9. 任务七冻结结果”，新增以下六个章节：
   - 7.1 CLI 命令树冻结
   - 7.2 `bind` 与 `inspect` 语义冻结
   - 7.3 `run` 命令行为冻结
   - 7.4 `record` 子工作流冻结
   - 7.5 CLI 输出契约冻结
   - 7.6 标准演示路径冻结
4. 更新了 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 的文件职责索引，补充了 [tests/test_task7_cli_contract.py](/Users/sunyi/ai/MySkills/tests/test_task7_cli_contract.py) 的文件功能说明，并把文档总述同步为“实施计划前七项任务的持续产物”。
5. 在 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 末尾新增“任务七后的实现提醒”，明确：
   - CLI 入口不应改变状态机真相
   - `record` 不得形成平行状态流转
   - `status --json` 应直接映射 workflow 当前有效态
   - 任务八应围绕已经冻结的标准演示路径继续收口

## 验证记录

### 分步验证

每个步骤都遵循了“先写失败测试，再补文档，再回测”的顺序，单步验证命令均使用：

```bash
python3 -m unittest tests.test_task7_cli_contract.TaskSevenCliContractTest.<具体测试名> -v
```

### 任务七整体验证

命令：

```bash
python3 -m unittest tests/test_task7_cli_contract.py -v
```

预期结果：

- 任务七相关 6 条测试全部通过

实际结果：

- 6/6 测试通过

### 任务一到任务七总回归

命令：

```bash
python3 -m unittest tests/test_task1_architecture_contract.py tests/test_task2_persistence_contract.py tests/test_task3_infrastructure_contract.py tests/test_task4_skill_contract.py tests/test_task5_workflow_contract.py tests/test_task6_writeback_contract.py tests/test_task7_cli_contract.py -v
```

预期结果：

- 已冻结的任务一到任务七文档契约继续同时成立

实际结果：

- 45/45 测试通过

## 对后续开发的提醒

- 当前工作已明确停在任务七；在用户未要求前，不应进入任务八的报告、追踪矩阵和交付包收口。
- 任务七已经把 `bind`、`inspect`、`run`、`record` 的边界冻结为唯一命令树；后续实现不要再按平台扩出一套平行 CLI 入口。
- `record` 已被明确为复用统一状态机的快捷入口，后续实现不得让它绕过 preview、审批、checkpoint 或 side-effect ledger。
- `status --json` 的最小字段集已冻结；后续 CLI 实现应直接从 workflow 当前有效态派生这些字段，避免 renderer 自造状态。
- 标准演示路径已经固定为 `bind -> inspect -> run -> approve/revise -> dry-run writeback -> real writeback -> export report`；进入任务八时应基于这条路径建立验收与交付收口，而不是再定义新的官方主线。

---

# 2026-03-18 任务八续写

## 本轮目标

- 继续执行 [实施计划](/Users/sunyi/ai/MySkills/memory-bank/实施计划.md) 的任务八，完成报告、验收与交付收口，不再进入新的任务拆解。
- 严格按步骤推进：每完成一个步骤就立即验证，验证通过后才进入下一步。
- 在 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 中补充交付收口相关架构基线，并同步记录文件职责说明。

## 已完成工作

1. 再次核对了 [需求文档](/Users/sunyi/ai/MySkills/memory-bank/需求文档.md)、[技术方案](/Users/sunyi/ai/MySkills/memory-bank/技术方案.md)、[实施计划](/Users/sunyi/ai/MySkills/memory-bank/实施计划.md)、[architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 和 [progress.md](/Users/sunyi/ai/MySkills/memory-bank/progress.md) 之间与报告、验收、交付收口有关的上游约束。
2. 新增 [tests/test_task8_delivery_contract.py](/Users/sunyi/ai/MySkills/tests/test_task8_delivery_contract.py)，按任务八六个步骤分别建立最小文档契约测试，继续沿用“先失败测试，再补文档，再回测”的节奏。
3. 扩展了 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 的“## 10. 任务八冻结结果”，新增以下六个章节：
   - 8.1 `BugfixReport` 最小内容冻结
   - 8.2 需求到测试追踪矩阵冻结
   - 8.3 阶段性测试套件结构冻结
   - 8.4 成功指标与证据要求冻结
   - 8.5 最终验收清单冻结
   - 8.6 交付包清单冻结
4. 更新了 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 的文件职责索引，补充了 [tests/test_task8_delivery_contract.py](/Users/sunyi/ai/MySkills/tests/test_task8_delivery_contract.py) 的文件功能说明，并把文档总述同步为“实施计划前八项任务的持续产物”。
5. 在 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 末尾新增“任务八后的交付提醒”，明确：
   - 交付收口应围绕 `BugfixReport`、追踪矩阵、验收清单和交付包清单统一展开
   - 追踪矩阵、测试套件结构、验收清单和交付包各自回答不同的验收问题
   - 后续若实现与收口文档冲突，应优先回到上游文档统一口径

## 验证记录

### 分步验证

每个步骤都遵循了“先写失败测试，再补文档，再回测”的顺序，单步验证命令均使用：

```bash
python3 -m unittest tests.test_task8_delivery_contract.TaskEightDeliveryContractTest.<具体测试名> -v
```

### 任务八整体验证

命令：

```bash
python3 -m unittest tests/test_task8_delivery_contract.py -v
```

预期结果：

- 任务八相关 6 条测试全部通过

实际结果：

- 6/6 测试通过

### 任务一到任务八总回归

命令：

```bash
python3 -m unittest tests/test_task1_architecture_contract.py tests/test_task2_persistence_contract.py tests/test_task3_infrastructure_contract.py tests/test_task4_skill_contract.py tests/test_task5_workflow_contract.py tests/test_task6_writeback_contract.py tests/test_task7_cli_contract.py tests/test_task8_delivery_contract.py -v
```

预期结果：

- 已冻结的任务一到任务八文档契约继续同时成立

实际结果：

- 51/51 测试通过

## 对后续开发的提醒

- 当前实施计划的八项任务已经全部完成文档冻结；后续若进入代码实现，应以这些冻结结论为边界，而不是重新定义 v1 范围。
- `BugfixReport`、追踪矩阵、测试套件结构、成功指标、验收清单和交付包清单现在已经形成收口链路，后续验收工作应优先复用这条链路。
- 若后续实现要补充新的演示方式或新的验收指标，必须先判断是否与现有标准演示路径、追踪矩阵和交付包清单冲突。
- 当前仓库仍以文档先行为主；若后续进入代码骨架或实现阶段，应继续保持“先锁契约、再写实现、再做回归”的节奏。

---

# 2026-03-18 features 实现文档补充

## 本轮目标

- 读取 [需求文档](/Users/sunyi/ai/MySkills/memory-bank/需求文档.md)、[技术方案](/Users/sunyi/ai/MySkills/memory-bank/技术方案.md)、[实施计划](/Users/sunyi/ai/MySkills/memory-bank/实施计划.md) 与 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md)，把 v1 能力按“业务闭环”拆解为若干 feature。
- 在 `memory-bank/features/` 下新增总索引文档和 8 份 feature 实现文档，使其达到“可直接开发”的深度，但不进入 `src/` 代码实现。
- 新增一组专门校验 `features/` 文档集的最小契约测试，并同步更新文件职责索引。

## 已完成工作

1. 确认 `memory-bank/features/` 已存在但为空目录，因此本轮不做迁移，只补全该目录下的新文档集合。
2. 新增 [memory-bank/features/README.md](/Users/sunyi/ai/MySkills/memory-bank/features/README.md)，按业务闭环列出：
   - 8 个 feature 的目标摘要
   - 前置依赖与推荐实现顺序
   - 需求文档目标/场景到 feature 的映射
   - 技术方案模块/分层到 feature 的映射
   - 实施计划任务到 feature 的映射
   - feature 阅读导航
3. 新增以下 8 份 feature 实现文档，并统一使用“目标与用户价值 / 来源依据 / 范围 / 前置依赖与输出产物 / 核心对象与边界 / 实现设计 / 开发任务拆解 / 测试与验收 / 交接点”模板：
   - [F01-项目画像与关系绑定](/Users/sunyi/ai/MySkills/memory-bank/features/F01-项目画像与关系绑定.md)
   - [F02-run-持久化审计与安全底座](/Users/sunyi/ai/MySkills/memory-bank/features/F02-run-持久化审计与安全底座.md)
   - [F03-只读接入与上下文解析](/Users/sunyi/ai/MySkills/memory-bank/features/F03-只读接入与上下文解析.md)
   - [F04-分析链路与结构化产物](/Users/sunyi/ai/MySkills/memory-bank/features/F04-分析链路与结构化产物.md)
   - [F05-主工作流审批与恢复](/Users/sunyi/ai/MySkills/memory-bank/features/F05-主工作流审批与恢复.md)
   - [F06-补录写回与幂等执行](/Users/sunyi/ai/MySkills/memory-bank/features/F06-补录写回与幂等执行.md)
   - [F07-CLI-命令体系与子工作流](/Users/sunyi/ai/MySkills/memory-bank/features/F07-CLI-命令体系与子工作流.md)
   - [F08-报告验收与交付收口](/Users/sunyi/ai/MySkills/memory-bank/features/F08-报告验收与交付收口.md)
4. 新增 [tests/test_features_catalog_contract.py](/Users/sunyi/ai/MySkills/tests/test_features_catalog_contract.py)，把本轮文档任务收敛为一组独立契约测试，覆盖：
   - `README.md` 与 8 份 feature 文档存在性
   - feature 文档统一模板章节
   - 每份文档的关键主题覆盖
   - `README.md` 对需求、技术方案、实施计划的映射
   - feature 文档不扩展 v1 非目标
5. 更新 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 的“当前仓库文件职责”索引，补充了：
   - `memory-bank/features/README.md`
   - 8 份 feature 实现文档
   - `tests/test_features_catalog_contract.py`
6. 在 [architecture.md](/Users/sunyi/ai/MySkills/memory-bank/architecture.md) 的“对后续实现的架构提示”中补充说明：后续代码实现应优先以 `features/` 文档组织工作包，而不是重新退回按实施计划编号切分。

## 验证记录

### 验证对象

- `memory-bank/features/` 目录下总索引与 8 份 feature 实现文档
- `tests/test_features_catalog_contract.py`
- `architecture.md` 文件职责索引同步结果

### 触发方式

命令：

```bash
python3 -m unittest tests/test_features_catalog_contract.py -v
python3 -m unittest discover -s tests -v
```

### 预期结果

- `test_features_catalog_contract.py` 中的结构、模板、覆盖与边界检查全部通过
- 原有任务一到任务八的 51 条文档契约测试继续通过
- 新增测试加入后，总回归继续保持通过

### 实际结果

- `python3 -m unittest tests/test_features_catalog_contract.py -v` 共 6/6 测试通过
- `python3 -m unittest discover -s tests -v` 共 57/57 测试通过
- 新增 `features/` 文档集未破坏既有任务一到任务八的文档契约基线

## 对后续开发的提醒

- `features/` 目录现在是承接后续代码实现的 feature 工作包入口，优先级低于上游文档、高于临时对话说明。
- 后续若进入 `src/` 代码实现，应优先按 `README.md` 中的推荐顺序推进，而不是把所有实现一次性塞入单个阶段。
- 若后续新增 feature 文档，必须同步维护 `features/README.md`、`architecture.md` 文件职责索引和 `test_features_catalog_contract.py`。
