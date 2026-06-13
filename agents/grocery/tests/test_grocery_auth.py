import pytest
from agents_shared.invocation_state import set_invocation_temp_state
from agents_shared.state import KROGER_AUTH, make_extract_state, make_state_initializer
from grocery_agent import toolsets
from grocery_agent.agent import GroceryState
from starlette.datastructures import Headers


class DummyRequest:
    def __init__(self, headers: dict[str, str]) -> None:
        self.headers = Headers(headers)


class DummyContext:
    def __init__(self, state: dict) -> None:
        self.state = state


@pytest.mark.asyncio
async def test_extract_kroger_auth_state_uses_temp_header_state() -> None:
    extract = make_extract_state(KROGER_AUTH)
    result = await extract(
        DummyRequest({"x-kroger-access-token": "token-123"}),
        None,
    )
    assert result == {
        "user_id": "anonymous",
        "kroger_connected": True,
        "temp:kroger_token": "token-123",
    }


def test_meal_planner_header_provider_reads_temp_token() -> None:
    headers = toolsets._header_provider(DummyContext({"temp:kroger_token": "token-123"}))
    assert headers == {"Authorization": "Bearer token-123"}


def test_header_provider_falls_back_to_invocation_contextvar() -> None:
    set_invocation_temp_state({"temp:kroger_token": "ctx-token"})
    headers = toolsets._header_provider(DummyContext({}))
    assert headers == {"Authorization": "Bearer ctx-token"}
    set_invocation_temp_state(None)


def test_on_before_agent_derives_kroger_connected_from_contextvar_token() -> None:
    set_invocation_temp_state({"temp:kroger_token": "ctx-token"})
    ctx = DummyContext({})
    initializer = make_state_initializer(
        GroceryState, token_flags={KROGER_AUTH.state_key: KROGER_AUTH.connected_flag}
    )
    initializer(ctx)
    assert ctx.state["kroger_connected"] is True
    set_invocation_temp_state(None)
