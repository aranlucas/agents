"""Rate limit subsystem: configuration, persistent daily counter, and LiteLLM throttle."""

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
    "cerebras": RateLimit(rpm=10, rpd=100),
    "groq": RateLimit(rpm=30, rpd=1000),
    "openrouter": RateLimit(rpm=20, rpd=1000),
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


def _strip_reasoning_messages(data: dict[str, Any]) -> None:
    messages: list[dict[str, Any]] = data.get("messages") or []
    for message in messages:
        message.pop("reasoning_content", None)
        message.pop("reasoning", None)


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
        self.message_logging = True
        self.turn_off_message_logging = False
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
        # Strip provider-specific reasoning metadata that LiteLLM providers reject.
        _strip_reasoning_messages(data)

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


litellm.callbacks.append(ProviderThrottle(RATE_LIMITS))
