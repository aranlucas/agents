from unittest.mock import Mock

import pytest
from grocery_agent import main, utils
from starlette.datastructures import Headers


class DummyRequest:
    def __init__(self, headers: dict[str, str]) -> None:
        self.headers = Headers(headers)


class DummyContext:
    def __init__(self, state: dict) -> None:
        self.state = state


@pytest.mark.asyncio
async def test_extract_kroger_auth_state_uses_temp_header_state() -> None:
    result = await main.extract_kroger_auth_state(
        DummyRequest({"x-kroger-access-token": "token-123"}),
        Mock(state={}),
    )
    assert result == {
        "user_id": "anonymous",
        "kroger_connected": True,
        "temp:kroger_token": "token-123",
    }


def test_meal_planner_header_provider_reads_temp_token() -> None:
    headers = utils._header_provider(DummyContext({"temp:kroger_token": "token-123"}))
    assert headers == {"Authorization": "Bearer token-123"}


def test_header_provider_falls_back_to_invocation_contextvar() -> None:
    from agents_shared.invocation_state import set_invocation_temp_state

    set_invocation_temp_state({"temp:kroger_token": "ctx-token"})
    headers = utils._header_provider(DummyContext({}))
    assert headers == {"Authorization": "Bearer ctx-token"}
    set_invocation_temp_state(None)


def test_on_before_agent_derives_kroger_connected_from_contextvar_token() -> None:
    from agents_shared.invocation_state import set_invocation_temp_state

    set_invocation_temp_state({"temp:kroger_token": "ctx-token"})
    ctx = DummyContext({})
    main.on_before_agent(ctx)
    assert ctx.state["kroger_connected"] is True
    set_invocation_temp_state(None)
