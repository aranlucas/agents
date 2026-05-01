"""Weekend trip travel planner using Google ADK with MCP tools."""
from __future__ import annotations

from datetime import date
from dotenv import load_dotenv
import os

from ag_ui_adk import ADKAgent, add_adk_fastapi_endpoint
from fastapi import FastAPI
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from a2ui.adk.send_a2ui_to_client_toolset import SendA2uiToClientToolset
from a2ui.basic_catalog import BasicCatalog
from a2ui.schema.constants import VERSION_0_9
from a2ui.schema.manager import A2uiSchemaManager

from agents import (
    profile_agent,
    discovery_agent,
    transport_agent,
    lodging_agent,
    viability_agent,
    itinerary_agent,
)

load_dotenv()

_bc = BasicCatalog()
_catalog_config = _bc.get_config(VERSION_0_9)
_manager = A2uiSchemaManager(version=VERSION_0_9, catalogs=[_catalog_config])
BASIC_CATALOG = _manager._supported_catalogs[0]

def get_current_date() -> str:
    """Returns today's date as YYYY-MM-DD. Call this before any date calculation."""
    return date.today().isoformat()

ROOT_INSTRUCTION = """You are a travel concierge for weekend trips from Seattle, WA.
Call get_current_date before reasoning about dates. Route discovery, transport, lodging, viability,
and itinerary work to the matching specialist.

Use the profile specialist only when the user asks about preferences/profile/history, when a specialist
needs missing personal defaults such as home airport, budget, companions, loyalty programs, passport, or
lodging preferences, or when personalization would materially change the answer. Do not call profile as
a default first step when the user already gave enough trip constraints.

If a specialist needs profile context, get only the specific preference or profile detail needed, then
continue with that specialist. Summarize results clearly and ask only for missing trip constraints needed
to proceed.

When responding to users, use send_a2ui_json_to_client to render rich UI cards for trip options,
flights, hotels, itineraries, and similar structured results whenever possible."""


travel_concierge_agent = LlmAgent(
    name="travel_concierge_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    instruction=ROOT_INSTRUCTION,
    tools=[
        get_current_date,
        SendA2uiToClientToolset(
            a2ui_enabled=True,
            a2ui_catalog=BASIC_CATALOG,
            a2ui_examples="",
        ),
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
