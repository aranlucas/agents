"""Contracts for the Agent Platform eval scaffold."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SHARED_EVAL_CONFIG = ROOT / "agents/eval/eval_config.yaml"
RUBRIC_GROUP = "agent_contract"


def _agent_order_and_backend_paths() -> tuple[list[str], dict[str, str]]:
    text = (ROOT / "packages/types/src/index.ts").read_text(encoding="utf-8")

    order_match = re.search(
        r"export const AGENT_ORDER = \[(?P<body>.*?)\] as const;",
        text,
        re.DOTALL,
    )
    assert order_match is not None
    agent_order = re.findall(r'"([^"]+)"', order_match.group("body"))

    backend_match = re.search(
        r"export const AGENT_BACKEND_PATHS = \{(?P<body>.*?)\} as const",
        text,
        re.DOTALL,
    )
    assert backend_match is not None
    backend_paths = {
        key: value
        for key, value in re.findall(
            r'"?([\w-]+)"?:\s*"([^"]+)"', backend_match.group("body")
        )
    }

    return agent_order, backend_paths


def _agent_dir_for_backend_path(backend_path: str) -> str:
    """Map backend_path to agents/<dir> (oralboards-v2 → oralboards)."""
    return backend_path.removesuffix("-v2")


def _dataset_path(agent_id: str, backend_path: str) -> Path:
    """Colocated dataset: agents/<dir>/tests/eval/<agent_id>.json."""
    agent_dir = _agent_dir_for_backend_path(backend_path)
    return ROOT / "agents" / agent_dir / "tests" / "eval" / f"{agent_id}.json"


def _agents_with_eval_datasets() -> list[tuple[str, str]]:
    """Return (agent_id, backend_path) pairs that have colocated eval datasets."""
    agent_order, backend_paths = _agent_order_and_backend_paths()
    return [
        (agent_id, backend_paths[agent_id])
        for agent_id in agent_order
        if _dataset_path(agent_id, backend_paths[agent_id]).exists()
    ]


def test_shared_eval_config_exists_and_has_required_metrics() -> None:
    assert SHARED_EVAL_CONFIG.exists(), (
        f"Missing shared eval config: {SHARED_EVAL_CONFIG}"
    )
    text = SHARED_EVAL_CONFIG.read_text(encoding="utf-8")

    for metric in (
        "task_success",
        "response_quality",
        "project_agent_contract",
    ):
        assert f"- {metric}" in text, f"Metric '{metric}' missing from eval_config.yaml"


def test_every_registered_agent_with_eval_has_dataset() -> None:
    """Agents that have a tests/eval/ directory must have a dataset for each registered ID."""
    agent_order, backend_paths = _agent_order_and_backend_paths()
    assert agent_order

    for agent_id in agent_order:
        backend_path = backend_paths[agent_id]
        agent_dir = _agent_dir_for_backend_path(backend_path)
        agent_root = ROOT / "agents" / agent_dir
        eval_dir = agent_root / "tests" / "eval"

        if not eval_dir.exists():
            continue  # eval not yet scaffolded for this agent

        expected = _dataset_path(agent_id, backend_path)
        assert expected.exists(), (
            f"eval dir exists for {agent_dir} but missing dataset for {agent_id}: {expected}"
        )


def test_eval_datasets_are_generate_ready() -> None:
    agent_order, backend_paths = _agent_order_and_backend_paths()

    for agent_id, backend_path in _agents_with_eval_datasets():
        dataset = json.loads(
            _dataset_path(agent_id, backend_path).read_text(encoding="utf-8")
        )
        cases = dataset.get("eval_cases")
        assert isinstance(cases, list), f"{agent_id} eval_cases must be a list"
        assert cases, f"{agent_id} needs at least one eval case"

        for case in cases:
            metadata = case.get("metadata")
            assert metadata == {
                "agent_id": agent_id,
                "backend_path": backend_paths[agent_id],
            }, f"{agent_id} metadata mismatch: {metadata}"

            assert case.get("eval_case_id", "").startswith(
                agent_id.replace("-", "_")
            ), f"{agent_id} eval_case_id must start with '{agent_id.replace('-', '_')}'"

            prompt = case.get("prompt")
            assert prompt is not None, f"{agent_id} case must be inference-ready"
            assert prompt.get("role") == "user"
            parts = prompt.get("parts")
            assert isinstance(parts, list) and parts
            assert all(isinstance(part.get("text"), str) for part in parts)
            assert all(part["text"].strip() for part in parts)

            rubric_groups = case.get("rubric_groups")
            assert isinstance(rubric_groups, dict), (
                f"{agent_id} must have rubric_groups"
            )
            rubrics = rubric_groups[RUBRIC_GROUP]["rubrics"]
            assert len(rubrics) >= 3, f"{agent_id} needs at least 3 rubrics"
            for rubric in rubrics:
                description = rubric["content"]["property"]["description"]
                assert isinstance(description, str)
                assert description.strip()
