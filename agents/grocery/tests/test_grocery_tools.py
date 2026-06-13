from types import SimpleNamespace

from grocery_agent import agent


def test_grocery_state_tools_write_canvas_state() -> None:
    context = SimpleNamespace(state={})

    assert agent.set_shopping_list(context, ["eggs", "milk"], notes="Use coupons") == {
        "ok": True,
        "count": 2,
    }
    assert context.state["shopping_list"] == ["eggs", "milk"]
    assert context.state["notes"] == "Use coupons"
    assert context.state["status"] == "planning"

    cart = [{"name": "eggs", "quantity": 1, "price": 4.99, "upc": "123"}]
    assert agent.update_cart(context, cart) == {"ok": True, "count": 1}
    assert context.state["cart"] == cart

    pantry = [{"name": "rice", "quantity": "1 bag"}]
    assert agent.update_pantry(context, pantry) == {"ok": True}
    assert context.state["pantry"] == pantry

    assert agent.set_meal_plan(context, "## Monday") == {"ok": True, "length": 9}
    assert context.state["meal_plan"] == "## Monday"

    assert agent.set_weekly_deals(context, "Apples") == {"ok": True}
    assert context.state["weekly_deals"] == "Apples"

    assert agent.mark_list_ready(context, "Ready to shop") == {"ok": True}
    assert context.state["status"] == "ready"
    assert context.state["review_summary"] == "Ready to shop"


def test_agent_instruction_uses_adk_state_placeholders() -> None:
    grocery_agent = agent.build_agent()
    instruction = grocery_agent.instruction

    assert isinstance(instruction, str)
    assert "Current grocery state:" in instruction
    assert "{kroger_connected}" in instruction
    assert "{shopping_list}" in instruction
    assert "{meal_plan}" in instruction
    assert "{cart}" in instruction
    assert "{training_plan}" in instruction
    assert "If `kroger_connected` is False" in instruction
    assert not hasattr(agent, "_kroger_notice")
