import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
ARCHITECTURE_PATH = ROOT / "memory-bank" / "architecture.md"


def read_architecture() -> str:
    return ARCHITECTURE_PATH.read_text(encoding="utf-8")


class TaskSevenCliContractTest(unittest.TestCase):
    def test_step_7_1_cli_command_tree_is_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("## 9. 任务七冻结结果", content)
        self.assertIn("### 7.1 CLI 命令树冻结", content)
        for keyword in (
            "bind",
            "inspect",
            "run",
            "record",
            "命令树",
            "职责边界",
            "典型入口",
            "只负责一种类型的行为",
            "不与其他命令组重复",
            "用户可以从命令名称直接判断行为范围",
        ):
            self.assertIn(keyword, content)

    def test_step_7_2_bind_and_inspect_semantics_are_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 7.2 bind 与 inspect 语义冻结", content)
        for keyword in (
            "项目绑定",
            "连接器检查",
            "运行态检查",
            "配置查看",
            "图谱查看",
            "输入参数",
            "输出内容",
            "配置完整度",
            "连接器可用性",
            "在正式运行前确认配置问题",
        ):
            self.assertIn(keyword, content)

    def test_step_7_3_run_command_behaviors_are_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 7.3 run 命令行为冻结", content)
        for keyword in (
            "run start",
            "run brief",
            "run resume",
            "run status",
            "run approve",
            "run revise",
            "run reject",
            "run provide-artifact",
            "run provide-verification",
            "run preview-write",
            "run execute-write",
            "输入",
            "触发条件",
            "输出",
            "唯一命令入口",
            "不需要借助隐式操作或手工改文件",
        ):
            self.assertIn(keyword, content)

    def test_step_7_4_record_subworkflow_is_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 7.4 record 子工作流冻结", content)
        for keyword in (
            "仅生成 Requirement Brief",
            "仅回写 Jira",
            "仅写入飞书记录",
            "最小输入",
            "补录方式",
            "审批要求",
            "统一状态机",
            "统一 preview 机制",
            "统一审批规则",
            "快捷入口",
            "不是绕过工作流约束的后门",
        ):
            self.assertIn(keyword, content)

    def test_step_7_5_cli_output_contract_is_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 7.5 CLI 输出契约冻结", content)
        for keyword in (
            "TTY 输出",
            "JSON 输出",
            "错误输出",
            "status --json",
            "最小字段集合",
            "状态字段",
            "允许动作",
            "等待原因",
            "所需输入",
            "当前 preview 引用",
            "稳定输出",
            "不需要猜测内部状态",
        ):
            self.assertIn(keyword, content)

    def test_step_7_6_standard_demo_path_is_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 7.6 标准演示路径冻结", content)
        for keyword in (
            "bind -> inspect -> run -> approve/revise -> dry-run writeback -> real writeback -> export report",
            "配置",
            "分析",
            "审批",
            "补录",
            "预览",
            "执行",
            "报告导出",
            "单一",
            "可重复执行",
            "可验证",
            "v1 标准演示路径",
        ):
            self.assertIn(keyword, content)


if __name__ == "__main__":
    unittest.main()
