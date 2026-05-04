"""Discovery agent."""

from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from utils import trvl_toolset, shared_after_tool_callback

TOOLS = [
    "explore_destinations",
    "weekend_getaway",
    "suggest_dates",
    "search_dates",
    "search_deals",
    "destination_info",
    "travel_guide",
    "get_weather",
    "local_events",
    "nearby_places",
    "plan_trip",
]

DISCOVERY_INSTRUCTION = """Handle open-ended destination and date discovery for weekend trips from Seattle.
Called for any request where the destination is unspecified, flexible, or exploratory — including
queries mentioning "flights" without a known route.

Tool selection:
- explore_destinations: first choice for "where can I fly from X" or open price browsing; returns
  destinations sorted by price. If user wants detail on a result, enrich with destination_info or
  get_weather before presenting.
- weekend_getaway: curated flight+hotel bundles for exact departure/return dates. If user picks a
  destination, enrich with travel_guide or local_events before handing to transport/lodging.
- search_deals: price-driven browsing with flexible dates. If a deal looks strong, enrich with
  destination_info and pass to transport for specific flights.
- suggest_dates / search_dates: when destination is known but dates are flexible. Return optimal
  windows; hand off to transport for the actual flight search.
- destination_info / travel_guide / get_weather / local_events / nearby_places: enrich a chosen
  destination with context — use after a destination is selected, not before.
- plan_trip: broad multi-step plan when origin, destination, and dates are all known.

Use profile context only when missing personal defaults would materially change recommendations.
Present the strongest options with timing and trade-offs."""

discovery_agent = LlmAgent(
    name="discovery_agent",
    model=LiteLlm(model="mistral/mistral-medium-latest"),
    after_tool_callback=shared_after_tool_callback,
    instruction=DISCOVERY_INSTRUCTION,
    tools=[trvl_toolset(TOOLS)],
)
