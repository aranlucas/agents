"""Resume Q&A agent domain: instruction and state."""

from pathlib import Path

from ag_ui_adk import AGUIToolset
from agents_shared.state import make_state_initializer
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    build_model,
    on_model_error_callback,
    stop_on_terminal_text,
)
from google.adk.agents import LlmAgent
from pydantic import BaseModel

_RESUME = (Path(__file__).parent / "resume.md").read_text(encoding="utf-8")
_INSTRUCTION = (
    (Path(__file__).parent / "instructions.md")
    .read_text(encoding="utf-8")
    .replace("{{RESUME}}", _RESUME)
)


class ResumeState(BaseModel):
    """Default shared-state shape for the public resume agent."""

    user_id: str = ""


def build_agent() -> LlmAgent:
    return LlmAgent(
        name="resume_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        state_schema=ResumeState,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(ResumeState),
        tools=[AGUIToolset()],
    )


def build_eval_agent() -> LlmAgent:
    """Eval-compatible agent: no AGUIToolset, no state_schema.

    The resume agent has no domain tools beyond AGUIToolset, so the eval agent
    is a pure conversational agent that answers from its static instruction.
    """
    return LlmAgent(
        name="resume_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        static_instruction=_INSTRUCTION,
        tools=[],
    )


root_agent = build_eval_agent()
