"""Shared ADK tool callbacks and small reusable tools/config."""

from __future__ import annotations

import asyncio
import collections
import datetime
import logging
import time
from dataclasses import dataclass
from datetime import UTC
from typing import Any, override

import litellm
from fastapi import Request
from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.workflow._retry_config import RetryConfig
from litellm.integrations.custom_logger import CustomLogger
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

log = logging.getLogger("agents_shared")

# ---------------------------------------------------------------------------
# Rate limit configuration
# ---------------------------------------------------------------------------
# Limits for free-tier LLM providers per freellm.net data. Uses longest-prefix
# matching against LiteLLM model strings. 0 = unlimited for that dimension.


@dataclass
class RateLimit:
    rpm: int = 0
    rpd: int = 0


RATE_LIMITS: dict[str, RateLimit] = {
    "gemini/gemini-3.1-flash-lite": RateLimit(rpm=15, rpd=400),
    "gemini": RateLimit(rpm=4, rpd=16),
    "nvidia_nim": RateLimit(rpm=32),
    "cerebras/gpt-oss-120b": RateLimit(rpm=30, rpd=14400),
    "cerebras": RateLimit(rpm=10, rpd=100),
    "groq": RateLimit(rpm=30, rpd=1000),
    "openrouter": RateLimit(rpd=1000),
}


# ---------------------------------------------------------------------------
# Persistent daily counter (RPD) — backed by the shared database
# ---------------------------------------------------------------------------


class RateLimitExceeded(Exception):
    """Raised when a provider's daily rate limit has been reached."""


class RateLimitStore:
    """Atomic daily request counter backed by SQLite/Postgres.

    Used for RPD enforcement across process restarts. One row per
    (provider, model, utc_date), incremented atomically via INSERT … ON CONFLICT.
    """

    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def ensure_table(self) -> None:
        async with self._engine.begin() as conn:
            await conn.execute(
                text(
                    """\
CREATE TABLE IF NOT EXISTS rate_limit_daily (
    provider TEXT NOT NULL,
    model    TEXT NOT NULL DEFAULT '',
    utc_date TEXT NOT NULL,
    count    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (provider, model, utc_date)
)"""
                )
            )

    async def check_and_increment(
        self,
        provider: str,
        model: str,
        utc_date: str,
        rpd_limit: int,
    ) -> bool:
        """Atomically increment the daily counter if under *rpd_limit*.

        Returns True when the request is admitted (counter was bumped).
        Returns False when the daily limit is already reached.
        On DB error, degrades gracefully — logs the error and allows the
        request so transient failures don't block agent execution.
        """
        try:
            async with self._engine.begin() as conn:
                result = await conn.execute(
                    text(
                        "SELECT count FROM rate_limit_daily "
                        "WHERE provider = :p AND model = :m AND utc_date = :d"
                    ),
                    {"p": provider, "m": model, "d": utc_date},
                )
                row = result.scalar_one_or_none()
                if row is not None and row >= rpd_limit:
                    return False
                await conn.execute(
                    text(
                        """\
INSERT INTO rate_limit_daily (provider, model, utc_date, count)
VALUES (:p, :m, :d, 1)
ON CONFLICT (provider, model, utc_date)
DO UPDATE SET count = rate_limit_daily.count + 1"""
                    ),
                    {"p": provider, "m": model, "d": utc_date},
                )
                return True
        except Exception:
            log.exception("RateLimitStore: DB error, allowing request through")
            return True


_rate_limit_store: RateLimitStore | None = None


def set_rate_limit_engine(engine: AsyncEngine) -> None:
    """Wire the shared database into the provider throttle (called at gateway startup)."""
    global _rate_limit_store
    _rate_limit_store = RateLimitStore(engine)


# ---------------------------------------------------------------------------
# LiteLLM provider throttle (RPM + TPM in-memory, RPD via RateLimitStore)
# ---------------------------------------------------------------------------


class ProviderThrottle(CustomLogger):
    """Rate limiter for free-tier LLM providers.

    Tracks two dimensions:
      - RPM  — sliding 60 s window (in-memory)
      - RPD  — persistent daily counter (database-backed via RateLimitStore)

    Registered as a LiteLLM callback so *async_pre_call_hook* fires before
    every provider call. When a window is full, concurrent callers wait here
    rather than racing to a 429 mid-stream.
    """

    def __init__(self, limits: dict[str, RateLimit]) -> None:
        super().__init__()  # pyright: ignore[reportUnknownMemberType]
        self._lock = asyncio.Lock()
        self._limits = limits
        self._rpm_windows: dict[str, collections.deque[float]] = {}
        for key in limits:
            self._rpm_windows[key] = collections.deque()

    def _provider(self, model: str) -> str | None:
        m = model.lower()
        for prefix in sorted(self._limits, key=len, reverse=True):
            if m.startswith(prefix):
                return prefix
        return None

    def _prune(self, provider: str, now: float) -> None:
        if self._limits[provider].rpm > 0:
            rpm = self._rpm_windows[provider]
            while rpm and now - rpm[0] >= 60.0:
                rpm.popleft()

    @override
    async def async_pre_call_hook(
        self,
        user_api_key_dict: Any,
        cache: Any,
        data: dict[str, Any],
        call_type: Any,
    ) -> dict[str, Any]:
        # Strip reasoning_content that non-reasoning providers reject
        messages: list[Any] = data.get("messages") or []
        for message in messages:
            if isinstance(message, dict):
                message.pop("reasoning_content", None)

        provider = self._provider(str(data.get("model", "")))
        if not provider:
            return data

        limit = self._limits[provider]
        full_model = str(data.get("model", ""))

        # --- In-memory RPM check (inside lock, fast) ---
        while True:
            async with self._lock:
                now = time.monotonic()
                self._prune(provider, now)

                if limit.rpm > 0 and len(self._rpm_windows[provider]) >= limit.rpm:
                    wait = 60.0 - (now - self._rpm_windows[provider][0]) + 0.1
                else:
                    if limit.rpm > 0:
                        self._rpm_windows[provider].append(now)
                    break

            log.debug(
                "throttle: %s sleeping %.1fs",
                provider,
                wait,
            )
            await asyncio.sleep(wait)

        # --- Persistent RPD check (outside lock, DB handles atomicity) ---
        if limit.rpd > 0 and _rate_limit_store is not None:
            utc_date = datetime.datetime.now(UTC).strftime("%Y-%m-%d")
            ok = await _rate_limit_store.check_and_increment(
                provider,
                full_model,
                utc_date,
                limit.rpd,
            )
            if not ok:
                raise RateLimitExceeded(
                    f"Daily limit of {limit.rpd} requests reached for {provider} "
                    f"(model={full_model}, date={utc_date})"
                )

        return data


litellm.callbacks.append(ProviderThrottle(RATE_LIMITS))  # pyright: ignore[reportUnknownMemberType]

CLERK_USER_ID_HEADER = "x-clerk-user-id"

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

    if getattr(llm_response, "partial", False):
        return None

    finish_reason = getattr(llm_response, "finish_reason", None)
    finish_reason_name = (
        getattr(finish_reason, "name", None) if finish_reason is not None else None
    )
    if finish_reason_name != "STOP" and finish_reason != "STOP":
        return None

    has_text = any(getattr(p, "text", None) for p in content.parts)
    has_function_call = any(getattr(p, "function_call", None) for p in content.parts)

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
