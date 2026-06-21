"""Contracts for the Agent Platform eval scaffold.

The eval datasets live outside pytest's default testpaths so this test keeps
them tied to the mounted/web-visible agent registry.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
TYPES_FILE = ROOT / "packages/types/src/index.ts"
EVAL_DIR = ROOT / "tests/eval"
DATASETS_DIR = EVAL_DIR / "datasets"
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


def _dataset_path(agent_id: str) -> Path:
    return DATASETS_DIR / f"{agent_id}.json"


def _load_dataset(agent_id: str) -> dict:
    path = _dataset_path(agent_id)
    assert path.exists(), f"Missing eval dataset for {agent_id}: {path}"
    return json.loads(path.read_text(encoding="utf-8"))


def test_eval_config_selects_agent_quality_metrics() -> None:
    config = EVAL_DIR / "eval_config.yaml"
    assert config.exists()
    text = config.read_text(encoding="utf-8")

    for metric in (
        "multi_turn_task_success",
        "final_response_quality",
        "safety",
        "project_agent_contract",
    ):
        assert f"- {metric}" in text


def test_every_registered_agent_has_eval_dataset() -> None:
    agent_order, _ = _agent_order_and_backend_paths()

    assert agent_order
    assert sorted(path.stem for path in DATASETS_DIR.glob("*.json")) == sorted(
        agent_order
    )


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
