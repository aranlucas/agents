from types import SimpleNamespace

from grocery_agent import main


def test_grocery_state_tools_write_canvas_state() -> None:
    context = SimpleNamespace(state={})

    assert main.set_shopping_list(context, ["eggs", "milk"], notes="Use coupons") == {
        "ok": True,
        "count": 2,
    }
    assert context.state["shopping_list"] == ["eggs", "milk"]
    assert context.state["notes"] == "Use coupons"
    assert context.state["status"] == "planning"

    cart = [{"name": "eggs", "quantity": 1, "price": 4.99, "upc": "123"}]
    assert main.update_cart(context, cart) == {"ok": True, "count": 1}
    assert context.state["cart"] == cart

    pantry = [{"name": "rice", "quantity": "1 bag"}]
    assert main.update_pantry(context, pantry) == {"ok": True}
    assert context.state["pantry"] == pantry

    assert main.set_meal_plan(context, "## Monday") == {"ok": True, "length": 9}
    assert context.state["meal_plan"] == "## Monday"

    assert main.set_weekly_deals(context, "Apples") == {"ok": True}
    assert context.state["weekly_deals"] == "Apples"

    assert main.mark_list_ready(context, "Ready to shop") == {"ok": True}
    assert context.state["status"] == "ready"
    assert context.state["review_summary"] == "Ready to shop"


def test_before_model_modifier_injects_auth_gate_notice() -> None:
    request = SimpleNamespace(config=SimpleNamespace(system_instruction="Original"))
    callback_context = SimpleNamespace(state={})
    assert main.before_model_modifier(callback_context, request) is None
    assert "KROGER NOT CONNECTED" in request.config.system_instruction
    assert "Original" in request.config.system_instruction


def test_before_model_modifier_omits_auth_gate_when_connected() -> None:
    request = SimpleNamespace(config=SimpleNamespace(system_instruction="Original"))
    callback_context = SimpleNamespace(state={"kroger_connected": True})
    main.before_model_modifier(callback_context, request)
    assert "KROGER NOT CONNECTED" not in request.config.system_instruction


def test_on_before_agent_preserves_existing_state_and_adds_defaults() -> None:
    callback_context = SimpleNamespace(state={"shopping_list": ["existing"]})
    main.on_before_agent(callback_context)
    assert callback_context.state["shopping_list"] == ["existing"]
    assert callback_context.state["status"] == "idle"
    assert callback_context.state["kroger_connected"] is False
