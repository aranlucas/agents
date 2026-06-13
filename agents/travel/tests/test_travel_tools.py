from types import SimpleNamespace

from agents_shared.tools import extract_identity_state
from starlette.datastructures import Headers
from travel_agent import agent, main


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
    assert agent.set_trip_meta(
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

    assert agent.write_itinerary(context, "A balanced week", "## Day 1", "UA 1") == {
        "ok": True,
        "length": 8,
    }
    assert context.state["summary"] == "A balanced week"
    assert context.state["itinerary"] == "## Day 1"
    assert context.state["flights"] == "UA 1"

    assert agent.add_day(context, 2, "Markets", "- 09:00 - Nishiki") == {"ok": True}
    assert "## Day 2: Markets" in context.state["itinerary"]

    assert agent.mark_ready_to_book(context, "Ready") == {"ok": True}
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


def test_main_app_is_fastapi() -> None:
    from fastapi import FastAPI

    assert isinstance(main.app, FastAPI)
