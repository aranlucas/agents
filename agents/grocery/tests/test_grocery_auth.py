from unittest.mock import Mock

import main
import utils
import pytest
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
        "kroger_connected": True,
        "temp:kroger_token": "token-123",
    }


def test_meal_planner_header_provider_reads_temp_token():
    headers = utils._header_provider(
        DummyContext({"temp:kroger_token": "token-123"})
    )

    assert headers == {"Authorization": "Bearer token-123"}
