"""Profile agent."""
from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from utils import trvl_toolset, shared_after_tool_callback

TOOLS = ["get_preferences", "update_preferences", "build_profile", "add_booking", "onboard_profile", "interview_trip"]

PROFILE_INSTRUCTION = """Manage traveler preferences and profiles. Use profile tools to read,
update, build, onboard, interview, or add confirmed booking history. Keep outputs concise and reusable
by other travel specialists."""

profile_agent = LlmAgent(
    name="profile_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    instruction=PROFILE_INSTRUCTION,
    tools=[trvl_toolset(TOOLS)],
    after_tool_callback=shared_after_tool_callback,
)
