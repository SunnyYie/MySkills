import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
ARCHITECTURE_PATH = ROOT / "memory-bank" / "architecture.md"


def read_architecture() -> str:
    return ARCHITECTURE_PATH.read_text(encoding="utf-8")


class TaskOneArchitectureContractTest(unittest.TestCase):
    def test_step_1_1_scope_and_non_scope_alignment(self) -> None:
        content = read_architecture()
        self.assertIn("## 1.1 v1 范围与非范围基线", content)
        self.assertIn("Jira bug intake", content)
        self.assertIn("Requirement Brief", content)
        self.assertIn("Bugfix Report", content)
        self.assertIn("自动修改代码", content)
        self.assertIn("自动执行测试", content)
        self.assertIn("自动创建 commit、branch 或 MR", content)

    def test_step_1_2_layer_responsibilities_are_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("## 1.2 系统分层职责冻结", content)
        self.assertIn("CLI Layer", content)
        self.assertIn("Workflow/Agent Layer", content)
        self.assertIn("Skill Layer", content)
        self.assertIn("Infrastructure Layer", content)
        self.assertIn("Renderers", content)
        self.assertIn("唯一业务状态 owner", content)
        self.assertIn("唯一外部系统与本地仓库访问入口", content)
        self.assertIn("只接受结构化输入并返回结构化输出", content)

    def test_step_1_3_core_objects_are_enumerated(self) -> None:
        content = read_architecture()
        self.assertIn("## 1.3 核心对象清单冻结", content)
        for object_name in (
            "ProjectProfile",
            "ExecutionContext",
            "RequirementBrief",
            "BugfixReport",
            "ApprovalRecord",
            "SideEffectLedgerEntry",
            "CheckpointRecord",
            "StructuredError",
        ):
            self.assertIn(object_name, content)

    def test_step_1_4_status_mapping_is_defined(self) -> None:
        content = read_architecture()
        self.assertIn("## 1.4 状态枚举与兼容映射冻结", content)
        for status_name in (
            "waiting_approval",
            "waiting_external_input",
            "approved_pending_write",
            "executing_side_effect",
            "partial_success",
            "run_lifecycle_status",
            "run_outcome_status",
            "run_status",
            "approve",
            "reject",
            "revise",
            "superseded",
        ):
            self.assertIn(status_name, content)

    def test_step_1_5_approval_binding_split_is_defined(self) -> None:
        content = read_architecture()
        self.assertIn("## 1.5 审批对象分型规则冻结", content)
        self.assertIn("artifact_ref", content)
        self.assertIn("preview_ref + preview_hash", content)
        self.assertIn("分析产物审批", content)
        self.assertIn("外部写入审批", content)
        self.assertIn("旧审批失效", content)

    def test_step_1_6_required_fields_and_error_semantics_are_defined(self) -> None:
        content = read_architecture()
        self.assertIn("## 1.6 条件必填与错误语义冻结", content)
        for keyword in (
            "GitLab 产物补录",
            "Jira 写回",
            "飞书写入",
            "未绑定需求",
            "permission_denied",
            "invalid_state",
            "outcome_unknown",
            "requirement_binding_unresolved",
        ):
            self.assertIn(keyword, content)

    def test_architecture_file_catalog_exists(self) -> None:
        content = read_architecture()
        self.assertIn("## 2. 当前仓库文件职责", content)
        for path_name in (
            "AGENTS.md",
            "memory-bank/需求文档.md",
            "memory-bank/技术方案.md",
            "memory-bank/实施计划.md",
            "memory-bank/progress.md",
            "memory-bank/architecture.md",
        ):
            self.assertIn(path_name, content)


if __name__ == "__main__":
    unittest.main()
