"""Shared ADK tool callbacks and small reusable tools/config."""

import datetime
import logging
from collections.abc import Callable

from fastapi import Request
from google.adk.agents.callback_context import CallbackContext
from google.adk.models.lite_llm import LiteLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.tools import ToolContext
from google.adk.workflow._retry_config import RetryConfig

log = logging.getLogger("agents_shared")

CLERK_USER_ID_HEADER = "x-clerk-user-id"

# Primary model uses an eager-HTTP provider (Cerebras) so 429/503 errors are
# raised at call time — before streaming starts — making the fallback chain
# work correctly. Gemini (deferred-HTTP) raises errors mid-stream where
# litellm.acompletion(fallbacks=[...]) can no longer intercept them.
_DEFAULT_MODEL = "cerebras/gpt-oss-120b"
_DEFAULT_FALLBACKS = [
    "groq/openai/gpt-oss-120b",
    "mistral/mistral-medium-latest",
    "nvidia_nim/deepseek-ai/deepseek-r1-0528-distill-llama-70b",
    "openrouter/openrouter/free",
    "gemini/gemini-3.5-flash",
]


def build_model() -> LiteLlm:
    """LiteLlm configured with the shared primary model + fallback chain."""
    return LiteLlm(model=_DEFAULT_MODEL, fallbacks=list(_DEFAULT_FALLBACKS))


# ADK-level retry layered on top of LiteLLM's fallback chain. Each attempt gives
# LiteLLM a chance to route through the configured providers, while the backoff
# keeps transient 429/5xx errors from immediately failing the turn.
DEFAULT_RETRY_CONFIG = RetryConfig(
    max_attempts=5,
    initial_delay=1.0,
    max_delay=30.0,
    backoff_factor=2.0,
)


def get_current_date() -> dict:
    """Return today's date (ISO 8601) plus weekday and month for scheduling."""
    today = datetime.datetime.now(datetime.UTC).date()
    return {
        "date": today.isoformat(),
        "weekday": today.strftime("%A"),
        "month": today.strftime("%B %Y"),
    }


def extract_identity_state(request: Request) -> dict[str, str]:
    """Map the Clerk user-id header into shared state (anonymous when absent)."""
    return {"user_id": request.headers.get(CLERK_USER_ID_HEADER) or "anonymous"}


def on_model_error_callback(
    callback_context: CallbackContext,
    llm_request: LlmRequest,
    error: Exception,
) -> None:
    """Log model-call errors clearly (agent, model, error type) without swallowing.

    Returning None lets ADK proceed with its normal error/retry handling.
    """
    model = getattr(llm_request, "model", None) or "unknown"
    log.error(
        "Model call error in agent=%s model=%s: %s: %s",
        getattr(callback_context, "agent_name", "unknown"),
        model,
        type(error).__name__,
        error,
    )
    return None


def make_mark_ready(
    tool_name: str,
    status_value: str,
    *,
    doc: str = "",
) -> Callable[[ToolContext, str], dict]:
    """Factory for the status-flip / review-summary tool duplicated across agents.

    Creates a named function that sets state["status"] = status_value and
    state["review_summary"] = summary, returning {"ok": True}.

    Args:
        tool_name: The function name ADK registers as the tool name.
        status_value: The value to write to state["status"].
        doc: Optional docstring for the generated tool.
    """

    def _mark_ready(tool_context: ToolContext, summary: str) -> dict:
        tool_context.state["status"] = status_value
        tool_context.state["review_summary"] = summary
        return {"ok": True}

    _mark_ready.__name__ = tool_name
    _mark_ready.__qualname__ = tool_name
    _mark_ready.__doc__ = (
        doc or f"Mark the plan as {status_value!r} and capture the review summary."
    )
    return _mark_ready
