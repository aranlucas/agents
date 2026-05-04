"""Itinerary agent."""
from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from utils import trvl_toolset, shared_after_tool_callback

TOOLS = [
    "create_trip",
    "list_trips",
    "get_trip",
    "update_trip",
    "mark_trip_booked",
    "export_ics",
    "watch_price",
    "watch_opportunities",
    "list_opportunity_watches",
]

ITINERARY_INSTRUCTION = """Maintain trip records and booking follow-through. Called only after a
concrete plan exists — not for discovery or search tasks.

Creating trips:
1. create_trip with a descriptive name (e.g., "Portland Weekend Jun 5-7").
2. update_trip for each leg in order — do not skip any leg.
   - Road trips: type="road_trip", provider="personal_car" or "rental_car".
   - Flights: type="flight", provider=airline name.
3. After all legs: confirm the complete route by listing legs back to the user.
4. mark_trip_booked when user confirms they've booked.

Retrieving trips:
- list_trips → get_trip for detail on a specific trip.
- export_ics after a trip is finalized.

Price watching:
- watch_price: watch a specific flight price on a known route and date.
- watch_opportunities: broader opportunity alerts (deals, significant drops) across a trip.
- list_opportunity_watches: review active watches.

Use profile context only when saved preferences or booking history are needed to complete the
itinerary accurately."""

itinerary_agent = LlmAgent(
    name="itinerary_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    instruction=ITINERARY_INSTRUCTION,
    tools=[trvl_toolset(TOOLS)],
    after_tool_callback=shared_after_tool_callback,
)
