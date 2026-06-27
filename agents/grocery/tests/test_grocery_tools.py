from types import SimpleNamespace

from grocery_agent.agent import build_agent
from grocery_agent.tools.mark_list_ready import mark_list_ready
from grocery_agent.tools.set_meal_plan import set_meal_plan
from grocery_agent.tools.set_shopping_list import set_shopping_list
from grocery_agent.tools.set_weekly_deals import set_weekly_deals
from grocery_agent.tools.update_cart import update_cart
from grocery_agent.tools.update_pantry import update_pantry


def test_grocery_state_tools_write_canvas_state() -> None:
    context = SimpleNamespace(state={})

    assert set_shopping_list(context, ["eggs", "milk"], notes="Use coupons") == {
        "ok": True,
        "count": 2,
    }
    assert context.state["shopping_list"] == ["eggs", "milk"]
    assert context.state["notes"] == "Use coupons"
    assert context.state["status"] == "planning"

    cart = [{"name": "eggs", "quantity": 1, "price": 4.99, "upc": "123"}]
    assert update_cart(context, cart) == {"ok": True, "count": 1}
    assert context.state["cart"] == cart

    pantry = [{"name": "rice", "quantity": "1 bag"}]
    assert update_pantry(context, pantry) == {"ok": True}
    assert context.state["pantry"] == pantry

    assert set_meal_plan(context, "## Monday") == {"ok": True, "length": 9}
    assert context.state["meal_plan"] == "## Monday"

    assert set_weekly_deals(context, "Apples") == {"ok": True}
    assert context.state["weekly_deals"] == "Apples"

    assert mark_list_ready(context, "Ready to shop") == {"ok": True}
    assert context.state["status"] == "ready"
    assert context.state["review_summary"] == "Ready to shop"


def test_agent_instruction_uses_adk_state_placeholders() -> None:
    grocery_agent = build_agent()
    instruction = grocery_agent.instruction

    assert isinstance(instruction, str)
    assert "Current grocery state:" in instruction
    assert "{kroger_connected}" in instruction
    assert "{shopping_list}" in instruction
    assert "{meal_plan}" in instruction
    assert "{cart}" in instruction
    assert "{training_plan}" in instruction
