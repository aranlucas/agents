from unittest.mock import Mock

import pytest
from fitness_agent import main, utils
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from starlette.datastructures import Headers


class DummyToolContext:
    def __init__(self, state: dict | None = None) -> None:
        self.state = state or {}


class DummyRequest:
    def __init__(self, headers: dict[str, str]) -> None:
        self.headers = Headers(headers)


def test_normalize_activity_keeps_training_fields() -> None:
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
        },
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
async def test_fetch_activities_requires_connected_strava() -> None:
    context = DummyToolContext({"strava_connected": False})
    result = await main.fetch_activities(context)
    assert result == {
        "ok": False,
        "reason": "strava_not_connected",
        "message": "Connect Strava before syncing activities.",
    }
    assert context.state["status"] == "idle"


@pytest.mark.asyncio
async def test_extract_strava_auth_state_uses_temp_header_state() -> None:
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
async def test_fetch_activities_writes_normalized_state(monkeypatch) -> None:
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
        },
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

    def async_client_factory(*, timeout):
        assert timeout == 30.0
        return DummyClient()

    monkeypatch.setattr(main.httpx, "AsyncClient", async_client_factory)
    context = DummyToolContext(
        {"strava_connected": True, "temp:strava_token": "token-123"},
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
        },
    ]
    assert result["activities"] == expected_activities
    assert context.state["activities"] == expected_activities
    assert context.state["activities_synced_at"]
    assert context.state["status"] == "planning"


def test_set_training_plan_writes_state() -> None:
    context = DummyToolContext()
    result = main.set_training_plan(context, "## Week plan\n- Run easy")
    assert result == {"ok": True, "length": 23}
    assert context.state["training_plan"] == "## Week plan\n- Run easy"
    assert context.state["status"] == "planning"


def test_summarize_activities_aggregates_training_totals() -> None:
    summary = main.summarize_activities(
        [
            {
                "sport_type": "Run",
                "distance_m": 5000,
                "moving_time_s": 1800,
                "total_elevation_gain_m": 100.4,
            },
            {
                "sport_type": "Hike",
                "distance_m": 12500,
                "moving_time_s": 7200,
                "total_elevation_gain_m": 800.2,
            },
            {"distance_m": None, "moving_time_s": None},
        ],
    )
    assert summary == {
        "activity_count": 3,
        "distance_km": 17.5,
        "moving_hours": 2.5,
        "elevation_m": 901,
        "sport_counts": {"Run": 1, "Hike": 1, "Activity": 1},
    }


def test_normalize_activity_uses_type_and_default_name() -> None:
    assert main.normalize_strava_activity({"id": None, "type": "Ride"}) == {
        "id": "None",
        "name": "Untitled activity",
        "sport_type": "Ride",
    }


@pytest.mark.asyncio
async def test_extract_strava_auth_state_marks_missing_token_disconnected() -> None:
    result = await main.extract_strava_auth_state(
        DummyRequest({"x-clerk-user-id": "user_123"}),
        Mock(state={}),
    )
    assert result == {"user_id": "user_123", "strava_connected": False}


def test_fitness_state_tools_write_state() -> None:
    context = DummyToolContext()
    assert main.set_objective_research(context, "Trail notes") == {
        "ok": True,
        "length": 11,
    }
    assert context.state["objective_research"] == "Trail notes"
    assert context.state["status"] == "planning"

    assert main.mark_plan_ready(context, "Ready") == {"ok": True}
    assert context.state["status"] == "ready"
    assert context.state["review_summary"] == "Ready"


def test_before_model_modifier_warns_when_strava_disconnected() -> None:
    request = Mock()
    request.config.system_instruction = "Original"
    callback_context = Mock()
    callback_context.state = {}
    assert main.before_model_modifier(callback_context, request) is None
    assert "Strava is not connected" in request.config.system_instruction
    assert "Original" in request.config.system_instruction


def test_before_model_modifier_prompts_fetch_when_connected() -> None:
    request = Mock()
    request.config.system_instruction = "Original"
    callback_context = Mock()
    callback_context.state = {
        "strava_connected": True,
        "temp:strava_token": "token",
        "activities": [{"id": "1"}],
        "activities_synced_at": "2026-06-01T00:00:00Z",
    }
    main.before_model_modifier(callback_context, request)
    assert "Strava connected: True" in request.config.system_instruction
    assert "call fetch_activities first" in request.config.system_instruction


@pytest.mark.asyncio
async def test_throttle_web_search_ignores_non_brave_tools() -> None:
    main._last_web_search_at = 1000
    await main.throttle_web_search(Mock(name="other_search"), {}, Mock())
    assert main._last_web_search_at == 1000


def test_on_before_agent_derives_strava_connected_from_contextvar_token() -> None:
    from agent_common.invocation_state import set_invocation_temp_state

    set_invocation_temp_state({"temp:strava_token": "ctx-token"})
    callback_context = Mock()
    callback_context.state = {}
    main.on_before_agent(callback_context)
    assert callback_context.state["strava_connected"] is True
    set_invocation_temp_state(None)


def test_web_search_toolset_uses_local_stdio_mcp(monkeypatch) -> None:
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
