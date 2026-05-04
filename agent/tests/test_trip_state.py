import asyncio
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from utils import shared_after_tool_callback
from agents.discovery import TOOLS as DISCOVERY_TOOLS
from agents.itinerary import TOOLS as ITINERARY_TOOLS
from agents.lodging import TOOLS as LODGING_TOOLS
from agents.profile import TOOLS as PROFILE_TOOLS
from agents.transport import TOOLS as TRANSPORT_TOOLS
from agents.viability import TOOLS as VIABILITY_TOOLS


class FakeToolContext:
    def __init__(self, initial=None):
        self.state = {"active_trip": initial or {}}


class FakeTool:
    name = "get_weather"


def test_callback_saves_structured_content_and_strips_it_from_response():
    ctx = FakeToolContext()
    response = {
        "structuredContent": {"success": True, "forecast": [{"date": "2026-05-03", "high": 72}]},
        "content": [{"type": "text", "text": "{\"success\": true}"}],
    }

    result = asyncio.run(shared_after_tool_callback(FakeTool(), {"city": "San Francisco"}, ctx, response))

    assert result == {"content": response["content"]}
    assert ctx.state["get_weather"] == response["structuredContent"]


def test_discovery_tools_has_explore_destinations():
    assert "explore_destinations" in DISCOVERY_TOOLS, \
        "explore_destinations must be in discovery agent tools"


def test_discovery_tools_no_search_natural():
    assert "search_natural" not in DISCOVERY_TOOLS, \
        "search_natural does not exist on the MCP server"


def test_itinerary_tools_no_list_watches():
    assert "list_watches" not in ITINERARY_TOOLS, \
        "list_watches does not exist on the MCP server"


def test_itinerary_tools_no_check_watches():
    assert "check_watches" not in ITINERARY_TOOLS, \
        "check_watches does not exist on the MCP server"


def test_tool_groups_are_disjoint():
    assert "get_preferences" in PROFILE_TOOLS
    assert "search_flights" in TRANSPORT_TOOLS
    assert "search_hotels" in LODGING_TOOLS
    assert "assess_trip" in VIABILITY_TOOLS
    assert "weekend_getaway" in DISCOVERY_TOOLS
    all_tools = PROFILE_TOOLS + TRANSPORT_TOOLS + LODGING_TOOLS + VIABILITY_TOOLS + DISCOVERY_TOOLS
    assert "configure_provider" not in all_tools
