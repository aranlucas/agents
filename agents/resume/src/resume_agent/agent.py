"""Resume Q&A agent domain: instruction and state."""

from pathlib import Path

from ag_ui_adk import AGUIToolset
from agents_shared.state import make_state_initializer
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    on_model_error_callback,
    stop_on_terminal_text,
)
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from pydantic import BaseModel

_RESUME = (Path(__file__).parent / "resume.md").read_text(encoding="utf-8")
INSTRUCTION = (
    (Path(__file__).parent / "instructions.md")
    .read_text(encoding="utf-8")
    .replace("{{RESUME}}", _RESUME)
)


class ResumeState(BaseModel):
    """Default shared-state shape for the public resume agent."""

    user_id: str = ""


def _build_agent(*, include_agui: bool, model: str) -> LlmAgent:
    return LlmAgent(
        name="resume_agent",
        description="Public resume Q&A.",
        model=LiteLlm(model=model),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        state_schema=ResumeState,
        instruction=INSTRUCTION,
        before_agent_callback=make_state_initializer(ResumeState),
        tools=[AGUIToolset()] if include_agui else [],
    )


def build_agent() -> LlmAgent:
    return _build_agent(
        include_agui=True,
        model="openrouter/openai/gpt-oss-120b:free",
    )


def build_telegram_agent() -> LlmAgent:
    return _build_agent(
        include_agui=False,
        model="mistral/mistral-medium-latest",
    )


def build_eval_agent() -> LlmAgent:
    """Eval-compatible agent: no AGUIToolset, no state_schema.

    Uses Groq instead of the free OpenRouter tier so GEPA's parallel eval
    calls don't hit upstream 429s on the free rate-limited model.
    """
    return LlmAgent(
        name="resume_agent",
        description="Public resume Q&A.",
        model=LiteLlm(model="mistral/mistral-medium-latest"),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        static_instruction=INSTRUCTION,
        tools=[],
    )


root_agent = build_eval_agent()
