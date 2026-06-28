from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from agents_shared import telegram_auth
from agents_shared.telegram_auth import (
    _lookup_clerk_user_by_external_id,
    check_link_secret,
    consume_link_token,
    create_link_token,
    get_linked_clerk_user_id,
    unlink_telegram_user,
)
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine


@pytest.fixture
async def engine(tmp_path) -> AsyncIterator[AsyncEngine]:
    db_path = tmp_path / "telegram_auth.sqlite"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_link_token_is_one_time_and_creates_account_link(
    engine: AsyncEngine,
) -> None:
    token = await create_link_token(
        engine,
        telegram_user_id="tg-user",
        telegram_chat_id="tg-chat",
    )

    link = await consume_link_token(
        engine,
        token=token,
        clerk_user_id="clerk-user",
    )

    assert link is not None
    assert link.telegram_user_id == "tg-user"
    assert link.clerk_user_id == "clerk-user"
    assert (
        await get_linked_clerk_user_id(engine, telegram_user_id="tg-user")
        == "clerk-user"
    )
    assert (
        await consume_link_token(engine, token=token, clerk_user_id="second-user")
        is None
    )


@pytest.mark.asyncio
async def test_expired_link_token_is_rejected(engine: AsyncEngine) -> None:
    token = await create_link_token(
        engine,
        telegram_user_id="tg-user",
        telegram_chat_id="tg-chat",
        ttl_seconds=-1,
    )

    link = await consume_link_token(
        engine,
        token=token,
        clerk_user_id="clerk-user",
    )

    assert link is None
    assert await get_linked_clerk_user_id(engine, telegram_user_id="tg-user") is None


@pytest.mark.asyncio
async def test_unlink_revokes_existing_account_link(engine: AsyncEngine) -> None:
    token = await create_link_token(
        engine,
        telegram_user_id="tg-user",
        telegram_chat_id="tg-chat",
    )
    assert (
        await consume_link_token(engine, token=token, clerk_user_id="clerk-user")
        is not None
    )

    assert await unlink_telegram_user(engine, telegram_user_id="tg-user") is True
    assert await get_linked_clerk_user_id(engine, telegram_user_id="tg-user") is None
    assert await unlink_telegram_user(engine, telegram_user_id="tg-user") is False


@pytest.mark.asyncio
async def test_get_linked_clerk_user_id_falls_back_to_bapi_external_id(
    engine: AsyncEngine,
    monkeypatch,
) -> None:
    async def fake_lookup(
        tid: str, *, clerk_secret_key: str | None = None
    ) -> str | None:
        return "clerk-tma-user" if tid == "tg-tma-user" else None

    monkeypatch.setattr(telegram_auth, "_lookup_clerk_user_by_external_id", fake_lookup)

    result = await get_linked_clerk_user_id(engine, telegram_user_id="tg-tma-user")

    assert result == "clerk-tma-user"


@pytest.mark.asyncio
async def test_get_linked_clerk_user_id_bapi_fallback_returns_none_when_not_found(
    engine: AsyncEngine,
    monkeypatch,
) -> None:
    async def fake_lookup(
        tid: str, *, clerk_secret_key: str | None = None
    ) -> str | None:
        return None

    monkeypatch.setattr(telegram_auth, "_lookup_clerk_user_by_external_id", fake_lookup)

    assert await get_linked_clerk_user_id(engine, telegram_user_id="unknown") is None


@pytest.mark.asyncio
async def test_get_linked_clerk_user_id_skips_bapi_when_sqlite_row_exists(
    engine: AsyncEngine,
    monkeypatch,
) -> None:
    token = await create_link_token(
        engine, telegram_user_id="tg-user", telegram_chat_id="tg-chat"
    )
    await consume_link_token(engine, token=token, clerk_user_id="clerk-linked")

    bapi_calls: list[str] = []

    async def fake_lookup(
        tid: str, *, clerk_secret_key: str | None = None
    ) -> str | None:
        bapi_calls.append(tid)
        return None

    monkeypatch.setattr(telegram_auth, "_lookup_clerk_user_by_external_id", fake_lookup)

    result = await get_linked_clerk_user_id(engine, telegram_user_id="tg-user")

    assert result == "clerk-linked"
    assert bapi_calls == []


@pytest.mark.asyncio
async def test_lookup_by_external_id_returns_none_without_secret_key(
    monkeypatch,
) -> None:
    monkeypatch.delenv("CLERK_SECRET_KEY", raising=False)
    assert await _lookup_clerk_user_by_external_id("tg-123") is None


@pytest.mark.asyncio
async def test_lookup_by_external_id_returns_user_id_on_match(monkeypatch) -> None:
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_fake")
    mock_resp = MagicMock(is_success=True)
    mock_resp.json.return_value = [{"id": "user_abc", "external_id": "tg-123"}]
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    with patch(
        "agents_shared.telegram_auth.httpx.AsyncClient", return_value=mock_client
    ):
        result = await _lookup_clerk_user_by_external_id("tg-123")
    assert result == "user_abc"


@pytest.mark.asyncio
async def test_lookup_by_external_id_returns_none_on_http_error(monkeypatch) -> None:
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_fake")
    mock_resp = MagicMock(is_success=False)
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    with patch(
        "agents_shared.telegram_auth.httpx.AsyncClient", return_value=mock_client
    ):
        result = await _lookup_clerk_user_by_external_id("tg-123")
    assert result is None


@pytest.mark.asyncio
async def test_lookup_by_external_id_returns_none_when_list_empty(monkeypatch) -> None:
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_fake")
    mock_resp = MagicMock(is_success=True)
    mock_resp.json.return_value = []
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=mock_resp)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    with patch(
        "agents_shared.telegram_auth.httpx.AsyncClient", return_value=mock_client
    ):
        result = await _lookup_clerk_user_by_external_id("tg-unknown")
    assert result is None


def test_check_link_secret_uses_constant_time_compare(monkeypatch) -> None:
    monkeypatch.setenv("TELEGRAM_LINK_SECRET", "expected")

    assert check_link_secret("expected") is True
    assert check_link_secret("wrong") is False
    assert check_link_secret(None) is False


@pytest.mark.asyncio
async def test_credential_state_accepts_kroger_and_strava_provider_aliases(
    monkeypatch,
) -> None:
    calls: list[str] = []

    async def fake_fetch_clerk_oauth_token(
        *,
        clerk_user_id: str,
        provider: str,
        clerk_secret_key: str | None = None,
    ) -> str | None:
        del clerk_secret_key
        assert clerk_user_id == "clerk-user"
        calls.append(provider)
        return {
            "oauth_custom_shopping": "qfc-token",
            "oauth_custom_strava": "strava-token",
        }.get(provider)

    monkeypatch.setattr(
        telegram_auth,
        "fetch_clerk_oauth_token",
        fake_fetch_clerk_oauth_token,
    )

    credential_state = await telegram_auth.telegram_credential_state("clerk-user")

    assert credential_state.missing == ()
    assert credential_state.state["temp:kroger_token"] == "qfc-token"
    assert credential_state.state["temp:strava_token"] == "strava-token"
    assert calls == [
        "custom_shopping",
        "oauth_custom_shopping",
        "oauth_custom_strava",
    ]
