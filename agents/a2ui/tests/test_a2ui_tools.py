from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from a2ui_agent import main
from starlette.datastructures import Headers


class DummyRequest:
    def __init__(self, headers: dict[str, str]) -> None:
        self.headers = Headers(headers)


@pytest.mark.asyncio
async def test_extract_demo_state_reads_user_header() -> None:
    assert await main.extract_demo_state(
        DummyRequest({"x-clerk-user-id": "user_123"}),
        object(),
    ) == {"user_id": "user_123"}
    assert await main.extract_demo_state(DummyRequest({}), object()) == {
        "user_id": "anonymous",
    }


def test_before_model_modifier_prefixes_current_state() -> None:
    request = SimpleNamespace(config=SimpleNamespace(system_instruction="Original"))
    callback_context = SimpleNamespace(state={"surface_brief": "Dashboard"})
    assert main.before_model_modifier(callback_context, request) is None
    assert request.config.system_instruction.startswith("Current A2UI showcase state:")
    assert "Dashboard" in request.config.system_instruction
    assert "Original" in request.config.system_instruction


def test_on_before_agent_adds_default_state(monkeypatch) -> None:
    monkeypatch.setattr(main, "apply_a2a_auth_metadata_to_state", lambda _context: {})
    callback_context = SimpleNamespace(state={"status": "ready"})
    main.on_before_agent(callback_context)
    assert callback_context.state["status"] == "ready"
    assert callback_context.state["surface_brief"] == ""
    assert callback_context.state["last_surface"] == ""


def test_remember_surface_writes_state() -> None:
    context = SimpleNamespace(state={})
    assert main.remember_surface(context, "A status board", "launch-readiness") == {
        "ok": True,
        "surface_name": "launch-readiness",
    }
    assert context.state == {
        "status": "ready",
        "surface_brief": "A status board",
        "last_surface": "launch-readiness",
    }


@pytest.mark.asyncio
async def test_trace_requests_skips_health_path() -> None:
    request = SimpleNamespace(url=SimpleNamespace(path="/health"))
    response = object()
    call_next = AsyncMock(return_value=response)
    assert await main.trace_requests(request, call_next) is response
