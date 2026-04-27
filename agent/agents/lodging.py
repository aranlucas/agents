"""Lodging agent."""
from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from utils import trvl_toolset, shared_after_tool_callback

TOOLS = ["search_hotels", "search_hotel_by_name", "hotel_rooms", "hotel_prices", "hotel_reviews", "detect_accommodation_hacks", "watch_room_availability"]


LODGING_INSTRUCTION = """Find and compare lodging options. Use lodging tools for hotel search,
room details, pricing, reviews, named properties, room availability watches, and accommodation hacks.
Use profile context only when missing lodging preferences, budget, companions, or accessibility needs
would materially change the search. Highlight location, value, and constraints."""


lodging_agent = LlmAgent(
    name="lodging_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    after_tool_callback=shared_after_tool_callback,
    instruction=LODGING_INSTRUCTION,
    tools=[trvl_toolset(TOOLS)],
)
