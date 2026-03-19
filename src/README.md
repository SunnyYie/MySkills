# `src/` 模块骨架

任务 1 只固定目录与职责边界，不提前实现任务 2 之后的业务细节。

- `src/app`：应用装配层，负责把 CLI 命令组织成一次 run 级执行，并隔离 workflow 与外部资源边界。
- `src/cli`：CLI 入口、参数解析、TTY/JSON 展示切换，不持有业务状态。
- `src/domain`：核心对象、schema 与枚举的唯一落点，等任务 2 冻结契约后补全。
- `src/workflow`：阶段编排、审批、回退、恢复与 checkpoint 策略的唯一 owner。
- `src/skills`：无状态结构化能力实现，输入输出遵循统一 `StageResult<T>` 契约。
- `src/infrastructure`：唯一底层访问层。
- `src/infrastructure/connectors`：Jira、GitLab、飞书等外部系统接入与能力路由。
- `src/infrastructure/repo`：本地仓库、Git 元数据、模块规则与代码搜索辅助。
- `src/storage`：项目画像、run 目录、checkpoint、artifact 与审计落盘。
- `src/renderers`：CLI、Markdown、JSON 输出渲染。
- `src/security`：脱敏、allowlist、敏感字段处理与安全策略。

当前阶段明确暂不为以下能力引入新的基础依赖：

- 文件系统与路径处理继续使用 Node.js 内置模块。
- Markdown 拼装先使用内部模板，不引入第三方模板引擎。
- 日志、配置、状态机、HTTP 客户端等能力后续仅在上位文档明确授权时再评估依赖。
