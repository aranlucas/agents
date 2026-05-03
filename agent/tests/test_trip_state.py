import asyncio
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from utils import _update_active_trip, shared_after_tool_callback
from agents.discovery import TOOLS as DISCOVERY_TOOLS
from agents.lodging import TOOLS as LODGING_TOOLS
from agents.profile import TOOLS as PROFILE_TOOLS
from agents.transport import TOOLS as TRANSPORT_TOOLS
from agents.viability import TOOLS as VIABILITY_TOOLS


class FakeToolContext:
    def __init__(self, initial=None):
        self.state = {"active_trip": initial or {}}


class FakeTool:
    name = "get_weather"


def test_callback_saves_removed_structured_content():
    ctx = FakeToolContext()
    response = {
        "structuredContent": {"success": True, "forecast": [{"date": "2026-05-03", "high": 72}]},
        "content": [{"type": "text", "text": "{\"success\": true}"}],
    }

    result = asyncio.run(shared_after_tool_callback(FakeTool(), {"city": "San Francisco"}, ctx, response))

    assert result == {"content": response["content"]}
    assert ctx.state["get_weather"] == response["structuredContent"]


def test_search_hotels_updates_destination_and_lodging():
    ctx = FakeToolContext()
    _update_active_trip(ctx, "search_hotels", {"location": "San Francisco"}, {
        "success": True,
        "hotels": [{"name": "Hotel A", "price": 180, "currency": "USD"}],
    })
    trip = ctx.state["active_trip"]
    assert trip["destination"] == "San Francisco"
    assert trip["lodging"]["options"][0]["name"] == "Hotel A"
    assert trip["hotels_by_destination"]["San Francisco"][0]["name"] == "Hotel A"


def test_assess_trip_updates_viability():
    ctx = FakeToolContext()
    _update_active_trip(ctx, "assess_trip", {"origin": "SEA", "destination": "SFO"}, {
        "success": True,
        "verdict": "viable",
        "checks": [{"dimension": "visa", "status": "ok", "summary": "No visa required"}],
        "total_cost": 500,
        "currency": "USD",
    })
    trip = ctx.state["active_trip"]
    assert trip["origin"] == "SEA"
    assert trip["destination"] == "SFO"
    assert trip["viability"]["verdict"] == "viable"
    assert trip["viability"]["total_cost"] == 500


def test_search_route_uses_origin_destination_from_response():
    ctx = FakeToolContext()
    _update_active_trip(ctx, "search_route", {}, {
        "success": True,
        "origin": "Seattle",
        "destination": "Vancouver",
        "itineraries": [{"total_price": 75, "currency": "USD", "legs": []}],
    })
    trip = ctx.state["active_trip"]
    assert trip["origin"] == "Seattle"
    assert trip["destination"] == "Vancouver"
    assert trip["transport"]["routes"][0]["total_price"] == 75


def test_get_trip_copies_fields_from_response():
    ctx = FakeToolContext()
    _update_active_trip(ctx, "get_trip", {}, {
        "id": "trip_123",
        "name": "Vancouver weekend",
        "status": "planning",
        "origin": "Seattle",
        "destination": "Vancouver",
        "updated_at": "2026-04-27T18:00:00Z",
        "legs": [{"type": "train", "from": "Seattle", "to": "Vancouver", "confirmed": False}],
        "tags": ["weekend"],
        "notes": "Keep it simple",
    })
    trip = ctx.state["active_trip"]
    assert trip["id"] == "trip_123"
    assert trip["origin"] == "Seattle"
    assert trip["destination"] == "Vancouver"
    assert trip["source_updated_at"] == "2026-04-27T18:00:00Z"
    assert trip["legs"][0]["from"] == "Seattle"


def test_unknown_tool_does_not_modify_state():
    ctx = FakeToolContext({"origin": "SEA"})
    _update_active_trip(ctx, "get_weather", {}, {"success": True, "temp": 72})
    assert ctx.state["active_trip"].get("origin") == "SEA"
    assert "updated_at" not in ctx.state["active_trip"]


def test_tool_groups_are_disjoint():
    assert "get_preferences" in PROFILE_TOOLS
    assert "search_flights" in TRANSPORT_TOOLS
    assert "search_hotels" in LODGING_TOOLS
    assert "assess_trip" in VIABILITY_TOOLS
    assert "weekend_getaway" in DISCOVERY_TOOLS
    all_tools = PROFILE_TOOLS + TRANSPORT_TOOLS + LODGING_TOOLS + VIABILITY_TOOLS + DISCOVERY_TOOLS
    assert "configure_provider" not in all_tools
