import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
ARCHITECTURE_PATH = ROOT / "memory-bank" / "architecture.md"


def read_architecture() -> str:
    return ARCHITECTURE_PATH.read_text(encoding="utf-8")


class TaskEightDeliveryContractTest(unittest.TestCase):
    def test_step_8_1_bugfix_report_minimum_content_is_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("## 10. 任务八冻结结果", content)
        self.assertIn("### 8.1 BugfixReport 最小内容冻结", content)
        for keyword in (
            "Bug 基本信息",
            "关联需求",
            "代码定位结果",
            "修复方案摘要",
            "验证结果",
            "GitLab 链接",
            "Jira 回写摘要",
            "飞书记录摘要",
            "审批历史",
            "开放风险",
            "最终状态",
            "统一最终输出",
            "不需要回头拼接多份中间产物",
        ):
            self.assertIn(keyword, content)

    def test_step_8_2_requirement_to_test_traceability_matrix_is_frozen(
        self,
    ) -> None:
        content = read_architecture()
        self.assertIn("### 8.2 需求到测试追踪矩阵冻结", content)
        for keyword in (
            "需求/验收场景 ID",
            "对应阶段",
            "测试层级",
            "前置数据",
            "执行动作",
            "预期退出码",
            "预期状态",
            "证据产物路径",
            "失败判定",
            "需求覆盖率",
            "所有 v1 验收场景",
            "至少对应一条验证路径",
        ):
            self.assertIn(keyword, content)

    def test_step_8_3_test_suite_structure_is_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 8.3 阶段性测试套件结构冻结", content)
        for keyword in (
            "领域模型",
            "持久化与安全",
            "skill",
            "workflow",
            "connector 契约",
            "CLI 集成",
            "需求追踪与指标验证",
            "验收场景",
            "单元测试",
            "契约测试",
            "集成测试",
            "验收测试",
            "分工清楚",
            "没有重复覆盖或明显缺口",
        ):
            self.assertIn(keyword, content)

    def test_step_8_4_success_metrics_and_evidence_requirements_are_frozen(
        self,
    ) -> None:
        content = read_architecture()
        self.assertIn("### 8.4 成功指标与证据要求冻结", content)
        for keyword in (
            "首次绑定时长",
            "Requirement Brief 生成耗时",
            "主流程成功率",
            "恢复执行成功率",
            "dry-run 覆盖率",
            "统计口径",
            "样本范围",
            "阈值门禁",
            "可采样",
            "可计算",
            "可复核",
        ):
            self.assertIn(keyword, content)

    def test_step_8_5_final_acceptance_checklist_is_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 8.5 最终验收清单冻结", content)
        for keyword in (
            "标准主流程",
            "审批分支",
            "配置缺失补录",
            "dry-run 与真实写入",
            "中断恢复",
            "部分成功与重试去重",
            "需求映射歧义",
            "子工作流独立完成",
            "关键场景",
            "明确验收入口",
            "验证动作",
            "证据要求",
        ):
            self.assertIn(keyword, content)

    def test_step_8_6_delivery_package_checklist_is_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 8.6 交付包清单冻结", content)
        for keyword in (
            "项目画像配置结构",
            "可运行 CLI",
            "八阶段工作流",
            "三类子工作流",
            "结构化 skill",
            "四类适配能力",
            "checkpoint 与账本机制",
            "Requirement Brief",
            "写回 preview 与执行能力",
            "BugfixReport",
            "使用与验收文档",
            "逐项对应",
            "完整",
            "可验收",
            "可演示",
        ):
            self.assertIn(keyword, content)


if __name__ == "__main__":
    unittest.main()
