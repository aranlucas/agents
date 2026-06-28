"""Telegram account-linking helpers shared by the bot and gateway."""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import time
from dataclasses import dataclass

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

TELEGRAM_LINK_TOKEN_TTL_SECONDS = 10 * 60
CLERK_BAPI_BASE_URL = "https://api.clerk.com/v1"
KROGER_PROVIDERS = ("custom_shopping", "oauth_custom_shopping")
STRAVA_PROVIDERS = ("oauth_custom_strava", "custom_strava")


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
        return None
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(
            f"{CLERK_BAPI_BASE_URL}/users",
            params={"external_id": telegram_user_id, "limit": 1},
            headers={"Authorization": f"Bearer {secret_key}"},
        )
    if not response.is_success:
        return None
    users = response.json()
    if not isinstance(users, list) or not users:
        return None
    user = users[0]
    user_id = user.get("id") if isinstance(user, dict) else None
    return user_id if isinstance(user_id, str) and user_id else None


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
    url = f"{CLERK_BAPI_BASE_URL}/users/{clerk_user_id}/oauth_access_tokens/{provider}"
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            url, headers={"Authorization": f"Bearer {secret_key}"}
        )
    if response.status_code == 404:
        return None
    response.raise_for_status()
    payload = response.json()
    tokens = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(tokens, list) or not tokens:
        return None
    token_data = tokens[0]
    if not isinstance(token_data, dict):
        return None
    expires_at = token_data.get("expires_at") or token_data.get("expiresAt")
    if isinstance(expires_at, int | float) and expires_at * 1000 < time.time() * 1000:
        return None
    token = token_data.get("token")
    return token if isinstance(token, str) and token else None


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
