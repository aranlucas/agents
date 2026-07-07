import json
from pathlib import Path

AGENT_IDS = {"grocery"}


def _load_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def test_agent_eval_assets_are_local() -> None:
    agent_root = Path(__file__).resolve().parents[1]
    eval_dir = agent_root / "eval"

    assert (eval_dir / "eval_config.yaml").exists()
    datasets = {path.stem for path in (eval_dir / "datasets").glob("*.json")}
    assert datasets >= AGENT_IDS


def test_grocery_eval_assets_cover_list_vs_live_cart_contract() -> None:
    agent_root = Path(__file__).resolve().parents[1]

    train_eval = _load_json(
        agent_root / "src/grocery_agent/train_eval_set.evalset.json"
    )
    train_ids = {case["eval_id"] for case in train_eval["eval_cases"]}
    assert train_ids >= {
        "grocery_shopping_list_not_live_cart",
        "grocery_direct_cart_request_updates_live_cart",
    }

    dataset = _load_json(agent_root / "eval/datasets/grocery.json")
    cases = {case["eval_case_id"]: case for case in dataset["eval_cases"]}
    assert cases.keys() >= {
        "grocery_list_vs_live_cart_explanation",
        "grocery_cart_success_language_contract",
    }

    list_rubrics = json.dumps(
        cases["grocery_list_vs_live_cart_explanation"]["rubric_groups"]
    )
    assert "shopping list is an unmaterialized cart" in list_rubrics
    assert "does not call add_to_cart or update_cart" in list_rubrics

    cart_rubrics = json.dumps(
        cases["grocery_cart_success_language_contract"]["rubric_groups"]
    )
    assert "cart is the live Kroger cart" in cart_rubrics
    assert "Only says items were added to the cart after add_to_cart succeeds" in (
        cart_rubrics
    )


def test_new_grocery_agents_cli_evals_are_agent_local_only() -> None:
    agent_root = Path(__file__).resolve().parents[1]
    legacy_dataset = _load_json(agent_root / "tests/eval/grocery.json")
    legacy_case_ids = {case["eval_case_id"] for case in legacy_dataset["eval_cases"]}

    assert "grocery_list_vs_live_cart_explanation" not in legacy_case_ids
    assert "grocery_cart_success_language_contract" not in legacy_case_ids


def test_grocery_train_eval_gold_avoids_internal_tool_names() -> None:
    agent_root = Path(__file__).resolve().parents[1]
    train_eval = _load_json(
        agent_root / "src/grocery_agent/train_eval_set.evalset.json"
    )

    for case in train_eval["eval_cases"]:
        for turn in case["conversation"]:
            final_response = " ".join(
                part["text"] for part in turn["final_response"]["parts"]
            )
            assert "add_to_cart" not in final_response
