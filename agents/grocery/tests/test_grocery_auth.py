from unittest.mock import Mock

import main
import pytest
import utils
from starlette.datastructures import Headers


class DummyRequest:
    def __init__(self, headers: dict[str, str]):
        self.headers = Headers(headers)


class DummyContext:
    def __init__(self, state: dict):
        self.state = state


@pytest.mark.asyncio
async def test_extract_kroger_auth_state_uses_temp_header_state():
    result = await main.extract_kroger_auth_state(
        DummyRequest({"x-kroger-access-token": "token-123"}),
        Mock(state={}),
    )

    assert result == {
        "user_id": "anonymous",
        "kroger_connected": True,
        "temp:kroger_token": "token-123",
    }


def test_meal_planner_header_provider_reads_temp_token():
    headers = utils._header_provider(DummyContext({"temp:kroger_token": "token-123"}))

    assert headers == {"Authorization": "Bearer token-123"}


def test_on_before_agent_hydrates_a2a_kroger_metadata():
    callback_context = Mock()
    callback_context.state = {}
    callback_context._invocation_context.run_config.custom_metadata = {
        "a2a_metadata": {
            "user_id": "user_123",
            "kroger_access_token": "token-123",
        }
    }

    main.on_before_agent(callback_context)

    assert callback_context.state["user_id"] == "user_123"
    assert callback_context.state["kroger_connected"] is True
    assert callback_context.state["temp:kroger_token"] == "token-123"
