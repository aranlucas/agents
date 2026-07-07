from types import SimpleNamespace

import travel_agent.agent as agent
import travel_agent.main as main
from agents_shared.dependencies import create_agent_services
from agents_shared.tools import extract_identity_state
from fastapi import FastAPI
from starlette.datastructures import Headers
from travel_agent.tools.add_day import add_day
from travel_agent.tools.mark_ready_to_book import mark_ready_to_book
from travel_agent.tools.set_trip_meta import set_trip_meta
from travel_agent.tools.write_itinerary import write_itinerary


class DummyRequest:
    def __init__(self, headers: dict[str, str]) -> None:
        self.headers = Headers(headers)


def test_extract_identity_state_defaults_to_anonymous() -> None:
    assert extract_identity_state(DummyRequest({})) == {"user_id": "anonymous"}
    assert extract_identity_state(DummyRequest({"x-clerk-user-id": "user_123"})) == {
        "user_id": "user_123",
    }


def test_trip_tools_write_expected_state() -> None:
    context = SimpleNamespace(state={})
    assert set_trip_meta(
        context,
        destination="Kyoto",
        start_date="2026-10-01",
        end_date="2026-10-08",
        travelers=2,
        budget_usd=5000,
        headline="Temples and food",
    ) == {"ok": True}
    assert context.state == {
        "destination": "Kyoto",
        "start_date": "2026-10-01",
        "end_date": "2026-10-08",
        "travelers": 2,
        "budget_usd": 5000,
        "headline": "Temples and food",
        "status": "drafting",
        "flights": "",
    }

    assert write_itinerary(context, "A balanced week", "## Day 1", "UA 1") == {
        "ok": True,
        "length": 8,
    }
    assert context.state["summary"] == "A balanced week"
    assert context.state["itinerary"] == "## Day 1"
    assert context.state["flights"] == "UA 1"

    assert add_day(context, 2, "Markets", "- 09:00 - Nishiki") == {"ok": True}
    assert "## Day 2: Markets" in context.state["itinerary"]

    assert mark_ready_to_book(context, "Ready") == {"ok": True}
    assert context.state["status"] == "ready_to_book"
    assert context.state["review_summary"] == "Ready"


def test_agent_instruction_uses_adk_state_placeholders() -> None:
    travel_agent = agent.build_agent()
    instruction = travel_agent.instruction

    assert isinstance(instruction, str)
    assert "TRAVELER_BRIEF" in instruction
    assert "{travelerName}" in instruction
    assert "{homeAirport}" in instruction
    assert "{transportMode}" in instruction
    assert "{budgetTier}" in instruction
    assert "{interests}" in instruction
    assert not hasattr(agent, "_build_instruction")


def test_runtime_agent_uses_hy3_free_model() -> None:
    travel_agent = agent.build_agent()
    assert travel_agent.model.model == "openrouter/tencent/hy3:free"


def _route_paths(app) -> set[str]:
    paths = set()
    for route in app.routes:
        if hasattr(route, "path"):
            paths.add(route.path)
        elif hasattr(route, "original_router") and hasattr(route, "include_context"):
            ic = route.include_context
            prefix = getattr(ic, "prefix", "") or ""
            for sub in route.original_router.routes:
                if hasattr(sub, "path"):
                    paths.add(prefix + sub.path)
    return paths


def test_main_register_exposes_prefixed_routes() -> None:
    app = FastAPI()
    main.register(app, create_agent_services())

    paths = _route_paths(app)
    assert "/travel/health" in paths
    assert any(path.startswith("/travel/agui") for path in paths)


def test_main_register_configures_trvl_mcp_plugins(monkeypatch) -> None:
    from agents_shared.plugins.slim_mcp import SlimMcpPlugin

    captured: dict[str, object] = {}

    def fake_build_adk_agent(*args, **kwargs):
        captured.update(kwargs)
        return object()

    def fake_add_agent_routes(*args, **kwargs):
        return None

    monkeypatch.setattr(main, "build_adk_agent", fake_build_adk_agent)
    monkeypatch.setattr(main, "add_agent_routes", fake_add_agent_routes)

    main.register(FastAPI(), create_agent_services())

    assert [type(plugin) for plugin in captured["plugins"]] == [SlimMcpPlugin]
