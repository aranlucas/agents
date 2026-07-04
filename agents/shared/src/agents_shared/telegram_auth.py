"""Telegram account-linking helpers shared by the bot and gateway."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import os
import secrets
import time
from dataclasses import dataclass

from clerk_backend_api import Clerk
from clerk_backend_api.models import ClerkErrors
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

log = logging.getLogger(__name__)

TELEGRAM_LINK_TOKEN_TTL_SECONDS = 10 * 60
KROGER_PROVIDERS = ("oauth_custom_shopping", "custom_shopping")
STRAVA_PROVIDERS = ("oauth_custom_strava", "custom_strava")
LINKED_CLERK_USER_METADATA_KEY = "linked_clerk_user_id"


@dataclass(frozen=True)
class TelegramLink:
    telegram_user_id: str
    clerk_user_id: str


@dataclass(frozen=True)
class TelegramCredentialState:
    state: dict[str, object]
    missing: tuple[str, ...]


def _now() -> int:
    return int(time.time())


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def ensure_telegram_auth_tables(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """\
CREATE TABLE IF NOT EXISTS telegram_link_tokens (
    token_hash       TEXT PRIMARY KEY,
    telegram_user_id TEXT NOT NULL,
    telegram_chat_id TEXT NOT NULL,
    expires_at       INTEGER NOT NULL,
    used_at          INTEGER,
    created_at       INTEGER NOT NULL
)"""
            )
        )
        await conn.execute(
            text(
                """\
CREATE TABLE IF NOT EXISTS telegram_account_links (
    telegram_user_id TEXT PRIMARY KEY,
    clerk_user_id    TEXT NOT NULL,
    telegram_chat_id TEXT NOT NULL,
    linked_at        INTEGER NOT NULL,
    revoked_at       INTEGER
)"""
            )
        )


async def create_link_token(
    engine: AsyncEngine,
    *,
    telegram_user_id: str,
    telegram_chat_id: str,
    ttl_seconds: int = TELEGRAM_LINK_TOKEN_TTL_SECONDS,
) -> str:
    await ensure_telegram_auth_tables(engine)
    token = secrets.token_urlsafe(32)
    now = _now()
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """\
INSERT INTO telegram_link_tokens (
    token_hash, telegram_user_id, telegram_chat_id, expires_at, created_at
) VALUES (:token_hash, :telegram_user_id, :telegram_chat_id, :expires_at, :created_at)"""
            ),
            {
                "token_hash": _token_hash(token),
                "telegram_user_id": telegram_user_id,
                "telegram_chat_id": telegram_chat_id,
                "expires_at": now + ttl_seconds,
                "created_at": now,
            },
        )
    return token


async def consume_link_token(
    engine: AsyncEngine,
    *,
    token: str,
    clerk_user_id: str,
) -> TelegramLink | None:
    await ensure_telegram_auth_tables(engine)
    token_hash = _token_hash(token)
    now = _now()
    async with engine.begin() as conn:
        result = await conn.execute(
            text(
                """\
SELECT telegram_user_id, telegram_chat_id, expires_at, used_at
FROM telegram_link_tokens
WHERE token_hash = :token_hash"""
            ),
            {"token_hash": token_hash},
        )
        row = result.mappings().first()
        if row is None or row["used_at"] is not None or row["expires_at"] < now:
            return None

        await conn.execute(
            text(
                """\
UPDATE telegram_link_tokens
SET used_at = :used_at
WHERE token_hash = :token_hash"""
            ),
            {"used_at": now, "token_hash": token_hash},
        )
        await conn.execute(
            text(
                """\
INSERT INTO telegram_account_links (
    telegram_user_id, clerk_user_id, telegram_chat_id, linked_at, revoked_at
) VALUES (:telegram_user_id, :clerk_user_id, :telegram_chat_id, :linked_at, NULL)
ON CONFLICT (telegram_user_id)
DO UPDATE SET
    clerk_user_id = excluded.clerk_user_id,
    telegram_chat_id = excluded.telegram_chat_id,
    linked_at = excluded.linked_at,
    revoked_at = NULL"""
            ),
            {
                "telegram_user_id": row["telegram_user_id"],
                "clerk_user_id": clerk_user_id,
                "telegram_chat_id": row["telegram_chat_id"],
                "linked_at": now,
            },
        )
        return TelegramLink(
            telegram_user_id=str(row["telegram_user_id"]),
            clerk_user_id=clerk_user_id,
        )


async def _lookup_clerk_user_by_external_id(
    telegram_user_id: str,
    *,
    clerk_secret_key: str | None = None,
) -> str | None:
    secret_key = clerk_secret_key or os.getenv("CLERK_SECRET_KEY")
    if not secret_key:
        log.warning(
            "CLERK_SECRET_KEY is not set; cannot resolve Telegram user %s via Clerk",
            telegram_user_id,
        )
        return None

    def _fetch() -> str | None:
        with Clerk(bearer_auth=secret_key) as clerk:
            users = clerk.users.list(
                request={"external_id": [telegram_user_id], "limit": 1}
            )
            if not users:
                return None
            user = users[0]
            # A user found by external_id may be a Mini-App shadow account
            # (created by /api/telegram/auth with no OAuth connections). When
            # the web link flow stamped it with the real account's id, prefer
            # that so credential checks hit the account that owns the tokens.
            metadata = user.private_metadata or {}
            linked = metadata.get(LINKED_CLERK_USER_METADATA_KEY)
            if isinstance(linked, str) and linked:
                return linked
            return user.id or None

    try:
        return await asyncio.to_thread(_fetch)
    except Exception:
        log.warning(
            "Clerk external_id lookup failed for Telegram user %s",
            telegram_user_id,
            exc_info=True,
        )
        return None


async def get_linked_clerk_user_id(
    engine: AsyncEngine,
    *,
    telegram_user_id: str,
) -> str | None:
    await ensure_telegram_auth_tables(engine)
    async with engine.connect() as conn:
        result = await conn.execute(
            text(
                """\
SELECT clerk_user_id
FROM telegram_account_links
WHERE telegram_user_id = :telegram_user_id
  AND revoked_at IS NULL"""
            ),
            {"telegram_user_id": telegram_user_id},
        )
        clerk_user_id = result.scalar_one_or_none()
    if clerk_user_id is not None:
        return clerk_user_id
    return await _lookup_clerk_user_by_external_id(telegram_user_id)


async def sync_link_to_clerk(
    *,
    telegram_user_id: str,
    clerk_user_id: str,
    clerk_secret_key: str | None = None,
) -> None:
    """Mirror a Telegram link into Clerk so it survives database resets.

    The telegram_account_links table may live in ephemeral container storage,
    and the Mini App separately auto-creates a shadow Clerk user keyed by
    ``external_id == telegram_user_id`` that owns no OAuth connections. Without
    a durable pointer, losing the table silently resolves the sender to that
    shadow user and every credential check (Strava, Kroger) fails. Stamp the
    shadow user with the real account id — or claim the external_id on the
    real account when no shadow exists — so lookups keep resolving correctly.
    """
    secret_key = clerk_secret_key or os.getenv("CLERK_SECRET_KEY")
    if not secret_key:
        log.warning(
            "CLERK_SECRET_KEY is not set; Telegram link for user %s is only"
            " stored locally and will not survive a database reset",
            telegram_user_id,
        )
        return

    def _sync() -> None:
        with Clerk(bearer_auth=secret_key) as clerk:
            users = clerk.users.list(
                request={"external_id": [telegram_user_id], "limit": 1}
            )
            if users:
                owner = users[0]
                if owner.id and owner.id != clerk_user_id:
                    clerk.users.update_metadata(
                        user_id=owner.id,
                        private_metadata={
                            LINKED_CLERK_USER_METADATA_KEY: clerk_user_id
                        },
                    )
                return
            user = clerk.users.get(user_id=clerk_user_id)
            if not user.external_id:
                clerk.users.update(user_id=clerk_user_id, external_id=telegram_user_id)
                # Self-pointer marks the external_id as claimed by the link
                # flow, so sync_unlink_to_clerk knows it may release it.
                clerk.users.update_metadata(
                    user_id=clerk_user_id,
                    private_metadata={LINKED_CLERK_USER_METADATA_KEY: clerk_user_id},
                )

    try:
        await asyncio.to_thread(_sync)
    except Exception:
        log.warning(
            "Failed to mirror Telegram link into Clerk for user %s",
            telegram_user_id,
            exc_info=True,
        )


async def sync_unlink_to_clerk(
    *,
    telegram_user_id: str,
    clerk_secret_key: str | None = None,
) -> None:
    """Remove the Clerk-side mirror of a Telegram link, if one exists."""
    secret_key = clerk_secret_key or os.getenv("CLERK_SECRET_KEY")
    if not secret_key:
        return

    def _sync() -> None:
        with Clerk(bearer_auth=secret_key) as clerk:
            users = clerk.users.list(
                request={"external_id": [telegram_user_id], "limit": 1}
            )
            if not users or not users[0].id:
                return
            owner = users[0]
            metadata = owner.private_metadata or {}
            linked = metadata.get(LINKED_CLERK_USER_METADATA_KEY)
            if not linked:
                # Pure Mini-App shadow user that was never web-linked; its
                # external_id is its only tie to Telegram, so leave it alone.
                return
            clerk.users.update_metadata(
                user_id=owner.id,
                private_metadata={LINKED_CLERK_USER_METADATA_KEY: None},
            )
            if linked == owner.id:
                # The real account claimed the external_id at link time.
                clerk.users.update(user_id=owner.id, external_id=None)

    try:
        await asyncio.to_thread(_sync)
    except Exception:
        log.warning(
            "Failed to remove Clerk-side Telegram link for user %s",
            telegram_user_id,
            exc_info=True,
        )


async def unlink_telegram_user(
    engine: AsyncEngine,
    *,
    telegram_user_id: str,
) -> bool:
    await ensure_telegram_auth_tables(engine)
    async with engine.begin() as conn:
        result = await conn.execute(
            text(
                """\
UPDATE telegram_account_links
SET revoked_at = :revoked_at
WHERE telegram_user_id = :telegram_user_id
  AND revoked_at IS NULL"""
            ),
            {"telegram_user_id": telegram_user_id, "revoked_at": _now()},
        )
        return bool(result.rowcount)


def check_link_secret(value: str | None) -> bool:
    expected = os.getenv("TELEGRAM_LINK_SECRET")
    if not expected or not value:
        return False
    return hmac.compare_digest(value, expected)


async def fetch_clerk_oauth_token(
    *,
    clerk_user_id: str,
    provider: str,
    clerk_secret_key: str | None = None,
) -> str | None:
    secret_key = clerk_secret_key or os.getenv("CLERK_SECRET_KEY")
    if not secret_key:
        return None

    def _fetch() -> str | None:
        with Clerk(bearer_auth=secret_key) as clerk:
            try:
                res = clerk.users.get_o_auth_access_token(
                    user_id=clerk_user_id, provider=provider
                )
            except ClerkErrors as exc:
                log.warning(
                    "clerk oauth token ClerkErrors provider=%s: %s", provider, exc
                )
                return None
            except Exception as exc:
                log.warning("clerk oauth token error provider=%s: %s", provider, exc)
                return None
            log.debug(
                "clerk oauth token provider=%s result_count=%d",
                provider,
                len(res) if res else 0,
            )
            if not res:
                return None
            token_obj = res[0]
            expires_at = token_obj.expires_at
            if isinstance(expires_at, int | float) and expires_at < time.time():
                log.warning(
                    "clerk oauth token expired provider=%s expires_at=%s",
                    provider,
                    expires_at,
                )
                return None
            token = token_obj.token
            return token if token else None

    try:
        return await asyncio.to_thread(_fetch)
    except Exception as exc:
        log.warning(
            "fetch_clerk_oauth_token thread error provider=%s: %s", provider, exc
        )
        return None


async def telegram_credential_state(clerk_user_id: str) -> TelegramCredentialState:
    kroger_token = None
    for provider in KROGER_PROVIDERS:
        kroger_token = await fetch_clerk_oauth_token(
            clerk_user_id=clerk_user_id,
            provider=provider,
        )
        if kroger_token:
            break
    strava_token = None
    for provider in STRAVA_PROVIDERS:
        strava_token = await fetch_clerk_oauth_token(
            clerk_user_id=clerk_user_id,
            provider=provider,
        )
        if strava_token:
            break

    state: dict[str, object] = {
        "user_id": clerk_user_id,
        "kroger_connected": bool(kroger_token),
        "strava_connected": bool(strava_token),
    }
    missing: list[str] = []
    if kroger_token:
        state["temp:kroger_token"] = kroger_token
    else:
        missing.append("Kroger/QFC")
    if strava_token:
        state["temp:strava_token"] = strava_token
    else:
        missing.append("Strava")
    return TelegramCredentialState(state=state, missing=tuple(missing))
