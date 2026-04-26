"""Flight search agent powered by fli MCP server."""

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
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHttpConnectionParams
from google.adk.tools import BaseTool, ToolContext

MAX_STORED_FLIGHTS = 12


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
            legs.append(
                {
                    "airline": _as_str(raw_leg.get("airline")),
                    "airline_code": _as_str(raw_leg.get("airline_code")),
                    "flight_number": _as_str(raw_leg.get("flight_number")),
                    "departure_airport": _as_str(raw_leg.get("departure_airport")),
                    "departure_time": _as_str(raw_leg.get("departure_time")),
                    "arrival_airport": _as_str(raw_leg.get("arrival_airport")),
                    "arrival_time": _as_str(raw_leg.get("arrival_time")),
                    "duration": _as_int(raw_leg.get("duration")),
                }
            )

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
    if tool.name not in ("search_flights", "search_dates"):
        return None

    try:
        text = tool_response.get("content", [{}])[0].get("text", "{}")
        data = json.loads(text)
    except (json.JSONDecodeError, IndexError, KeyError, TypeError):
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

    current = list(tool_context.state.get(key) or [])
    current.append(entry)
    tool_context.state[key] = current
    return None


load_dotenv()

flight_agent = LlmAgent(
    name="flight_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    after_tool_callback=after_tool_callback,
    instruction="""You are a weekend trip flight planner for someone based in Seattle, WA.
Always call get_current_date at the start of every conversation to get today's date before calculating any weekend dates.
The user's home airport is Seattle-Tacoma International (SEA). Always use SEA as the departure airport unless the user explicitly says otherwise.

Use the search_flights tool to find flights on a specific date between two airports.
Use the search_dates tool to find the cheapest travel dates across a flexible date range.

Guidelines:
- Always use IATA airport codes (e.g. SEA, SFO, LAX, ORD, JFK, LAS, PDX)
- If the user gives a city name, infer the primary airport code
- Default departure is SEA (Seattle-Tacoma International)
- For specific date queries, use search_flights
- For flexible date queries ("cheapest weekend", "when is it cheapest"), use search_dates
- Weekend trips are typically Friday–Sunday or Saturday–Sunday, so suggest nearby weekends when dates are vague
- Ask only for the destination and preferred weekend if not provided — never ask for origin since it defaults to SEA
- Present results conversationally — highlight best price, shortest flight, and direct options
- Suggest popular weekend destinations from Seattle: San Francisco, Los Angeles, Las Vegas, Portland, Boise, Vancouver BC, Phoenix, Denver, New York
- Mention stops, duration, and airline for the top results

Weekend deal scan:
- When the user asks for a scan or "best deals this weekend", search_dates for each destination one at a time: SFO, LAX, LAS, DEN, PHX, ORD
- Use a date range covering the next two weekends (Friday through Sunday)
- After all searches complete, summarize the top 3 cheapest destinations
""",
    tools=[
        get_current_date,
        McpToolset(
            connection_params=StreamableHttpConnectionParams(
                url="https://trvl-production.up.railway.app/mcp",
                timeout=30.0,
            ),
            use_mcp_resources=True,
        ),
    ],
)

adk_flight_agent = ADKAgent(
    adk_agent=flight_agent,
    user_id="demo_user",
    session_timeout_seconds=3600,
    use_in_memory_services=True,
)

app = FastAPI(title="Flight Search Agent")
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
