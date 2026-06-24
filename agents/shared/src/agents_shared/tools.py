"""Shared ADK tool callbacks and small reusable tools/config."""

import datetime
import logging

from fastapi import Request
from google.adk.agents.callback_context import CallbackContext
from google.adk.models.lite_llm import LiteLlm
from google.adk.models.llm_request import LlmRequest
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
    "nvidia_nim/deepseek-ai/deepseek-v4-flash",
    "openrouter/openrouter/free",
    "gemini/gemini-3.5-flash",
]

# A2UI model starts with Gemini — reliable for structured JSON catalog output
# and safe with reasoning_content in session history (unlike Cerebras/Groq which
# return 400 when thought=True parts are present). Cerebras/Groq/Mistral stay as
# fallbacks but Gemini's latency is far better than burning through Cerebras
# retries before reaching it.
_A2UI_PRIMARY = "gemini/gemini-2.5-flash"
_A2UI_FALLBACKS = [
    "mistral/mistral-medium-latest",
    _DEFAULT_MODEL,
]

# Fast model for agents that need low latency and no reasoning tokens —
# e.g. the oral-boards questioner and evaluator.
# Mistral Medium is primary: eager-HTTP (errors surface before streaming so the
# fallback chain works), no reasoning tokens, fast TTFT.
# Cerebras and Gemini are fallbacks; Gemini is last because it is deferred-HTTP
# (429s arrive mid-stream as MidStreamFallbackError, bypassing the fallback chain).
_FAST_PRIMARY = "mistral/mistral-medium-latest"
_FAST_FALLBACKS = [
    _DEFAULT_MODEL,
    "groq/openai/gpt-oss-120b",
    "gemini/gemini-2.5-flash",
]

# Large-context model for agents that read full document text into session
# history (e.g. case_builder, evaluator). Mistral Medium has 128k context and
# is eager-HTTP so 429/503 errors surface before streaming starts, keeping the
# fallback chain intact. NVIDIA NIM DeepSeek and Gemini 3.5 Flash are fallbacks.
_LARGE_CONTEXT_PRIMARY = "mistral/mistral-medium-latest"
_LARGE_CONTEXT_FALLBACKS = [
    "nvidia_nim/deepseek-ai/deepseek-v4-flash",
    "openrouter/openrouter/free",
    "gemini/gemini-3.5-flash",
]


def build_model() -> LiteLlm:
    """LiteLlm configured with the shared primary model + fallback chain."""
    return LiteLlm(model=_DEFAULT_MODEL, fallbacks=list(_DEFAULT_FALLBACKS))


def build_a2ui_model() -> LiteLlm:
    """LiteLlm for A2UI subagent calls.

    Gemini is primary: fast for structured JSON, handles reasoning_content in
    session history without 400 errors. Mistral and Cerebras are fallbacks only.
    """
    return LiteLlm(model=_A2UI_PRIMARY, fallbacks=list(_A2UI_FALLBACKS))


def build_fast_model() -> LiteLlm:
    """LiteLlm for low-latency agents that need no reasoning tokens.

    Mistral Medium is primary: eager-HTTP (rate-limit errors surface before
    streaming so the fallback chain works), no reasoning tokens, fast TTFT.
    Cerebras/Groq are next; Gemini Flash is last-resort only — it is
    deferred-HTTP so its 429s arrive mid-stream and bypass the fallback chain.
    """
    return LiteLlm(model=_FAST_PRIMARY, fallbacks=list(_FAST_FALLBACKS))


def build_large_context_model() -> LiteLlm:
    """LiteLlm for agents that make multiple model calls or read large documents.

    Mistral Medium is primary: 128k context window, eager-HTTP (errors surface
    before streaming so the fallback chain works). Use for case_builder and
    evaluator which call search_docs + read_doc in the same turn, easily
    exceeding Cerebras/Groq's context limit and Gemini's free-tier 5 RPM cap.
    """
    return LiteLlm(
        model=_LARGE_CONTEXT_PRIMARY, fallbacks=list(_LARGE_CONTEXT_FALLBACKS)
    )


# ADK-level retry layered on top of LiteLLM's fallback chain. Each attempt gives
# LiteLLM a chance to route through the configured providers, while the backoff
# keeps transient 429/5xx errors from immediately failing the turn.
DEFAULT_RETRY_CONFIG = RetryConfig(
    max_attempts=5,
    initial_delay=1.0,
    max_delay=30.0,
    backoff_factor=2.0,
)


def get_current_date() -> dict[str, str]:
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


def strip_thinking_before_model(
    callback_context: CallbackContext,
    llm_request: LlmRequest,
) -> None:
    """Strip thought=True parts from session history before each LLM call.

    Cerebras and Groq produce reasoning/thinking tokens stored as thought=True
    parts in session history. ADK's LiteLlm serialises these as
    reasoning_content in the OpenAI-format message body. Providers that don't
    support reasoning (Mistral, NVIDIA NIM, openrouter) reject such messages
    with HTTP 400, burning the entire fallback chain before reaching Gemini.

    Stripping here affects only the serialised history — not the current turn's
    reasoning. Returning None lets ADK proceed with the sanitised request.
    """
    if llm_request.contents:
        for content in llm_request.contents:
            if content.parts:
                content.parts = [
                    p for p in content.parts if not getattr(p, "thought", False)
                ]
    return None


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
