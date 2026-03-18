import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
ARCHITECTURE_PATH = ROOT / "memory-bank" / "architecture.md"


def read_architecture() -> str:
    return ARCHITECTURE_PATH.read_text(encoding="utf-8")


class TaskFiveWorkflowContractTest(unittest.TestCase):
    def test_step_5_1_main_workflow_is_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("## 7. 任务五冻结结果", content)
        self.assertIn("### 5.1 八阶段主流程冻结", content)
        for keyword in (
            "Intake",
            "Context Resolution",
            "Requirement Synthesis",
            "Code Localization",
            "Fix Planning",
            "Execution",
            "Artifact Linking",
            "Knowledge Recording",
            "进入条件",
            "输入",
            "输出",
            "下一步去向",
        ):
            self.assertIn(keyword, content)

    def test_step_5_2_approval_gates_and_decisions_are_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 5.2 审批门与审批结果语义冻结", content)
        for keyword in (
            "approve",
            "reject",
            "revise",
            "分析阶段",
            "写入阶段",
            "通过继续",
            "拒绝终止",
            "退回重做",
            "已批但尚未执行",
            "审批通过",
            "真实写入执行",
            "严格分离",
        ):
            self.assertIn(keyword, content)

    def test_step_5_3_execution_input_matrix_is_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 5.3 Execution 阶段输入完成矩阵冻结", content)
        for keyword in (
            "GitLab 产物补录",
            "验证结果补录",
            "最小前置输入",
            "幂等合并",
            "替换规则",
            "仅补录 artifact",
            "仅补录 verification",
            "两者齐备",
            "重复补录",
            "继续等待",
            "允许推进",
            "当前有效摘要",
        ):
            self.assertIn(keyword, content)

    def test_step_5_4_stale_and_superseded_rules_are_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 5.4 stale 与 superseded 规则冻结", content)
        for keyword in (
            "stale",
            "superseded",
            "旧 artifact",
            "旧审批",
            "旧 preview",
            "失效条件",
            "回退",
            "当前有效态",
            "历史事实",
            "恢复",
            "不能再参与",
        ):
            self.assertIn(keyword, content)

    def test_step_5_5_resume_rules_are_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 5.5 恢复执行规则冻结", content)
        for keyword in (
            "最近 checkpoint",
            "--checkpoint",
            "waiting_external_input",
            "未终态副作用",
            "outcome_unknown",
            "reconcile",
            "中断后重进",
            "回滚",
            "不静默重跑",
            "不重复执行",
        ):
            self.assertIn(keyword, content)

    def test_step_5_6_partial_success_semantics_are_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 5.6 partial_success 语义冻结", content)
        for keyword in (
            "partial_success",
            "至少一个外部写成功",
            "至少一个不可忽略副作用失败",
            "最终结果",
            "成功副作用",
            "失败副作用",
            "只重试失败部分",
            "不是完全成功",
            "不是整体失败",
            "后续操作",
        ):
            self.assertIn(keyword, content)

    def test_file_catalog_mentions_task5_related_files(self) -> None:
        content = read_architecture()
        self.assertIn("tests/test_task5_workflow_contract.py", content)


if __name__ == "__main__":
    unittest.main()
