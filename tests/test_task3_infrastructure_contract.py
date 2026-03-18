import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
ARCHITECTURE_PATH = ROOT / "memory-bank" / "architecture.md"


def read_architecture() -> str:
    return ARCHITECTURE_PATH.read_text(encoding="utf-8")


class TaskThreeInfrastructureContractTest(unittest.TestCase):
    def test_step_3_1_capability_interface_catalog_is_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("## 5. 任务三冻结结果", content)
        self.assertIn("### 3.1 能力接口清单冻结", content)
        for keyword in (
            "HealthCheckCapability",
            "ReaderCapability",
            "TargetResolverCapability",
            "PreviewWriterCapability",
            "SideEffectExecutorCapability",
            "ArtifactResolverCapability",
            "RepoWorkspaceCapability",
            "读取",
            "目标解析",
            "preview",
            "执行",
            "副作用对账",
            "仓库只读访问",
        ):
            self.assertIn(keyword, content)

    def test_step_3_2_jira_read_contract_is_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 3.2 Jira 只读契约冻结", content)
        for keyword in (
            "issue_key",
            "issue_type_id",
            "status",
            "summary",
            "description",
            "labels",
            "requirement_link_rules",
            "issue_link",
            "custom_field",
            "text_pattern",
            "writeback_targets",
            "invalid_input",
            "permission_denied",
            "authentication_failed",
        ):
            self.assertIn(keyword, content)

    def test_step_3_3_gitlab_read_contract_is_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 3.3 GitLab 只读契约冻结", content)
        for keyword in (
            "commit",
            "branch",
            "MR",
            "commit_sha",
            "branch_name",
            "mr_iid",
            "project_id",
            "default_branch",
            "web_url",
            "artifact_url",
            "统一结构",
            "Jira 回写",
            "报告导出",
        ):
            self.assertIn(keyword, content)

    def test_step_3_4_feishu_and_repo_read_contracts_are_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 3.4 Feishu 与本地仓库只读契约冻结", content)
        for keyword in (
            "space_id",
            "doc_id",
            "block_path_or_anchor",
            "template_id",
            "template_version",
            "target_block_id",
            "repo.local_path",
            "module_rules",
            "candidate_modules",
            "code search",
            "preview 生成",
            "代码定位分析",
        ):
            self.assertIn(keyword, content)

    def test_step_3_5_connector_registry_routing_is_frozen(self) -> None:
        content = read_architecture()
        self.assertIn("### 3.5 connector registry 与路由规则冻结", content)
        for keyword in (
            "ProjectProfile",
            "capability",
            "connector registry",
            "resolveConnector",
            "platform_key",
            "ReaderCapability",
            "TargetResolverCapability",
            "workflow 不直接依赖具体平台实现",
            "同一项目",
            "不同阶段",
            "一致",
        ):
            self.assertIn(keyword, content)


if __name__ == "__main__":
    unittest.main()
