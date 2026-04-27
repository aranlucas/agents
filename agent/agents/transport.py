"""Transport agent."""
from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from utils import trvl_toolset, shared_after_tool_callback

TOOLS = ["search_flights", "plan_flight_bundle", "find_interactive", "search_route", "search_ground", "search_airport_transfers", "get_baggage_rules", "search_lounges", "search_hidden_city", "search_awards"]

TRANSPORT_INSTRUCTION = """Plan transportation for trips from Seattle unless the user specifies
another origin. Use IATA airport codes for flights. Compare price, duration, stops, baggage, ground
transport, airport transfers, lounges, hidden-city opportunities, and award availability. Use profile
context only when the user has not supplied necessary personal defaults such as origin airport, airline
preferences, loyalty programs, bags, cabin, or accessibility constraints."""


transport_agent = LlmAgent(
    name="transport_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    after_tool_callback=shared_after_tool_callback,
    instruction=TRANSPORT_INSTRUCTION,
    tools=[trvl_toolset(TOOLS)],
)
