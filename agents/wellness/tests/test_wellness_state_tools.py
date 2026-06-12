from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from agents_shared.invocation_state import (
    get_invocation_temp,
    set_invocation_temp_state,
)
from starlette.datastructures import Headers
from wellness_agent import main


class DummyRequest:
    def __init__(self, headers: dict[str, str]) -> None:
        self.headers = Headers(headers)


def test_extract_identity_state_reads_user_and_auth_tokens() -> None:
    result = main.extract_identity_state(
        DummyRequest(
            {
                "x-clerk-user-id": "user_123",
                "x-kroger-access-token": "kroger",
                "x-strava-access-token": "strava",
            },
        ),
    )
    assert result == {
        "user_id": "user_123",
        "temp:kroger_token": "kroger",
        "kroger_connected": True,
        "temp:strava_token": "strava",
        "strava_connected": True,
    }


@pytest.mark.asyncio
async def test_extract_wellness_state_delegates_to_identity_reader() -> None:
    assert await main.extract_wellness_state(DummyRequest({}), object()) == {
        "user_id": "anonymous",
    }


def test_wellness_tools_write_state() -> None:
    context = SimpleNamespace(state={})
    assert main.set_weekly_wellness_plan(context, "## Week") == {
        "ok": True,
        "length": 7,
    }
    assert context.state["weekly_plan"] == "## Week"
    assert context.state["status"] == "planning"

    assert main.mark_plan_ready(context, "Ready") == {"ok": True}
    assert context.state["status"] == "ready"
    assert context.state["review_summary"] == "Ready"


def test_before_model_modifier_prefixes_current_state() -> None:
    request = SimpleNamespace(config=SimpleNamespace(system_instruction="Original"))
    callback_context = SimpleNamespace(state={"weekly_plan": "Plan"})
    assert main.before_model_modifier(callback_context, request) is None
    assert request.config.system_instruction.startswith("Current wellness state:")
    assert "Original" in request.config.system_instruction


def test_on_before_agent_adds_defaults() -> None:
    callback_context = SimpleNamespace(state={"status": "planning"})
    main.on_before_agent(callback_context)
    assert callback_context.state["status"] == "planning"
    assert callback_context.state["meal_plan"] == ""
    assert callback_context.state["weekly_plan"] == ""


def test_temp_state_session_service_captures_temp_keys() -> None:
    set_invocation_temp_state(None)
    session = SimpleNamespace(state={"temp:kroger_token": "kroger", "user_id": "user"})
    service = main._TempStateSessionService(object())
    assert service._inject(session, "abc") is session
    assert get_invocation_temp("temp:kroger_token", {}) == "kroger"
    set_invocation_temp_state(None)


@pytest.mark.asyncio
async def test_trace_requests_skips_health_path() -> None:
    request = SimpleNamespace(url=SimpleNamespace(path="/health"))
    response = object()
    call_next = AsyncMock(return_value=response)
    assert await main.trace_requests(request, call_next) is response
