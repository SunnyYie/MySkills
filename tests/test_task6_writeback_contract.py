import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
ARCHITECTURE_PATH = ROOT / "memory-bank" / "architecture.md"


def read_architecture() -> str:
    return ARCHITECTURE_PATH.read_text(encoding="utf-8")


class TaskSixWritebackContractTest(unittest.TestCase):
    def test_step_6_1_preview_generation_rules_are_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("## 8. 任务六冻结结果", content)
        self.assertIn("### 6.1 preview 生成规则冻结", content)
        for keyword in (
            "Jira 回写",
            "飞书写入",
            "canonical draft",
            "preview",
            "允许变化",
            "必须稳定",
            "真实写入 payload",
            "动态字段",
            "可读",
            "可审批",
        ):
            self.assertIn(keyword, content)

    def test_step_6_2_preview_versioning_and_approval_binding_are_frozen(
        self,
    ) -> None:
        content = read_architecture()
        self.assertIn("### 6.2 preview 版本与审批绑定冻结", content)
        for keyword in (
            "preview_ref",
            "preview_hash",
            "旧审批失效",
            "一致性校验",
            "刷新",
            "superseded",
            "当前有效 preview",
            "不能继续用于真实写入",
        ):
            self.assertIn(keyword, content)

    def test_step_6_3_execute_prerequisites_are_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 6.3 execute 前置条件冻结", content)
        for keyword in (
            "审批通过",
            "preview 一致",
            "目标查重通过",
            "账本准备完成",
            "checkpoint 已落盘",
            "缺审批",
            "preview 不一致",
            "重复目标",
            "未落账",
            "被阻止",
        ):
            self.assertIn(keyword, content)

    def test_step_6_4_marker_idempotency_and_dedup_rules_are_frozen(
        self,
    ) -> None:
        content = read_architecture()
        self.assertIn("### 6.4 marker、幂等键与去重规则冻结", content)
        for keyword in (
            "marker",
            "target ref",
            "idempotency_key",
            "dry-run",
            "resume",
            "record",
            "主流程",
            "重复写入",
            "跨命令入口",
            "不会产生重复副作用",
        ):
            self.assertIn(keyword, content)

    def test_step_6_5_non_interactive_and_dry_run_semantics_are_frozen(
        self,
    ) -> None:
        content = read_architecture()
        self.assertIn("### 6.5 non-interactive 与 dry-run 语义冻结", content)
        for keyword in (
            "--non-interactive",
            "preview_hash",
            "dry-run",
            "允许读取",
            "允许 preview",
            "禁止真实写入",
            "成功副作用记录",
            "交互式",
            "非交互式",
            "失败条件",
        ):
            self.assertIn(keyword, content)

    def test_step_6_6_reconcile_and_unknown_outcome_rules_are_frozen(
        self,
    ) -> None:
        content = read_architecture()
        self.assertIn("### 6.6 对账与未知结果收敛规则冻结", content)
        for keyword in (
            "confirmed_applied",
            "confirmed_not_applied",
            "still_unknown",
            "outcome_unknown",
            "先对账",
            "可重试",
            "不会被直接当作失败重放",
            "不会被错误视为成功",
        ):
            self.assertIn(keyword, content)

    def test_file_catalog_mentions_task6_related_files(self) -> None:
        content = read_architecture()
        self.assertIn("tests/test_task6_writeback_contract.py", content)


if __name__ == "__main__":
    unittest.main()
