"""Profile agent."""

from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from utils import trvl_toolset, shared_after_tool_callback

TOOLS = [
    "get_preferences",
    "update_preferences",
    "build_profile",
    "add_booking",
    "onboard_profile",
    "interview_trip",
]

PROFILE_INSTRUCTION = """Manage traveler preferences and profile. Called only when the user
explicitly asks about their profile, or when a specialist needs a specific missing default.

Output contract: return only the specific fields requested, formatted as a flat key-value
summary the calling specialist can use directly. Do not return the full profile when only one
field is needed. Keep responses concise.

Tool selection:
- get_preferences: read current preferences; call before any write operation.
- update_preferences: targeted field updates after reading current state with get_preferences.
- build_profile: infer preferences from conversation context.
- onboard_profile: for users with no existing profile.
- interview_trip: structured interview to gather trip-specific context.
- add_booking: record a confirmed booking to update inferred preferences."""

profile_agent = LlmAgent(
    name="profile_agent",
    model=LiteLlm(model="mistral/mistral-medium-latest"),
    instruction=PROFILE_INSTRUCTION,
    tools=[trvl_toolset(TOOLS)],
    after_tool_callback=shared_after_tool_callback,
)
