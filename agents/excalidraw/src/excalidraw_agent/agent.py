"""Excalidraw agent — collaborative whiteboard via MCP Apps."""

from ag_ui_adk import AGUIToolset
from agents_shared.state import make_state_initializer
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    build_model,
    on_model_error_callback,
)
from google.adk.agents import LlmAgent
from pydantic import BaseModel


class ExcalidrawState(BaseModel):
    user_id: str = ""


_INSTRUCTION = """\
You are a collaborative whiteboard assistant powered by Excalidraw.

When the user asks you to draw, diagram, visualize, or sketch anything, use the
Excalidraw MCP tools available to you to create an interactive drawing in the chat.

Tools available from the Excalidraw MCP:
- Use any drawing/diagram tool provided to create visual content.
- Always prefer calling an Excalidraw tool over describing what you would draw.

After creating a drawing, briefly describe what you created in 1-2 sentences.

If no drawing is needed (e.g. a simple question), just respond normally.
"""


def build_agent() -> LlmAgent:
    return LlmAgent(
        name="excalidraw_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        state_schema=ExcalidrawState,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(ExcalidrawState),
        tools=[AGUIToolset()],
    )
