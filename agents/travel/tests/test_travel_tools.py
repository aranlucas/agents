from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from starlette.datastructures import Headers
from travel_agent import main


class DummyRequest:
    def __init__(self, headers: dict[str, str]) -> None:
        self.headers = Headers(headers)


def test_extract_identity_state_defaults_to_anonymous() -> None:
    assert main.extract_identity_state(DummyRequest({})) == {"user_id": "anonymous"}
    assert main.extract_identity_state(DummyRequest({"x-clerk-user-id": "user_123"})) == {
        "user_id": "user_123",
    }


@pytest.mark.asyncio
async def test_extract_travel_identity_state_delegates_to_header_reader() -> None:
    result = await main.extract_travel_identity_state(
        DummyRequest({"x-clerk-user-id": "user_123"}),
        object(),
    )
    assert result == {"user_id": "user_123"}


def test_trip_tools_write_expected_state() -> None:
    context = SimpleNamespace(state={})
    assert main.set_trip_meta(
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

    assert main.write_itinerary(context, "A balanced week", "## Day 1", "UA 1") == {
        "ok": True,
        "length": 8,
    }
    assert context.state["summary"] == "A balanced week"
    assert context.state["itinerary"] == "## Day 1"
    assert context.state["flights"] == "UA 1"

    assert main.add_day(context, 2, "Markets", "- 09:00 - Nishiki") == {"ok": True}
    assert "## Day 2: Markets" in context.state["itinerary"]

    assert main.mark_ready_to_book(context, "Ready") == {"ok": True}
    assert context.state["status"] == "ready_to_book"
    assert context.state["review_summary"] == "Ready"


@pytest.mark.asyncio
async def test_build_instruction_includes_preferences_and_injects_session_state(monkeypatch) -> None:
    async def fake_inject(instruction, context):
        assert context.state["travelerName"] == "Lucas"
        return instruction

    monkeypatch.setattr(main.instructions_utils, "inject_session_state", fake_inject)
    instruction = await main._build_instruction(
        SimpleNamespace(
            state={
                "travelerName": "Lucas",
                "homeAirport": "SFO",
                "transportMode": "train",
                "budgetTier": "mid",
                "vibe": "food",
                "pace": "relaxed",
                "interests": ["museums", "coffee"],
            },
        ),
    )
    assert "TRAVELER_BRIEF" in instruction
    assert "- Traveler: Lucas" in instruction
    assert "- Interests: museums, coffee" in instruction


@pytest.mark.asyncio
async def test_trace_requests_skips_health_path() -> None:
    request = SimpleNamespace(url=SimpleNamespace(path="/health"))
    response = object()
    call_next = AsyncMock(return_value=response)
    assert await main.trace_requests(request, call_next) is response
