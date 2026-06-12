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
