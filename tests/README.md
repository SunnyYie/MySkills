# `tests/` 目录约定

任务 1 先固定测试落点和命名规则，确保后续 16 个任务都有明确入口。

- `tests/unit`：模块级单元测试，按实现目录分层，例如 `tests/unit/domain/*.spec.ts`、`tests/unit/workflow/*.spec.ts`。
- `tests/integration`：跨层边界与持久化/connector 组合验证，例如 `tests/integration/storage/*.spec.ts`、`tests/integration/app/*.spec.ts`。
- `tests/acceptance`：面向任务闭环与 CLI 场景的验收测试，文件名采用 `taskN-<topic>.spec.ts`。

命名规则：

- 单元测试使用 `<subject>.spec.ts`
- 集成测试使用 `<scenario>.spec.ts`
- 验收测试使用 `taskN-<scope>.spec.ts`

任务映射原则：

- 任务 1 先用验收测试锁定项目骨架。
- 任务 2 到任务 14 优先落到 `unit` 与 `integration`。
- 任务 15 与任务 16 同时补充 `acceptance` 与端到端回归覆盖。
