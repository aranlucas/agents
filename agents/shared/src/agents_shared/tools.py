"""Shared ADK tool callbacks and small reusable tools/config."""

from __future__ import annotations

import datetime
import logging

from fastapi import Request
from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.workflow._retry_config import RetryConfig
from google.genai import types

log = logging.getLogger("agents_shared")

CLERK_USER_ID_HEADER = "x-clerk-user-id"

DEFAULT_RETRY_CONFIG = RetryConfig(
    max_attempts=5,
    initial_delay=1.0,
    max_delay=30.0,
    backoff_factor=2.0,
)

GEMINI_RETRY_OPTIONS = types.HttpRetryOptions(initial_delay=1, attempts=2)


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
                content.parts = [p for p in content.parts if not p.thought]
    return None


def on_model_error_callback(
    callback_context: CallbackContext,
    llm_request: LlmRequest,
    error: Exception,
) -> None:
    """Log model-call errors clearly (agent, model, error type) without swallowing.

    Returning None lets ADK proceed with its normal error/retry handling.
    """
    model = llm_request.model or "unknown"
    log.error(
        "Model call error in agent=%s model=%s: %s: %s",
        callback_context.agent_name,
        model,
        type(error).__name__,
        error,
    )
    return None


def stop_on_terminal_text(
    callback_context: CallbackContext,
    llm_response: LlmResponse,
) -> LlmResponse | None:
    """Terminate the ADK agentic loop when the model produces a final text turn.

    Without this guard, models that don't have a native loop-termination
    condition (Gemini Flash in particular) keep re-issuing the same tool call
    after a successful result. LiteLLM models (cerebras, mistral, etc.) can
    exhibit the same problem when the fallback chain lands on Gemini.

    Logic (mirrors CopilotKit's shared_chat.py):
    1. Skip partial streaming chunks — never terminate on a mid-stream event.
    2. Only act on finish_reason=STOP. LiteLLM maps both "stop" and "tool_calls"
       to FinishReason.STOP, so this is always set on the final chunk for our
       model pool. The guard also covers the Gemini-thinking double-chunk case:
       the first thought chunk has finish_reason=None, so we skip it and only
       fire on the final STOP chunk.
    3. Terminate (set end_invocation=True) when the response has text content
       and no pending function_call. If function calls are present the loop must
       continue so ADK can execute them; we return None and let it proceed.
    4. Access _invocation_context via a private ADK attribute — log-and-degrade
       gracefully if the attribute drifts in a future ADK release.
    """
    content = llm_response.content
    if not content or not content.parts:
        if llm_response.error_message:
            log.warning(
                "stop_on_terminal_text: model returned error for agent=%s: %s",
                callback_context.agent_name,
                llm_response.error_message,
            )
        return None

    if llm_response.partial:
        return None

    finish_reason = llm_response.finish_reason
    finish_reason_name = finish_reason.name if finish_reason is not None else None
    if finish_reason_name != "STOP" and finish_reason != "STOP":
        return None

    has_text = any(p.text for p in content.parts)
    has_function_call = any(p.function_call for p in content.parts)

    if content.role != "model" or not has_text or has_function_call:
        return None

    invocation_context = getattr(callback_context, "_invocation_context", None)
    if invocation_context is None:
        log.debug(
            "stop_on_terminal_text: no _invocation_context on callback_context; skipping."
        )
        return None

    try:
        invocation_context.end_invocation = True
    except AttributeError:
        log.debug(
            "stop_on_terminal_text: _invocation_context.end_invocation not writable; "
            "ADK private API may have changed."
        )
    return None
