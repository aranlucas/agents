"""Weekend trip travel planner using Google ADK with MCP tools."""

from __future__ import annotations

import json
import os
import time
from datetime import date
from typing import Any, Optional
from uuid import uuid4

from ag_ui_adk import ADKAgent, add_adk_fastapi_endpoint
from dotenv import load_dotenv
from fastapi import FastAPI
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams
from google.adk.tools import BaseTool, ToolContext

MAX_STORED_FLIGHTS = 12

TRVL_MCP_URL = os.getenv("TRVL_MCP_URL", "https://trvl-production.up.railway.app/mcp")


def get_current_date() -> str:
    """Returns today's date as YYYY-MM-DD. Call this before any date calculation."""
    return date.today().isoformat()


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


async def after_tool_callback(
    tool: BaseTool,
    args: dict,
    tool_context: ToolContext,
    tool_response: dict,
) -> Optional[dict[str, Any]]:
    """Callback to process MCP tool results and update agent state."""
    if tool.name not in ("search_flights", "search_dates"):
        return None

    try:
        content = tool_response.get("content", [])
        if not content:
            return None
        
        text = content[0].get("text", "{}")
        
        structured = tool_response.get("structuredContent")
        if structured:
            data = structured
        else:
            data = json.loads(text)
    except (json.JSONDecodeError, IndexError, KeyError, TypeError, AttributeError):
        return None

    if not data.get("success"):
        return None

    if tool.name == "search_flights":
        key = "flight_results"
        flights = _normalize_flights(data.get("flights", []))
        entry = {
            "id": str(uuid4()),
            "flights": flights,
            "ts": int(time.time()),
            "args": args,
        }
    elif tool.name == "search_dates":
        key = "date_results"
        dates = data.get("dates", [])
        entry = {
            "id": str(uuid4()),
            "dates": dates,
            "ts": int(time.time()),
            "args": args,
        }
    else:
        return None

    current = list(tool_context.state.get(key) or [])
    current.append(entry)
    tool_context.state[key] = current
    return None


load_dotenv()

SYSTEM_INSTRUCTION = """You are a weekend trip travel planner for someone based in Seattle, WA.

## Your Capabilities (MCP Tools)
You have access to the trvl MCP server with these tools:
- **search_flights**: Search for flights between airports on specific dates
- **search_dates**: Find cheapest travel dates across a flexible date range
- **get_preferences**: Get user's home airport and flight preferences (call first!)

## Important Rules
1. Always call get_current_date at the start to get today's date before calculating weekend dates
2. The user's home airport is Seattle-Tacoma International (SEA). Always use SEA as departure unless specified otherwise.
3. Always use IATA airport codes (e.g., SEA, SFO, LAX, ORD, JFK, LAS, PDX)
4. If the user gives a city name, infer the primary airport code

## Tool Usage
- For specific date queries: use search_flights
- For flexible date queries ("cheapest weekend", "when is it cheapest"): use search_dates
- Weekend trips are typically Friday–Sunday or Saturday–Sunday

## Presentation
- Present results conversationally — highlight best price, shortest flight, and direct options
- Suggest popular weekend destinations from Seattle: San Francisco, Los Angeles, Las Vegas, Portland, Boise, Vancouver BC, Phoenix, Denver, New York
- Mention stops, duration, and airline for the top results
- Ask only for destination and preferred weekend if not provided

## Weekend Deal Scan
When the user asks for "best deals this weekend" or similar:
1. Use search_dates for each destination: SFO, LAX, LAS, DEN, PHX, ORD
2. Cover the next two weekends (Friday through Sunday)
3. After all searches, summarize the top 3 cheapest destinations
"""

trvl_toolset = McpToolset(
    connection_params=StreamableHTTPConnectionParams(
        url=TRVL_MCP_URL,
        timeout=30.0,
    ),
    use_mcp_resources=True,
)

flight_agent = LlmAgent(
    name="flight_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    after_tool_callback=after_tool_callback,
    instruction=SYSTEM_INSTRUCTION,
    tools=[
        get_current_date,
        trvl_toolset,
    ],
)

adk_flight_agent = ADKAgent(
    adk_agent=flight_agent,
    user_id="demo_user",
    session_timeout_seconds=3600,
    use_in_memory_services=True,
)

app = FastAPI(title="Weekend Trip Planner")
add_adk_fastapi_endpoint(app, adk_flight_agent, path="/")


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    if not os.getenv("MISTRAL_API_KEY"):
        print("⚠️  Warning: MISTRAL_API_KEY environment variable not set!")
        print("   Set it with: export MISTRAL_API_KEY='your-key-here'")
        print("   Get a key from: https://console.mistral.ai/")
        print()

    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
