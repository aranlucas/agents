from types import SimpleNamespace
from unittest.mock import Mock

import grocery_agent.agent as agent
import grocery_agent.main as main
from agents_shared.plugins.slim_mcp import SlimMcpPlugin
from google.adk.tools.load_web_page import load_web_page
from grocery_agent.agent import build_agent, build_eval_agent
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


def test_agent_instruction_separates_shopping_list_from_live_cart() -> None:
    grocery_agent = build_agent()
    instruction = grocery_agent.instruction

    assert "shopping list is an unmaterialized cart" in instruction
    assert "cart is the live Kroger cart" in instruction
    assert "Never call `update_cart` before `add_to_cart` succeeds" in instruction
    assert (
        "Only say items were added to the cart after `add_to_cart` succeeds"
        in instruction
    )
    assert "Shopping List (not yet in live Kroger cart): {shopping_list}" in instruction
    assert "Live Kroger Cart (moved/added for checkout): {cart}" in instruction
    assert "ALWAYS build a proposed cart" not in instruction


def test_update_cart_docstring_describes_live_cart_only() -> None:
    assert update_cart.__doc__ is not None
    assert "live Kroger cart" in update_cart.__doc__
    assert "after `add_to_cart` succeeds" in update_cart.__doc__


def test_set_shopping_list_docstring_describes_unmaterialized_cart() -> None:
    assert set_shopping_list.__doc__ is not None
    assert "unmaterialized cart" in set_shopping_list.__doc__
    assert "does not change the live Kroger cart" in set_shopping_list.__doc__


def test_build_agent_includes_web_fetch_tool() -> None:
    grocery_agent = build_agent()
    assert load_web_page in grocery_agent.tools


def test_build_eval_agent_includes_kroger_stubs_for_connected_cases() -> None:
    grocery_agent = build_eval_agent()
    tool_names = {tool.name for tool in grocery_agent.tools if hasattr(tool, "name")}

    assert {
        "get_weekly_deals",
        "search_products",
        "get_product_details",
        "add_to_cart",
        "plan_meals",
    } <= tool_names


def test_build_agent_uses_app_plugin_for_web_search_throttling() -> None:
    grocery_agent = agent.build_agent()
    assert grocery_agent.before_tool_callback is None


def test_app_configures_kroger_and_web_search_plugins() -> None:
    from agents_shared.plugins.web_search_throttle import WebSearchThrottlePlugin

    assert [type(plugin) for plugin in main._app.plugins] == [
        SlimMcpPlugin,
        WebSearchThrottlePlugin,
    ]


def test_register_uses_app_with_configured_plugins(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_build_adk_agent_from_app(*args, **kwargs):
        captured["app"] = args[0]
        captured.update(kwargs)
        return object()

    def fake_add_agent_routes(*args, **kwargs):
        return None

    monkeypatch.setattr(main, "build_adk_agent_from_app", fake_build_adk_agent_from_app)
    monkeypatch.setattr(main, "add_agent_routes", fake_add_agent_routes)

    main.register(Mock(), Mock())

    assert captured["app"] is main._app
