# `tests/` 目录约定

任务 1 先固定测试落点和命名规则，确保后续 16 个任务都有明确入口。

- `tests/unit`：模块级单元测试，按实现目录分层，例如 `tests/unit/domain/*.spec.ts`、`tests/unit/workflow/*.spec.ts`。
- `tests/integration`：跨层边界与持久化/connector 组合验证，例如 `tests/integration/storage/*.spec.ts`、`tests/integration/app/*.spec.ts`。
- `tests/acceptance`：面向任务闭环与 CLI 场景的验收测试，文件名采用 `taskN-<topic>.spec.ts`。
- `tests/milestones`：里程碑级回归与文档一致性检查，负责把 16 个任务、8 个验收场景和 5 个里程碑门槛收敛成可执行验证。

命名规则：

- 单元测试使用 `<subject>.spec.ts`
- 集成测试使用 `<scenario>.spec.ts`
- 验收测试使用 `taskN-<scope>.spec.ts`
- 里程碑回归使用 `<scope>.spec.ts`，并由 `tests/milestones/regression-plan.json` 维护任务/场景/里程碑追踪矩阵

任务映射原则：

- 任务 1 先用验收测试锁定项目骨架。
- 任务 2 到任务 14 优先落到 `unit` 与 `integration`。
- 任务 15 继续扩充 `integration` 与 `acceptance`。
- 任务 16 负责把三层验证结构补齐：任务级入口保留在 `unit` / `integration`，任务组级入口固定在 `acceptance`，里程碑级入口固定在 `tests/milestones`。
