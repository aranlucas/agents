"""Itinerary agent."""
from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from utils import trvl_toolset, shared_after_tool_callback

TOOLS = ["create_trip", "list_trips", "get_trip", "update_trip", "mark_trip_booked", "export_ics", "watch_price", "list_watches", "check_watches", "watch_opportunities", "list_opportunity_watches"]

ITINERARY_INSTRUCTION = """Maintain trip records and booking follow-through.

When creating multi-destination trips (e.g., Seattle -> Vancouver -> Whistler -> Seattle):
1. Call create_trip first with a descriptive name
2. Add ALL trip legs using update_trip in order - do NOT skip any legs
3. For road trips, use type="road_trip" and provider="personal_car" (or "rental_car")
4. For flights, use type="flight" and specify airline as provider
5. Ensure the complete route is captured: every destination must have a leg to it AND from it

After adding all legs, confirm the trip is complete by listing all legs back to the user.

Use itinerary tools to create, list, retrieve, update, mark booked, export calendars, create price
watches, list watches, check watches, and review watch opportunities. Use profile context only when
saved preferences or booking history are needed to complete the itinerary accurately."""


itinerary_agent = LlmAgent(
    name="itinerary_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    instruction=ITINERARY_INSTRUCTION,
    tools=[trvl_toolset(TOOLS)],
    after_tool_callback=shared_after_tool_callback,
)
