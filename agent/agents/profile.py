"""Profile agent (no after_tool_callback needed)."""
from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from utils import PROFILE_TOOLS, trvl_toolset

PROFILE_INSTRUCTION = """Manage traveler preferences and profiles. Use profile tools to read,
update, build, onboard, or interview for preferences. Keep outputs concise and reusable by other
travel specialists."""

profile_agent = LlmAgent(
    name="profile_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    instruction=PROFILE_INSTRUCTION,
    tools=[trvl_toolset(PROFILE_TOOLS)],
)
