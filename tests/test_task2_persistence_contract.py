import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
ARCHITECTURE_PATH = ROOT / "memory-bank" / "architecture.md"


def read_architecture() -> str:
    return ARCHITECTURE_PATH.read_text(encoding="utf-8")


class TaskTwoPersistenceContractTest(unittest.TestCase):
    def test_step_2_1_storage_layout_is_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("## 4. 任务二冻结结果", content)
        self.assertIn("### 2.1 项目配置与 run 存储布局", content)
        for keyword in (
            "~/.config/bugfix-orchestrator/projects/<project_id>.json",
            "~/.local/share/bugfix-orchestrator/runs/<run_id>/",
            "context.json",
            "events.ndjson",
            "side-effects.ndjson",
            "checkpoints/",
            "artifacts/",
            "lock",
        ):
            self.assertIn(keyword, content)

    def test_step_2_2_persistence_allowlist_and_redaction_are_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 2.2 落盘 allowlist 与脱敏规则", content)
        for keyword in (
            "ExecutionContext",
            "checkpoint",
            "artifact",
            "报告",
            "日志",
            "token",
            "cookie",
            "Authorization",
            "request_payload",
            "只保留引用",
            "sensitive_field_paths",
        ):
            self.assertIn(keyword, content)

    def test_step_2_3_checkpoint_triggers_are_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 2.3 checkpoint 触发点", content)
        for keyword in (
            "阶段开始",
            "阶段完成",
            "等待审批",
            "等待外部输入",
            "进入副作用执行前",
            "恢复执行后",
            "--checkpoint <id>",
            "prepared",
            "dispatched",
        ):
            self.assertIn(keyword, content)

    def test_step_2_4_side_effect_lifecycle_is_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 2.4 side-effect ledger 生命周期", content)
        for keyword in (
            "prepared",
            "executing_side_effect checkpoint",
            "dispatched",
            "succeeded",
            "failed",
            "outcome_unknown",
            "写请求发出前",
        ):
            self.assertIn(keyword, content)

    def test_step_2_5_lock_dedupe_and_reconcile_baseline_is_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 2.5 锁、去重与对账基线", content)
        for keyword in (
            "run 级锁",
            "target 级锁",
            "dedupe index",
            "跨 run 冲突",
            "prepared",
            "dispatched",
            "reconcile",
            "confirmed_applied",
            "confirmed_not_applied",
            "still_unknown",
        ):
            self.assertIn(keyword, content)

    def test_file_catalog_mentions_task2_contract_test(self) -> None:
        content = read_architecture()
        self.assertIn("tests/test_task2_persistence_contract.py", content)


if __name__ == "__main__":
    unittest.main()
