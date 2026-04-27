"""Shared utilities for travel agents."""
from __future__ import annotations

import json
import os
import time
from typing import Any, Optional

from google.adk.tools import BaseTool, ToolContext
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams

TRVL_MCP_URL = os.getenv("TRVL_MCP_URL", "https://trvl-production.up.railway.app/mcp")

PROFILE_TOOLS = ["get_preferences", "update_preferences", "build_profile", "add_booking", "onboard_profile", "interview_trip"]
DISCOVERY_TOOLS = ["weekend_getaway", "suggest_dates", "search_dates", "search_deals", "destination_info", "travel_guide", "get_weather", "local_events", "nearby_places", "search_natural", "plan_trip"]
TRANSPORT_TOOLS = ["search_flights", "plan_flight_bundle", "find_interactive", "search_route", "search_ground", "search_airport_transfers", "get_baggage_rules", "search_lounges", "search_hidden_city", "search_awards"]
LODGING_TOOLS = ["search_hotels", "search_hotel_by_name", "hotel_rooms", "hotel_prices", "hotel_reviews", "detect_accommodation_hacks", "watch_room_availability"]
VIABILITY_TOOLS = ["assess_trip", "calculate_trip_cost", "check_visa", "calculate_points_value", "detect_travel_hacks", "optimize_booking", "optimize_trip_dates", "find_trip_window", "optimize_multi_city", "search_restaurants"]
ITINERARY_TOOLS = ["create_trip", "list_trips", "get_trip", "update_trip", "mark_trip_booked", "export_ics", "watch_price", "list_watches", "check_watches", "watch_opportunities", "list_opportunity_watches"]


def trvl_toolset(names: list[str]) -> McpToolset:
    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url=TRVL_MCP_URL,
            timeout=30.0,
        ),
        tool_filter=names,
        use_mcp_resources=True,
    )


def _as_str(value: Any, default: str = "") -> str:
    return value if isinstance(value, str) else default


def _as_int(value: Any, default: int = 0) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return default


def _as_float(value: Any, default: float = 0.0) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    return default


def _normalize_flights(raw_flights: list[Any]) -> list[dict[str, Any]]:
    """Normalize flight data from MCP response to internal format."""
    MAX_STORED_FLIGHTS = 12
    flights: list[dict[str, Any]] = []
    for raw_flight in raw_flights[:MAX_STORED_FLIGHTS]:
        if not isinstance(raw_flight, dict):
            continue

        raw_legs = raw_flight.get("legs")
        if not isinstance(raw_legs, list):
            continue

        legs: list[dict[str, Any]] = []
        for raw_leg in raw_legs:
            if not isinstance(raw_leg, dict):
                continue
            
            dep = raw_leg.get("departure_airport", {})
            arr = raw_leg.get("arrival_airport", {})
            
            legs.append({
                "airline": raw_leg.get("airline", ""),
                "airline_code": raw_leg.get("airline_code", ""),
                "flight_number": raw_leg.get("flight_number", ""),
                "departure_airport": dep.get("code", "") if isinstance(dep, dict) else str(dep),
                "departure_time": raw_leg.get("departure_time", ""),
                "arrival_airport": arr.get("code", "") if isinstance(arr, dict) else str(arr),
                "arrival_time": raw_leg.get("arrival_time", ""),
                "duration": _as_int(raw_leg.get("duration")),
            })

        if not legs:
            continue

        flight: dict[str, Any] = {
            "price": _as_float(raw_flight.get("price")),
            "currency": _as_str(raw_flight.get("currency"), "USD"),
            "legs": legs,
        }
        stops = raw_flight.get("stops")
        if isinstance(stops, int):
            flight["stops"] = stops
        flights.append(flight)

    return flights


def _normalize_route_options(raw_routes: list[Any]) -> list[dict[str, Any]]:
    routes: list[dict[str, Any]] = []
    for raw_route in raw_routes[:12]:
        if not isinstance(raw_route, dict):
            continue
        price = raw_route.get("price", raw_route.get("total_price"))
        duration = raw_route.get("duration", raw_route.get("total_duration"))
        route: dict[str, Any] = {
            "price": _as_float(price),
            "currency": _as_str(raw_route.get("currency"), "USD"),
            "legs": raw_route.get("legs", []),
        }
        if isinstance(duration, (int, float)):
            route["duration"] = int(duration)
        transfers = raw_route.get("transfers")
        if isinstance(transfers, (int, float)):
            route["transfers"] = int(transfers)
        routes.append(route)
    return routes


def _normalize_trip_leg(raw_leg: Any) -> dict[str, Any] | None:
    if not isinstance(raw_leg, dict):
        return None
    leg = {
        "type": _as_str(raw_leg.get("type")),
        "from": _as_str(raw_leg.get("from")),
        "to": _as_str(raw_leg.get("to")),
        "provider": _as_str(raw_leg.get("provider")),
        "confirmed": bool(raw_leg.get("confirmed", False)),
    }
    for key in ("start_time", "end_time", "currency", "reference"):
        value = raw_leg.get(key)
        if isinstance(value, str) and value:
            leg[key] = value
    price = raw_leg.get("price")
    if isinstance(price, (int, float)):
        leg["price"] = float(price)
    return leg


def _trip_patch_from_trip(raw_trip: dict[str, Any]) -> dict[str, Any]:
    legs = [
        leg
        for leg in (_normalize_trip_leg(raw_leg) for raw_leg in raw_trip.get("legs", []))
        if leg is not None
    ]
    patch: dict[str, Any] = {
        key: raw_trip[key]
        for key in ("id", "name", "status", "bookings", "tags", "notes")
        if key in raw_trip
    }
    if "updated_at" in raw_trip:
        patch["source_updated_at"] = raw_trip["updated_at"]
    if legs:
        patch["legs"] = legs
        patch["origin"] = legs[0].get("from", "")
        patch["destination"] = legs[-1].get("to", "")
    return patch


def merge_active_trip(
    current: dict[str, Any] | None,
    patch: dict[str, Any],
    *,
    now: int | None = None,
) -> dict[str, Any]:
    """Merge a normalized trip patch without dropping existing sections."""
    merged: dict[str, Any] = dict(current or {})
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}
        else:
            merged[key] = value
    merged["updated_at"] = int(time.time()) if now is None else now
    return merged


def normalize_trip_patch(
    tool_name: str,
    args: dict[str, Any],
    result: dict[str, Any],
) -> dict[str, Any]:
    """Normalize MCP tool result into an active_trip patch."""
    patch: dict[str, Any] = {}

    if tool_name == "search_hotels" and result.get("success"):
        patch["destination"] = args.get("location", args.get("destination", ""))
        hotels = result.get("hotels", [])
        if hotels:
            patch["lodging"] = {"options": hotels}

    elif tool_name == "assess_trip" and result.get("success"):
        patch["origin"] = args.get("origin", "")
        patch["destination"] = args.get("destination", "")
        patch["viability"] = {
            "verdict": result.get("verdict", ""),
            "checks": result.get("checks", []),
            "total_cost": result.get("total_cost", 0),
            "currency": result.get("currency", "USD"),
        }

    elif tool_name == "search_flights" and result.get("success"):
        patch["origin"] = args.get("origin", "")
        patch["destination"] = args.get("destination", "")
        flights = result.get("flights", [])
        if flights:
            patch["transport"] = {"options": flights}

    elif tool_name == "search_route" and result.get("success"):
        patch["origin"] = args.get("origin", "")
        patch["destination"] = args.get("destination", "")
        routes = _normalize_route_options(result.get("itineraries") or result.get("routes") or [])
        if routes:
            patch["transport"] = {"routes": routes}

    elif tool_name == "create_trip":
        if result.get("id"):
            patch["id"] = result.get("id")
        if result.get("name"):
            patch["name"] = result.get("name")
        patch["legs"] = []

    elif tool_name in ("get_trip", "update_trip"):
        patch.update(_trip_patch_from_trip(result))

    elif tool_name == "mark_trip_booked":
        if result.get("trip_id"):
            patch["id"] = result.get("trip_id")
        if result.get("status"):
            patch["status"] = result.get("status")

    return patch


def parse_tool_response(tool_response: dict) -> Optional[dict]:
    """Parse MCP tool response into structured data."""
    try:
        structured = tool_response.get("structuredContent")
        if structured:
            return structured
        content = tool_response.get("content", [])
        if not content:
            return None
        text = content[0].get("text", "{}")
        return json.loads(text)
    except (json.JSONDecodeError, IndexError, KeyError, TypeError, AttributeError):
        return None


def update_legacy_results(
    tool_context: ToolContext,
    key: str,
    entry: dict,
) -> None:
    """Update legacy result arrays in agent state."""
    current = list(tool_context.state.get(key) or [])
    current.append(entry)
    tool_context.state[key] = current


def filter_mcp_tool_response(
    tool: BaseTool,
    args: dict,
    tool_context: ToolContext,
    tool_response: dict,
) -> Optional[dict]:
    """Filter MCP tool responses to only pass content to LLM when both content and structuredContent exist."""
    if (
        isinstance(tool_response, dict)
        and "content" in tool_response
        and "structuredContent" in tool_response
    ):
        return {"content": tool_response["content"]}
    return None


def update_active_trip(
    tool_context: ToolContext,
    tool_name: str,
    args: dict,
    data: dict,
) -> None:
    """Normalize and merge trip patch into active_trip state."""
    patch = normalize_trip_patch(tool_name, args, data)
    if patch:
        current_trip = tool_context.state.get("active_trip")
        merged = merge_active_trip(current_trip, patch)
        tool_context.state["active_trip"] = merged
