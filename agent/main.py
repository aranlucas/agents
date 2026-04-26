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
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from mcp import StdioServerParameters


def get_current_date() -> str:
    """Returns today's date as YYYY-MM-DD. Call this before any date calculation."""
    return date.today().isoformat()


async def after_tool_callback(
    tool: Any,
    args: dict[str, Any],
    tool_context: Any,
    tool_response: dict[str, Any],
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

    # Sanitize args through JSON to strip any non-serializable ADK internals
    try:
        safe_args = json.loads(json.dumps(args or {}))
    except (TypeError, ValueError):
        safe_args = {}

    if tool.name == "search_flights":
        key = "flight_results"
        entry = {
            "id": str(uuid4()),
            "args": safe_args,
            "flights": data.get("flights", []),
            "ts": int(time.time()),
        }
    else:
        key = "date_results"
        entry = {
            "id": str(uuid4()),
            "args": safe_args,
            "dates": data.get("dates") or data.get("cheapest_dates") or [],
            "ts": int(time.time()),
        }

    current = list(tool_context.state.get(key) or [])
    current.append(entry)
    tool_context.state[key] = current
    return None


load_dotenv()

flight_agent = LlmAgent(
    name="FlightAgent",
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
""",
    tools=[
        get_current_date,
        McpToolset(
            connection_params=StdioConnectionParams(
                server_params=StdioServerParameters(
                    command="fli-mcp",
                    args=[],
                )
            )
        )
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
