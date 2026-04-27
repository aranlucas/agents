"""Discovery agent."""
from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from utils import trvl_toolset, shared_after_tool_callback

TOOLS = ["weekend_getaway", "suggest_dates", "search_dates", "search_deals", "destination_info", "travel_guide", "get_weather", "local_events", "nearby_places", "search_natural", "plan_trip"]

DISCOVERY_INSTRUCTION = """Find destination and date ideas for weekend trips from Seattle. Use
discovery tools for natural-language planning, flexible dates, deals, destination context, weather,
events, nearby places, and broad trip plans. Use profile context only when missing personal defaults or
preferences would materially change the recommendations. Present the strongest options with timing and
tradeoffs."""


discovery_agent = LlmAgent(
    name="discovery_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    after_tool_callback=shared_after_tool_callback,
    instruction=DISCOVERY_INSTRUCTION,
    tools=[trvl_toolset(TOOLS)],
)
