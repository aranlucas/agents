"""Viability agent."""
from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from utils import trvl_toolset, shared_after_tool_callback

TOOLS = ["assess_trip", "calculate_trip_cost", "check_visa", "calculate_points_value", "detect_travel_hacks", "optimize_booking", "optimize_trip_dates", "find_trip_window", "optimize_multi_city", "search_restaurants"]


VIABILITY_INSTRUCTION = """Assess trip feasibility and optimize cost, dates, and booking strategy.

Tool chain:
- calculate_trip_cost: primary cost estimate.
  → Over user budget: chain detect_travel_hacks then optimize_booking; present concrete savings.
- check_visa: run proactively for any international trip when destination and user nationality
  are known.
- calculate_points_value: when user has loyalty points; compare cash vs points.
  → Points redemption beats cash: recommend the points path explicitly.
- optimize_trip_dates: when dates are flexible and user wants the cheapest window.
- find_trip_window: when user has a date range but no specific dates.
  → Optimal dates returned: hand off to transport for specific flight search.
- optimize_multi_city: for multi-stop itineraries.
- detect_travel_hacks: proactively surface savings for any trip with a known route.
- optimize_booking: booking strategy and timing optimization.
- assess_trip: holistic go/no-go assessment combining cost, visa, and logistics.
- search_restaurants: when dining context is needed as part of trip planning.

Use profile context only when missing passport, budget, party size, or points materially affect
the verdict. Call out blockers and concrete next steps."""


viability_agent = LlmAgent(
    name="viability_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    after_tool_callback=shared_after_tool_callback,
    instruction=VIABILITY_INSTRUCTION,
    tools=[trvl_toolset(TOOLS)],
)
