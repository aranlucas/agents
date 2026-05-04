"""Weekend trip travel planner using Google ADK with MCP tools."""

from __future__ import annotations

from datetime import date
from dotenv import load_dotenv
import os

from ag_ui_adk import ADKAgent, AGUIToolset, add_adk_fastapi_endpoint
from fastapi import FastAPI
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools.base_toolset import BaseToolset

from agents import (
    profile_agent,
    discovery_agent,
    transport_agent,
    lodging_agent,
    viability_agent,
    itinerary_agent,
)
from agents.discovery import TOOLS as DISCOVERY_TOOLS
from agents.itinerary import TOOLS as ITINERARY_TOOLS
from agents.lodging import TOOLS as LODGING_TOOLS
from agents.profile import TOOLS as PROFILE_TOOLS
from agents.transport import TOOLS as TRANSPORT_TOOLS
from agents.viability import TOOLS as VIABILITY_TOOLS
from utils import shared_after_tool_callback, trvl_toolset

load_dotenv()


def get_current_date() -> str:
    """Returns today's date as YYYY-MM-DD. Call this before any date calculation."""
    return date.today().isoformat()


ROOT_INSTRUCTION = """You are a travel concierge for weekend trips from Seattle, WA.
Call get_current_date before any date reasoning.

Route requests to the correct specialist using these rules:

— discovery: open-ended, exploratory, or destination-unknown requests. Route here even when the
  word "flights" appears if origin + destination + date are not all specified. Examples:
  "show flights near me", "where should I go", "cheap weekend trips", "what can I do for $500",
  "show me deals", "where can I fly from Seattle".

— transport: specific, directed searches where origin, destination, AND date are all known.
  Examples: "flights from SEA to YVR on June 5", "compare airlines for my Portland trip",
  "award availability on Alaska SEA-LAX".

— lodging: any accommodation search, comparison, pricing, or availability watch.

— viability: cost estimation, visa checks, points value, date optimization, "is this trip
  doable", booking optimization.

— itinerary: save, update, retrieve, or export trips; price watches. Only after a plan exists.

— profile: only when the user explicitly asks about preferences, or when a specialist needs a
  specific missing default (home airport, budget, loyalty tier) that would materially change its
  answer. Never call profile as a default first step.

Summarize results clearly. Ask only for missing trip constraints needed to proceed.
"""


travel_concierge_agent = LlmAgent(
    name="travel_concierge_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    instruction=ROOT_INSTRUCTION,
    after_tool_callback=shared_after_tool_callback,
    tools=[
        get_current_date,
    ],
    sub_agents=[
        profile_agent,
        discovery_agent,
        transport_agent,
        lodging_agent,
        viability_agent,
        itinerary_agent,
    ],
)

adk_flight_agent = ADKAgent(
    adk_agent=travel_concierge_agent,
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
