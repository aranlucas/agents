"""Contracts for the Agent Platform eval scaffold."""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
TYPES_FILE = ROOT / "packages/types/src/index.ts"
EVAL_DIR = ROOT / "tests/eval"
RUBRIC_GROUP = "agent_contract"


def _agent_order_and_backend_paths() -> tuple[list[str], dict[str, str]]:
    text = TYPES_FILE.read_text(encoding="utf-8")

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


def _agent_eval_groups() -> dict[str, list[str]]:
    agent_order, backend_paths = _agent_order_and_backend_paths()
    groups: dict[str, list[str]] = {}

    for agent_id in agent_order:
        backend_path = backend_paths[agent_id]
        agent_dir = backend_path.removesuffix("-v2")
        groups.setdefault(agent_dir, []).append(agent_id)

    return groups


def _eval_dir_for_agent(agent_dir: str) -> Path:
    return ROOT / "agents" / agent_dir / "eval"


def _dataset_path(agent_id: str) -> Path:
    for agent_dir, agent_ids in _agent_eval_groups().items():
        if agent_id in agent_ids:
            return _eval_dir_for_agent(agent_dir) / "datasets" / f"{agent_id}.json"
    raise AssertionError(f"Unknown registered agent: {agent_id}")


def _load_dataset(agent_id: str) -> dict:
    path = _dataset_path(agent_id)
    assert path.exists(), f"Missing eval dataset for {agent_id}: {path}"
    return json.loads(path.read_text(encoding="utf-8"))


def test_eval_config_selects_agent_quality_metrics() -> None:
    assert not EVAL_DIR.exists(), "Eval assets should live under agents/<agent>/eval"

    for agent_dir in _agent_eval_groups():
        config = _eval_dir_for_agent(agent_dir) / "eval_config.yaml"
        assert config.exists(), f"Missing eval config for {agent_dir}: {config}"
        text = config.read_text(encoding="utf-8")

        for metric in (
            "multi_turn_task_success",
            "final_response_quality",
            "safety",
            "project_agent_contract",
        ):
            assert f"- {metric}" in text


def test_every_registered_agent_has_eval_dataset() -> None:
    agent_order, backend_paths = _agent_order_and_backend_paths()
    groups = _agent_eval_groups()

    assert agent_order
    for agent_dir, agent_ids in groups.items():
        agent_root = ROOT / "agents" / agent_dir
        assert agent_root.exists(), f"Missing agent directory for {agent_dir}"
        assert (agent_root / "tests").exists(), f"Missing tests directory for {agent_dir}"

        datasets_dir = _eval_dir_for_agent(agent_dir) / "datasets"
        assert datasets_dir.exists(), f"Missing eval datasets directory for {agent_dir}"
        available = {path.stem for path in datasets_dir.glob("*.json")}
        assert set(agent_ids) <= available

    assert set(agent_order) == set(backend_paths)


def test_eval_datasets_are_generate_ready() -> None:
    agent_order, backend_paths = _agent_order_and_backend_paths()

    for agent_id in agent_order:
        dataset = _load_dataset(agent_id)
        cases = dataset.get("eval_cases")
        assert isinstance(cases, list), f"{agent_id} eval_cases must be a list"
        assert cases, f"{agent_id} needs at least one eval case"

        for case in cases:
            metadata = case.get("metadata")
            assert metadata == {
                "agent_id": agent_id,
                "backend_path": backend_paths[agent_id],
            }

            assert case.get("eval_case_id", "").startswith(
                agent_id.replace("-", "_")
            )

            prompt = case.get("prompt")
            assert prompt is not None, f"{agent_id} case must be inference-ready"
            assert prompt.get("role") == "user"
            parts = prompt.get("parts")
            assert isinstance(parts, list) and parts
            assert all(isinstance(part.get("text"), str) for part in parts)
            assert all(part["text"].strip() for part in parts)

            rubric_groups = case.get("rubric_groups")
            assert isinstance(rubric_groups, dict)
            rubrics = rubric_groups[RUBRIC_GROUP]["rubrics"]
            assert len(rubrics) >= 3
            for rubric in rubrics:
                description = rubric["content"]["property"]["description"]
                assert isinstance(description, str)
                assert description.strip()
