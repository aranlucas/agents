from types import SimpleNamespace
from unittest.mock import Mock

import grocery_agent.agent as agent
import grocery_agent.main as main
from agents_shared.plugins.slim_mcp import SlimMcpPlugin
from google.adk.tools.load_web_page import load_web_page
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
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


def test_build_agent_includes_web_fetch_tool() -> None:
    grocery_agent = build_agent()
    assert load_web_page in grocery_agent.tools


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


def test_web_search_toolset_uses_npx_when_binary_absent(monkeypatch) -> None:
    import grocery_agent.tools.search as _search_mod

    monkeypatch.setenv("BRAVE_API_KEY", "brave-token")
    monkeypatch.setattr(_search_mod.shutil, "which", lambda _: None)
    from grocery_agent.tools.search import web_search_toolset

    toolset = web_search_toolset()
    params = toolset._connection_params
    assert isinstance(params, StdioConnectionParams)
    assert params.timeout == 30.0
    assert params.server_params.command == "npx"
    assert params.server_params.args == [
        "-y",
        "@brave/brave-search-mcp-server",
        "--brave-api-key",
        "brave-token",
    ]
    assert params.server_params.env == {"BRAVE_API_KEY": "brave-token"}
    assert toolset._use_mcp_resources is False


def test_web_search_toolset_uses_binary_when_installed(monkeypatch) -> None:
    import grocery_agent.tools.search as _search_mod

    monkeypatch.setenv("BRAVE_API_KEY", "brave-token")
    monkeypatch.setattr(
        _search_mod.shutil, "which", lambda name: f"/usr/local/bin/{name}"
    )
    from grocery_agent.tools.search import web_search_toolset

    toolset = web_search_toolset()
    params = toolset._connection_params
    assert isinstance(params, StdioConnectionParams)
    assert params.timeout == 30.0
    assert params.server_params.command == "brave-search-mcp-server"
    assert params.server_params.args == ["--brave-api-key", "brave-token"]
    assert params.server_params.env == {"BRAVE_API_KEY": "brave-token"}
    assert toolset._use_mcp_resources is False
