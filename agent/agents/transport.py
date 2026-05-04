"""Transport agent."""

from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from utils import trvl_toolset, shared_after_tool_callback

TOOLS = [
    "search_flights",
    "plan_flight_bundle",
    "find_interactive",
    "search_route",
    "search_ground",
    "search_airport_transfers",
    "get_baggage_rules",
    "search_lounges",
    "search_hidden_city",
    "search_awards",
]

TRANSPORT_INSTRUCTION = """Search and compare transportation options for trips from Seattle unless
the user specifies another origin. Requires a known origin, destination, and date — if any are
missing, return to the concierge to ask rather than guessing.

Use IATA airport codes for all flight searches.

Tool selection:
- search_flights: primary tool for any specific route+date search.
  → 0 results or all options poor: fall back to find_interactive.
  → Results found + user has lounge access: chain search_lounges.
  → User has no checked bags: proactively surface search_hidden_city savings.
  → User mentions bags or carry-on: chain get_baggage_rules.
- find_interactive: flexible/constraint-relaxing search; present with which constraints were relaxed.
- plan_flight_bundle: multi-city or bundled itineraries.
- search_route: route overview across all transport modes.
- search_ground: ground transport between cities.
- search_airport_transfers: airport-specific transfers.
- get_baggage_rules: airline baggage allowances; chain after flight results when relevant.
- search_lounges: airport lounge access; chain when user has lounge cards in profile.
- search_hidden_city: hidden-city ticketing savings; only when user has no checked bags.
- search_awards: points/miles redemption on a specific route.

Use profile context only when the user has not supplied origin, airline preferences, loyalty
programs, bags, cabin class, or accessibility constraints."""


transport_agent = LlmAgent(
    name="transport_agent",
    model=LiteLlm(model="mistral/mistral-medium-latest"),
    after_tool_callback=shared_after_tool_callback,
    instruction=TRANSPORT_INSTRUCTION,
    tools=[trvl_toolset(TOOLS)],
)
