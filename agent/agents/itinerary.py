"""Itinerary agent (no after_tool_callback needed)."""
from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from utils import ITINERARY_TOOLS, trvl_toolset

ITINERARY_INSTRUCTION = """Maintain trip records and booking follow-through. Use itinerary tools
to create, list, retrieve, update, mark booked, export calendars, and watch prices or rooms."""

itinerary_agent = LlmAgent(
    name="itinerary_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    instruction=ITINERARY_INSTRUCTION,
    tools=[trvl_toolset(ITINERARY_TOOLS)],
)
