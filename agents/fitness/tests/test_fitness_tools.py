from unittest.mock import Mock

import fitness_agent.tools.search as _search_mod
import httpx
import pytest
from agents_shared.state import STRAVA_AUTH, make_state_initializer
from fitness_agent import agent
from fitness_agent.tools._types import normalize_strava_activity, summarize_activities
from fitness_agent.tools.fetch_activities import fetch_activities
from fitness_agent.tools.mark_plan_ready import mark_plan_ready
from fitness_agent.tools.set_objective_research import set_objective_research
from fitness_agent.tools.set_training_plan import set_training_plan
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from starlette.datastructures import Headers


class DummyToolContext:
    def __init__(self, state: dict | None = None) -> None:
        self.state = state or {}


class DummyRequest:
    def __init__(self, headers: dict[str, str]) -> None:
        self.headers = Headers(headers)


def test_normalize_activity_keeps_training_fields() -> None:
    activity = normalize_strava_activity(
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
    result = await fetch_activities(context)
    assert result == {
        "ok": False,
        "reason": "strava_not_connected",
        "message": "Connect Strava before syncing activities.",
    }
    assert context.state["status"] == "idle"


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

    monkeypatch.setattr(httpx, "AsyncClient", async_client_factory)
    context = DummyToolContext(
        {"strava_connected": True, "temp:strava_token": "token-123"},
    )
    result = await fetch_activities(context)
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
    result = set_training_plan(context, "## Week plan\n- Run easy")
    assert result == {"ok": True, "length": 23}
    assert context.state["training_plan"] == "## Week plan\n- Run easy"
    assert context.state["status"] == "planning"


def test_summarize_activities_aggregates_training_totals() -> None:
    summary = summarize_activities(
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
    assert normalize_strava_activity({"id": None, "type": "Ride"}) == {
        "id": "None",
        "name": "Untitled activity",
        "sport_type": "Ride",
    }


def test_fitness_state_tools_write_state() -> None:
    context = DummyToolContext()
    assert set_objective_research(context, "Trail notes") == {
        "ok": True,
        "length": 11,
    }
    assert context.state["objective_research"] == "Trail notes"
    assert context.state["status"] == "planning"

    assert mark_plan_ready(context, "Ready") == {"ok": True}
    assert context.state["status"] == "ready"
    assert context.state["review_summary"] == "Ready"


def test_agent_instruction_uses_adk_state_placeholders() -> None:
    fitness_agent = agent.build_agent()
    instruction = fitness_agent.instruction

    assert isinstance(instruction, str)
    assert "Current fitness state:" in instruction
    assert "{strava_connected}" in instruction
    assert "{activities}" in instruction
    assert "{activities_synced_at}" in instruction
    assert "{training_plan}" in instruction
    assert not hasattr(agent, "build_dynamic_instruction")


def test_strava_token_read_from_state_key() -> None:
    """fetch_activities reads the token directly via STRAVA_AUTH.state_key."""
    from agents_shared.state import STRAVA_AUTH

    state = {"temp:strava_token": "token-123", "status": "planning"}
    token = str(state.get(STRAVA_AUTH.state_key) or "")
    assert token == "token-123"
    assert str({}.get(STRAVA_AUTH.state_key) or "") == ""


@pytest.mark.asyncio
async def test_throttle_web_search_ignores_non_brave_tools() -> None:
    agent._web_search_state["last_at"] = 1000
    await agent.throttle_web_search(Mock(name="other_search"), {}, Mock())
    assert agent._web_search_state["last_at"] == 1000


def test_on_before_agent_derives_strava_connected_from_state_token() -> None:
    callback_context = Mock()
    callback_context.state = {"temp:strava_token": "ctx-token"}
    initializer = make_state_initializer(
        agent.FitnessState,
        token_flags={STRAVA_AUTH.state_key: STRAVA_AUTH.connected_flag},
    )
    initializer(callback_context)
    assert callback_context.state["strava_connected"] is True


def test_web_search_toolset_uses_npx_when_binary_absent(monkeypatch) -> None:
    monkeypatch.setenv("BRAVE_API_KEY", "brave-token")
    monkeypatch.setattr(_search_mod.shutil, "which", lambda _: None)
    from fitness_agent.tools.search import web_search_toolset

    toolset = web_search_toolset()
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


def test_web_search_toolset_uses_binary_when_installed(monkeypatch) -> None:
    monkeypatch.setenv("BRAVE_API_KEY", "brave-token")
    monkeypatch.setattr(
        _search_mod.shutil, "which", lambda name: f"/usr/local/bin/{name}"
    )
    from fitness_agent.tools.search import web_search_toolset

    toolset = web_search_toolset()
    params = toolset._connection_params
    assert isinstance(params, StdioConnectionParams)
    assert params.timeout == 30.0
    assert params.server_params.command == "brave-search-mcp-server"
    assert params.server_params.args == ["--brave-api-key", "brave-token"]
    assert params.server_params.env == {"BRAVE_API_KEY": "brave-token"}
    assert toolset._use_mcp_resources is False
