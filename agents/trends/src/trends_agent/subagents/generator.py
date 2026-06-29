from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    on_model_error_callback,
    stop_on_terminal_text,
    strip_thinking_before_model,
)
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from ..prompt import load_agent_instructions


def build_generator(model: str = "groq/llama-3.3-70b-versatile") -> LlmAgent:
    """SQL-generation agent.

    Called as an AgentTool by the root GoogleTrendsAgent. It receives the
    user's analytical question as a tool-call ``request`` string and returns
    a bounded BigQuery SQL query as its text response (also written to
    ``state["generated_sql"]`` via ``output_key`` so the parent session can
    see it through the AgentTool state-delta forwarding).
    """
    return LlmAgent(
        name="TrendsQueryGeneratorAgent",
        model=LiteLlm(model=model),
        retry_config=DEFAULT_RETRY_CONFIG,
        before_model_callback=strip_thinking_before_model,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        instruction=load_agent_instructions(),
        description="Generates bounded BigQuery SQL for a Google Trends analytical question.",
        output_key="generated_sql",
    )
