import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
FEATURES_DIR = ROOT / "memory-bank" / "features"
README_PATH = FEATURES_DIR / "README.md"

FEATURE_FILES = {
    "F01-项目画像与关系绑定.md": ("ProjectProfile", "未绑定需求", "bind"),
    "F02-run-持久化审计与安全底座.md": ("checkpoint", "side-effect ledger", "reconcile"),
    "F03-只读接入与上下文解析.md": ("Jira", "GitLab", "connector registry"),
    "F04-分析链路与结构化产物.md": ("StageResult", "RequirementBrief", "canonical draft"),
    "F05-主工作流审批与恢复.md": ("Execution", "partial_success", "resume"),
    "F06-补录写回与幂等执行.md": ("preview", "idempotency_key", "dry-run"),
    "F07-CLI-命令体系与子工作流.md": ("bind", "record", "status --json"),
    "F08-报告验收与交付收口.md": ("BugfixReport", "追踪矩阵", "交付包"),
}

COMMON_HEADINGS = (
    "## 1. 目标与用户价值",
    "## 2. 来源依据",
    "## 3. 范围",
    "## 4. 前置依赖与输出产物",
    "## 5. 涉及的核心对象、状态与能力边界",
    "## 6. 实现设计",
    "## 7. 开发任务拆解",
    "## 8. 测试与验收",
    "## 9. 与其他 Feature 的交接点",
)


def read(path: pathlib.Path) -> str:
    return path.read_text(encoding="utf-8")


class FeaturesCatalogContractTest(unittest.TestCase):
    def test_readme_and_feature_files_exist(self) -> None:
        self.assertTrue(README_PATH.exists())
        for name in FEATURE_FILES:
            self.assertTrue((FEATURES_DIR / name).exists(), name)

    def test_readme_includes_index_sections_and_all_features(self) -> None:
        content = read(README_PATH)
        for heading in (
            "## 1. 项目背景与拆解原则",
            "## 2. Feature 总表",
            "## 3. 依赖关系与推荐实现顺序",
            "## 4. 来源映射表",
            "## 5. 阅读导航",
        ):
            self.assertIn(heading, content)

        for name in FEATURE_FILES:
            self.assertIn(name.replace(".md", ""), content)

        for keyword in (
            "业务闭环",
            "需求文档目标与场景 -> Feature",
            "技术方案模块/分层 -> Feature",
            "实施计划任务 -> Feature",
        ):
            self.assertIn(keyword, content)

    def test_each_feature_doc_uses_the_same_template(self) -> None:
        for name in FEATURE_FILES:
            content = read(FEATURES_DIR / name)
            for heading in COMMON_HEADINGS:
                self.assertIn(heading, content, f"{name}: missing {heading}")

    def test_feature_docs_cover_expected_keywords(self) -> None:
        for name, keywords in FEATURE_FILES.items():
            content = read(FEATURES_DIR / name)
            for keyword in keywords:
                self.assertIn(keyword, content, f"{name}: missing {keyword}")

    def test_feature_docs_do_not_expand_v1_non_goals(self) -> None:
        forbidden = (
            "自动修改代码",
            "自动执行测试",
            "自动创建 commit",
            "多用户调度",
            "自然语言对话式入口",
        )
        for name in FEATURE_FILES:
            content = read(FEATURES_DIR / name)
            self.assertIn("本 Feature 明确不做什么", content)
            for keyword in forbidden:
                self.assertNotIn(f"将{keyword}纳入", content)

    def test_readme_maps_plan_tasks_and_technical_layers(self) -> None:
        content = read(README_PATH)
        for keyword in (
            "任务一：锁定领域边界与核心契约",
            "任务八：完成报告、验收与交付收口",
            "CLI Layer",
            "Workflow/Agent Layer",
            "Skill Layer",
            "Infrastructure Layer",
            "Renderers",
        ):
            self.assertIn(keyword, content)


if __name__ == "__main__":
    unittest.main()
