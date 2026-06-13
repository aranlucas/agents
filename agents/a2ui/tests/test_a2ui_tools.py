from types import SimpleNamespace

from a2ui_agent import agent


def test_remember_surface_writes_state() -> None:
    context = SimpleNamespace(state={})
    assert agent.remember_surface(context, "A status board", "launch-readiness") == {
        "ok": True,
        "surface_name": "launch-readiness",
    }
    assert context.state == {
        "status": "ready",
        "surface_brief": "A status board",
        "last_surface": "launch-readiness",
    }


def test_a2ui_state_defaults() -> None:
    state = agent.A2UIState()
    assert state.status == "idle"
    assert state.surface_brief == ""
    assert state.last_surface == ""
    assert state.user_id == ""


def test_agent_instruction_uses_adk_state_placeholders() -> None:
    a2ui_agent = agent.build_agent()
    instruction = a2ui_agent.instruction

    assert isinstance(instruction, str)
    assert "Current A2UI showcase state:" in instruction
    assert "{status}" in instruction
    assert "{surface_brief}" in instruction
    assert "{last_surface}" in instruction
    assert "{user_id}" in instruction
