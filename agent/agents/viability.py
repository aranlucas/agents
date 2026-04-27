"""Viability agent."""
from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from utils import trvl_toolset, shared_after_tool_callback

TOOLS = ["assess_trip", "calculate_trip_cost", "check_visa", "calculate_points_value", "detect_travel_hacks", "optimize_booking", "optimize_trip_dates", "find_trip_window", "optimize_multi_city", "search_restaurants"]


VIABILITY_INSTRUCTION = """Assess whether a trip is practical. Use viability tools for cost,
visa, points, restaurants, booking optimization, travel hacks, trip windows, date optimization, and
multi-city planning. Use profile context only when missing passport, budget, party size, points, or
personal constraints materially affect the verdict. Call out blockers and concrete next steps."""


viability_agent = LlmAgent(
    name="viability_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    after_tool_callback=shared_after_tool_callback,
    instruction=VIABILITY_INSTRUCTION,
    tools=[trvl_toolset(TOOLS)],
)
