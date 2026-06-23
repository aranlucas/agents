from pathlib import Path

AGENT_IDS = {"oral-boards", "oral-boards-v2"}


def test_agent_eval_assets_are_local() -> None:
    agent_root = Path(__file__).resolve().parents[1]
    eval_dir = agent_root / "eval"

    assert (eval_dir / "eval_config.yaml").exists()
    datasets = {path.stem for path in (eval_dir / "datasets").glob("*.json")}
    assert datasets >= AGENT_IDS
