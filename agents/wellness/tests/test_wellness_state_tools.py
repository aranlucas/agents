from types import SimpleNamespace

from google.adk.tools.agent_tool import AgentTool
from wellness_agent.agent import WellnessState, build_agent
from wellness_agent.tools.mark_plan_ready import mark_plan_ready
from wellness_agent.tools.set_weekly_wellness_plan import set_weekly_wellness_plan


def test_wellness_tools_write_state() -> None:
    context = SimpleNamespace(state={})
    assert set_weekly_wellness_plan(context, "## Week") == {
        "ok": True,
        "length": 7,
    }
    assert context.state["weekly_plan"] == "## Week"
    assert context.state["status"] == "planning"

    assert mark_plan_ready(context, "Ready") == {"ok": True}
    assert context.state["status"] == "ready"
    assert context.state["review_summary"] == "Ready"


def test_wellness_state_defaults() -> None:
    state = WellnessState()
    assert state.status == "idle"
    assert state.kroger_connected is False
    assert state.strava_connected is False
    assert state.weekly_plan == ""
    assert state.shopping_list == []
    assert state.activities == []


def test_build_agent_returns_fresh_instances() -> None:
    a = build_agent()
    b = build_agent()
    assert a is not b


def test_build_agent_sub_agents_task_mode() -> None:
    agent = build_agent()
    sub_agent_names = [sa.name for sa in agent.sub_agents]
    assert sub_agent_names == ["fitness_agent", "grocery_agent"]
    assert all(sa.mode == "task" for sa in agent.sub_agents)
    assert not any(type(tool) is AgentTool for tool in agent.tools)


def test_agent_instruction_uses_adk_state_placeholders() -> None:
    agent = build_agent()
    instruction = agent.instruction

    assert isinstance(instruction, str)
    assert "Current wellness state:" in instruction
    assert "{kroger_connected}" in instruction
    assert "{strava_connected}" in instruction
    assert "{training_plan}" in instruction
    assert "{meal_plan}" in instruction
    assert "{weekly_plan}" in instruction


def test_agent_instruction_defines_grocery_list_vs_live_cart() -> None:
    agent = build_agent()
    instruction = agent.instruction

    assert "shopping_list is an unmaterialized cart" in instruction
    assert "cart is the live Kroger cart" in instruction
    assert "Do not describe shopping_list items as being in the cart" in instruction
    assert "Shopping List (not yet in live Kroger cart): {shopping_list}" in instruction
    assert "Live Kroger Cart (moved/added for checkout): {cart}" in instruction
