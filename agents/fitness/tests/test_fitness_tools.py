from unittest.mock import Mock

import main
import pytest
import utils
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from starlette.datastructures import Headers


class DummyToolContext:
    def __init__(self, state: dict | None = None):
        self.state = state or {}


class DummyRequest:
    def __init__(self, headers: dict[str, str]):
        self.headers = Headers(headers)


def test_normalize_activity_keeps_training_fields():
    activity = main.normalize_strava_activity(
        {
            "id": 123,
            "name": "Hill repeats",
            "sport_type": "Run",
            "start_date": "2026-05-24T15:00:00Z",
            "distance": 8046.7,
            "moving_time": 2700,
            "elapsed_time": 3000,
            "total_elevation_gain": 420.5,
            "average_heartrate": 146.2,
            "perceived_exertion": 7,
        }
    )

    assert activity == {
        "id": "123",
        "name": "Hill repeats",
        "sport_type": "Run",
        "start_date": "2026-05-24T15:00:00Z",
        "distance_m": 8046.7,
        "moving_time_s": 2700,
        "elapsed_time_s": 3000,
        "total_elevation_gain_m": 420.5,
        "average_heartrate": 146.2,
        "perceived_effort": 7,
    }


@pytest.mark.asyncio
async def test_fetch_activities_requires_connected_strava():
    context = DummyToolContext({"strava_connected": False})

    result = await main.fetch_activities(context)

    assert result == {
        "ok": False,
        "reason": "strava_not_connected",
        "message": "Connect Strava before syncing activities.",
    }
    assert context.state["status"] == "idle"


@pytest.mark.asyncio
async def test_extract_strava_auth_state_uses_temp_header_state():
    result = await main.extract_strava_auth_state(
        DummyRequest({"x-strava-access-token": "token-123"}),
        Mock(state={}),
    )

    assert result == {
        "user_id": "anonymous",
        "strava_connected": True,
        "temp:strava_token": "token-123",
    }


@pytest.mark.asyncio
async def test_fetch_activities_writes_normalized_state(monkeypatch):
    response = Mock()
    response.json.return_value = [
        {
            "id": 456,
            "name": "Long hike",
            "sport_type": "Hike",
            "start_date": "2026-05-20T12:00:00Z",
            "distance": 12000,
            "moving_time": 10800,
            "elapsed_time": 12000,
            "total_elevation_gain": 900,
        }
    ]
    response.raise_for_status.return_value = None

    class DummyClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def get(self, url, headers, params):
            assert url == "https://www.strava.com/api/v3/athlete/activities"
            assert headers == {"Authorization": "Bearer token-123"}
            assert params["per_page"] == 200
            return response

    monkeypatch.setattr(main.httpx, "AsyncClient", lambda timeout: DummyClient())
    context = DummyToolContext(
        {"strava_connected": True, "temp:strava_token": "token-123"}
    )

    result = await main.fetch_activities(context)

    assert result["ok"] is True
    assert result["count"] == 1
    assert "summary" not in result
    expected_activities = [
        {
            "id": "456",
            "name": "Long hike",
            "sport_type": "Hike",
            "start_date": "2026-05-20T12:00:00Z",
            "distance_m": 12000,
            "moving_time_s": 10800,
            "elapsed_time_s": 12000,
            "total_elevation_gain_m": 900,
        }
    ]
    assert result["activities"] == expected_activities
    assert context.state["activities"] == expected_activities
    assert context.state["activities_synced_at"]
    assert context.state["status"] == "planning"


def test_set_training_plan_writes_state():
    context = DummyToolContext()

    result = main.set_training_plan(context, "## Week plan\n- Run easy")

    assert result == {"ok": True, "length": 23}
    assert context.state["training_plan"] == "## Week plan\n- Run easy"
    assert context.state["status"] == "planning"


def test_on_before_agent_hydrates_a2a_strava_metadata():
    callback_context = Mock()
    callback_context.state = {}
    callback_context._invocation_context.run_config.custom_metadata = {
        "a2a_metadata": {
            "user_id": "user_123",
            "strava_access_token": "token-123",
        }
    }

    main.on_before_agent(callback_context)

    assert callback_context.state["user_id"] == "user_123"
    assert callback_context.state["strava_connected"] is True
    assert callback_context.state["temp:strava_token"] == "token-123"


def test_web_search_toolset_uses_local_stdio_mcp(monkeypatch):
    monkeypatch.setenv("BRAVE_API_KEY", "brave-token")

    toolset = utils.web_search_toolset()
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
