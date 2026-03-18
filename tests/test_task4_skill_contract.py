import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
ARCHITECTURE_PATH = ROOT / "memory-bank" / "architecture.md"


def read_architecture() -> str:
    return ARCHITECTURE_PATH.read_text(encoding="utf-8")


class TaskFourSkillContractTest(unittest.TestCase):
    def test_step_4_1_skill_catalog_is_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("## 6. 任务四冻结结果", content)
        self.assertIn("### 4.1 skill 清单与职责冻结", content)
        for keyword in (
            "config-loader",
            "jira-intake",
            "project-context",
            "requirement-summarizer",
            "code-locator",
            "fix-planner",
            "verification-recorder",
            "gitlab-linker",
            "feishu-recorder",
            "report-writer",
            "结构化输入",
            "结构化输出",
            "纯能力单元",
        ):
            self.assertIn(keyword, content)

    def test_step_4_2_stage_result_wrapper_is_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 4.2 统一输出封装冻结", content)
        for keyword in (
            "StageResult<T>",
            "status",
            "summary",
            "data",
            "warnings",
            "errors",
            "source_refs",
            "generated_at",
            "workflow",
            "相同外壳",
        ):
            self.assertIn(keyword, content)

    def test_step_4_3_requirement_mapping_and_manual_override_are_frozen(
        self,
    ) -> None:
        content = read_architecture()
        self.assertIn("### 4.3 需求映射与人工覆盖规则冻结", content)
        for keyword in (
            "requirement_binding_status",
            "unresolved",
            "唯一命中",
            "多候选",
            "无法识别",
            "人工指定",
            "人工覆盖",
            "binding_reason",
            "allowed_next_actions",
        ):
            self.assertIn(keyword, content)

    def test_step_4_4_analysis_artifact_minimum_fields_are_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 4.4 分析类产物最小字段集冻结", content)
        for keyword in (
            "RequirementBrief",
            "代码定位结果",
            "修复计划",
            "验证建议",
            "外部补录验证结果",
            "审批",
            "回退",
            "报告",
            "最小字段",
        ):
            self.assertIn(keyword, content)

    def test_step_4_5_canonical_draft_rules_are_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 4.5 写入类 canonical draft 规则冻结", content)
        for keyword in (
            "gitlab-linker",
            "feishu-recorder",
            "canonical draft",
            "preview",
            "preview hash",
            "marker",
            "idempotency_key",
            "dry-run",
            "真实写入",
        ):
            self.assertIn(keyword, content)

    def test_step_4_6_skill_error_semantics_are_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 4.6 skill 错误语义冻结", content)
        for keyword in (
            "输入缺失",
            "依赖数据无效",
            "候选歧义",
            "配置缺失",
            "外部读取失败",
            "继续等待输入",
            "需要人工修正",
            "直接失败终止",
            "StructuredError",
        ):
            self.assertIn(keyword, content)

    def test_file_catalog_mentions_task4_related_files(self) -> None:
        content = read_architecture()
        for path_name in (
            ".gitignore",
            "temp/prompt.md",
            "tests/test_task4_skill_contract.py",
        ):
            self.assertIn(path_name, content)


if __name__ == "__main__":
    unittest.main()
