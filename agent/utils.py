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


def trvl_toolset(names: list[str]) -> McpToolset:
    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url=TRVL_MCP_URL,
            timeout=30.0,
        ),
        tool_filter=names,
        use_mcp_resources=True,
    )


def parse_tool_response(tool_response: dict) -> Optional[dict]:
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


def _update_active_trip(
    tool_context: ToolContext, tool_name: str, args: dict, data: dict
) -> None:
    trip = tool_context.state.get("active_trip", {})

    if tool_name == "search_flights" and data.get("success"):
        trip["origin"] = args.get("origin", "")
        trip["destination"] = args.get("destination", "")
        if flights := data.get("flights"):
            trip["transport"] = {"options": flights}

    elif tool_name == "search_route" and data.get("success"):
        trip["origin"] = data["origin"]
        trip["destination"] = data["destination"]
        if routes := data.get("itineraries"):
            trip["transport"] = {"routes": routes}

    elif tool_name == "search_hotels" and data.get("success"):
        trip["destination"] = args.get("location", args.get("destination", ""))
        if hotels := data.get("hotels"):
            trip["lodging"] = {"options": hotels}
            if trip["destination"]:
                trip.setdefault("hotels_by_destination", {})[
                    trip["destination"]
                ] = hotels

    elif tool_name == "assess_trip" and data.get("success"):
        trip["origin"] = args.get("origin", "")
        trip["destination"] = args.get("destination", "")
        trip["viability"] = {
            k: data[k]
            for k in ("verdict", "checks", "total_cost", "currency")
            if k in data
        }

    elif tool_name == "plan_trip" and data.get("success"):
        trip["origin"] = data["origin"]
        trip["destination"] = data["destination"]
        if (outbound := data.get("outbound_flights")) or data.get("return_flights"):
            trip["transport"] = {
                "options": outbound or [],
                "return_options": data.get("return_flights") or [],
            }
        if hotels := data.get("hotels"):
            trip["lodging"] = {"options": hotels}

    elif tool_name == "create_trip":
        trip["id"] = data["id"]
        trip["name"] = data["name"]
        trip["legs"] = []

    elif tool_name in ("get_trip", "update_trip"):
        for key in (
            "id",
            "name",
            "status",
            "origin",
            "destination",
            "legs",
            "bookings",
            "tags",
            "notes",
        ):
            if key in data:
                trip[key] = data[key]
        if "updated_at" in data:
            trip["source_updated_at"] = data["updated_at"]

    elif tool_name == "mark_trip_booked":
        trip["id"] = data["trip_id"]
        trip["status"] = data["status"]

    else:
        return

    trip["updated_at"] = int(time.time())
    tool_context.state["active_trip"] = trip


def _save_removed_structured_content(
    tool_context: ToolContext,
    tool_name: str,
    structured_content: Any,
) -> None:
    tool_context.state[tool_name] = structured_content


async def shared_after_tool_callback(
    tool: BaseTool,
    args: dict,
    tool_context: ToolContext,
    tool_response: dict,
) -> Optional[dict]:
    if data := parse_tool_response(tool_response):
        _update_active_trip(tool_context, tool.name, args, data)

    if not isinstance(tool_response, dict):
        return None

    if "structuredContent" not in tool_response:
        return None

    _save_removed_structured_content(
        tool_context, tool.name, tool_response["structuredContent"]
    )
    if "content" in tool_response:
        return {"content": tool_response["content"]}
    return None
