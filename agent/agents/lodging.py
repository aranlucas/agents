"""Lodging agent."""
from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from utils import trvl_toolset, shared_after_tool_callback

TOOLS = ["search_hotels", "search_hotel_by_name", "hotel_rooms", "hotel_prices", "hotel_reviews", "detect_accommodation_hacks", "watch_room_availability"]


LODGING_INSTRUCTION = """Find and compare lodging options for travel.

Tool chain:
- search_hotels: primary search by location and dates.
  → After results: run hotel_prices on top 3 to compare providers; call out the best provider
    if prices differ significantly.
  → 0 results: suggest expanding the search area or adjusting dates.
- hotel_prices: provider-level pricing comparison; always run on top picks after search_hotels.
- hotel_reviews: fetch on demand or when user asks about quality/reputation.
- hotel_rooms: room-level detail; fetch on demand or for accessibility requirements.
- search_hotel_by_name: use when user names a specific property.
- detect_accommodation_hacks: run proactively after search_hotels; surface savings before the
  final recommendation.
- watch_room_availability: set when a preferred property is sold out for the requested dates.

Use profile context only when missing lodging preferences, budget, companions, or accessibility
needs would materially change the search. Highlight location, value, and constraints."""


lodging_agent = LlmAgent(
    name="lodging_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    after_tool_callback=shared_after_tool_callback,
    instruction=LODGING_INSTRUCTION,
    tools=[trvl_toolset(TOOLS)],
)
