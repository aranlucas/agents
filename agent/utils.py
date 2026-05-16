"""Shared utilities — MCP toolset factory, ADK SkillToolset, and tool callback."""

from __future__ import annotations

import os
import pathlib
from typing import Any, Optional

from google.adk.tools import BaseTool, ToolContext
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams
from google.adk.tools.skill_toolset import SkillToolset
from google.adk.skills import load_skill_from_dir, list_skills_in_dir

TRVL_MCP_URL = os.getenv("TRVL_MCP_URL", "https://trvl-production.up.railway.app/mcp")

SKILLS_DIR = pathlib.Path(__file__).parent / "skills"

TOOL_GROUPS = {
    "flights": [
        "search_flights", "search_dates", "suggest_dates", "optimize_trip_dates",
        "find_trip_window", "plan_flight_bundle", "find_interactive", "optimize_booking",
        "plan_trip", "calculate_trip_cost", "weekend_getaway", "optimize_multi_city",
        "explore_destinations",
    ],
    "hotels": [
        "search_hotels", "search_hotel_by_name", "hotel_prices", "hotel_reviews",
        "hotel_rooms", "watch_room_availability", "detect_accommodation_hacks",
    ],
    "ground": [
        "search_ground", "search_route", "search_airport_transfers",
    ],
    "hacks": [
        "detect_travel_hacks", "detect_accommodation_hacks", "search_hidden_city",
        "search_deals",
    ],
    "destinations": [
        "destination_info", "get_weather", "travel_guide", "local_events",
        "nearby_places", "search_restaurants", "search_lounges",
    ],
    "profile": [
        "get_preferences", "update_preferences", "onboard_profile",
        "build_profile", "add_booking",
    ],
    "trips": [
        "create_trip", "update_trip", "get_trip", "list_trips",
        "mark_trip_booked", "export_ics",
    ],
    "awards": [
        "search_awards", "calculate_points_value", "list_sweet_spots",
        "partner_award_paths", "stopover_rules", "award_holds",
        "transfer_bonuses", "transfer_path", "chat_awards",
    ],
    "reference": [
        "get_baggage_rules", "check_visa", "assess_trip",
    ],
    "providers": [
        "list_providers", "provider_health", "suggest_providers",
        "configure_provider", "test_provider", "remove_provider",
    ],
    "watches": [
        "watch_price", "list_watches", "check_watches",
        "watch_opportunities", "list_opportunity_watches",
    ],
}


def trvl_toolset(include_tools: Optional[list[str]] = None) -> McpToolset:
    """Create an McpToolset for the trvl MCP server.

    Args:
        include_tools: If provided, only include these tool names.
            If None, all tools are included.
    """
    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url=TRVL_MCP_URL,
            timeout=30.0,
        ),
        tool_filter=include_tools,
        use_mcp_resources=True,
    )


def trvl_toolset_for_skills(skill_names: list[str]) -> McpToolset:
    """Create an McpToolset scoped to specific skill categories.

    Args:
        skill_names: List of skill category names (e.g. ["flights", "hotels"]).
            Valid keys: flights, hotels, ground, hacks, destinations,
            profile, trips, awards, reference, providers, watches.
    """
    tools = []
    for skill in skill_names:
        if skill in TOOL_GROUPS:
            tools.extend(TOOL_GROUPS[skill])
    if not tools:
        return trvl_toolset()
    return trvl_toolset(include_tools=tools)


def load_adk_skills() -> list:
    """Load all ADK skills from the skills directory."""
    skills = []
    if not SKILLS_DIR.is_dir():
        return skills
    for skill_id in list_skills_in_dir(SKILLS_DIR):
        skill_dir = SKILLS_DIR / skill_id
        skills.append(load_skill_from_dir(skill_dir))
    return skills


def trvl_skill_toolset() -> SkillToolset:
    """Create a SkillToolset that combines ADK skills with the trvl MCP tools.

    The SkillToolset exposes list_skills, load_skill, load_skill_resource,
    and run_skill_script tools. When a skill is activated, it can dynamically
    enable MCP tools listed in the skill's allowed-tools frontmatter.
    """
    skills = load_adk_skills()
    mcp_tools = trvl_toolset()
    return SkillToolset(
        skills=skills,
        additional_tools=[mcp_tools],
    )


def parse_tool_response(tool_response: dict | str) -> Optional[dict]:
    try:
        if isinstance(tool_response, str):
            return tool_response
        return tool_response.get("structuredContent", tool_response.get("content", {}))
    except (KeyError, TypeError, AttributeError):
        return None


def save_state(
    tool_context: ToolContext, tool_name: str, structured_content: Any
) -> None:
    tool_context.state[tool_name] = structured_content


async def shared_after_tool_callback(
    tool: BaseTool,
    args: dict,
    tool_context: ToolContext,
    tool_response: dict,
) -> Optional[dict]:
    save_state(tool_context, tool.name, parse_tool_response(tool_response))

    if (
        isinstance(tool_response, dict)
        and "content" in tool_response
        and "structuredContent" in tool_response
    ):
        return {"content": tool_response["content"]}
    return tool_response
