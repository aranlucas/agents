"""Shared ADK tool callbacks and small reusable tools/config."""

import datetime
import logging

from fastapi import Request
from google.adk.agents.callback_context import CallbackContext
from google.adk.models import LlmRequest
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import ToolContext
from google.adk.workflow._retry_config import RetryConfig

log = logging.getLogger("agents_shared")

CLERK_USER_ID_HEADER = "x-clerk-user-id"

# Primary free model plus LiteLLM fallbacks, shared by every agent.
_DEFAULT_MODEL = "openrouter/poolside/laguna-m.1:free"
_DEFAULT_FALLBACKS = [
    "mistral/mistral-small-latest",
    "openrouter/owl-alpha",
    "nvidia_nim/deepseek-ai/deepseek-v4-flash",
]


def build_model() -> LiteLlm:
    """LiteLlm configured with the shared primary model + fallback chain."""
    return LiteLlm(model=_DEFAULT_MODEL, fallbacks=list(_DEFAULT_FALLBACKS))


# Modest ADK-level retry layered on top of each model's LiteLLM `fallbacks`.
# Retries the same model a couple of times with backoff before LiteLLM rotates
# to the next fallback model.
DEFAULT_RETRY_CONFIG = RetryConfig(
    max_attempts=3,
    initial_delay=1.0,
    max_delay=20.0,
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


def parse_tool_response(tool_response: dict | str) -> dict | str | None:
    try:
        if isinstance(tool_response, str):
            return tool_response
        return tool_response.get("structuredContent", tool_response.get("content", {}))
    except KeyError, TypeError, AttributeError:
        return None


def save_state(
    tool_context: ToolContext,
    tool_name: str,
    structured_content: object,
) -> None:
    try:
        tool_context.state[tool_name] = structured_content
    except TypeError:
        fallback_key = f"temp:tool_response:{tool_name}"
        log.debug(
            "State schema rejected tool response key %s; storing under %s",
            tool_name,
            fallback_key,
        )
        tool_context.state[fallback_key] = structured_content
