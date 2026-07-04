from collections.abc import AsyncIterator
from unittest.mock import MagicMock, patch

import agents_shared.telegram_auth as telegram_auth
import pytest
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


def _mock_clerk(users_list: list[MagicMock]) -> MagicMock:
    mock_clerk = MagicMock()
    mock_clerk.users.list.return_value = users_list
    mock_clerk.__enter__ = MagicMock(return_value=mock_clerk)
    mock_clerk.__exit__ = MagicMock(return_value=None)
    return mock_clerk


def _mock_clerk_user(
    user_id: str,
    *,
    private_metadata: dict[str, object] | None = None,
    external_id: str | None = None,
) -> MagicMock:
    user = MagicMock()
    user.id = user_id
    user.private_metadata = private_metadata or {}
    user.external_id = external_id
    return user


@pytest.mark.asyncio
async def test_lookup_by_external_id_returns_user_id_on_match(monkeypatch) -> None:
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_fake")
    mock_clerk = _mock_clerk([_mock_clerk_user("user_abc")])
    with patch("agents_shared.telegram_auth.Clerk", return_value=mock_clerk):
        result = await _lookup_clerk_user_by_external_id("tg-123")
    assert result == "user_abc"


@pytest.mark.asyncio
async def test_lookup_by_external_id_follows_linked_metadata_pointer(
    monkeypatch,
) -> None:
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_fake")
    shadow = _mock_clerk_user(
        "user_shadow",
        private_metadata={"linked_clerk_user_id": "user_real"},
    )
    mock_clerk = _mock_clerk([shadow])
    with patch("agents_shared.telegram_auth.Clerk", return_value=mock_clerk):
        result = await _lookup_clerk_user_by_external_id("tg-123")
    assert result == "user_real"


@pytest.mark.asyncio
async def test_lookup_by_external_id_returns_none_on_exception(monkeypatch) -> None:
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_fake")
    mock_clerk = MagicMock()
    mock_clerk.users.list.side_effect = Exception("network error")
    mock_clerk.__enter__ = MagicMock(return_value=mock_clerk)
    mock_clerk.__exit__ = MagicMock(return_value=None)
    with patch("agents_shared.telegram_auth.Clerk", return_value=mock_clerk):
        result = await _lookup_clerk_user_by_external_id("tg-123")
    assert result is None


@pytest.mark.asyncio
async def test_lookup_by_external_id_returns_none_when_list_empty(monkeypatch) -> None:
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_fake")
    mock_clerk = MagicMock()
    mock_clerk.users.list.return_value = []
    mock_clerk.__enter__ = MagicMock(return_value=mock_clerk)
    mock_clerk.__exit__ = MagicMock(return_value=None)
    with patch("agents_shared.telegram_auth.Clerk", return_value=mock_clerk):
        result = await _lookup_clerk_user_by_external_id("tg-unknown")
    assert result is None


@pytest.mark.asyncio
async def test_sync_link_to_clerk_stamps_shadow_user(monkeypatch) -> None:
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_fake")
    shadow = _mock_clerk_user("user_shadow")
    mock_clerk = _mock_clerk([shadow])
    with patch("agents_shared.telegram_auth.Clerk", return_value=mock_clerk):
        await telegram_auth.sync_link_to_clerk(
            telegram_user_id="tg-123", clerk_user_id="user_real"
        )
    mock_clerk.users.update_metadata.assert_called_once_with(
        user_id="user_shadow",
        private_metadata={"linked_clerk_user_id": "user_real"},
    )
    mock_clerk.users.update.assert_not_called()


@pytest.mark.asyncio
async def test_sync_link_to_clerk_claims_external_id_when_no_shadow(
    monkeypatch,
) -> None:
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_fake")
    mock_clerk = _mock_clerk([])
    mock_clerk.users.get.return_value = _mock_clerk_user("user_real")
    with patch("agents_shared.telegram_auth.Clerk", return_value=mock_clerk):
        await telegram_auth.sync_link_to_clerk(
            telegram_user_id="tg-123", clerk_user_id="user_real"
        )
    mock_clerk.users.update.assert_called_once_with(
        user_id="user_real", external_id="tg-123"
    )
    mock_clerk.users.update_metadata.assert_called_once_with(
        user_id="user_real",
        private_metadata={"linked_clerk_user_id": "user_real"},
    )


@pytest.mark.asyncio
async def test_sync_link_to_clerk_keeps_existing_external_id(monkeypatch) -> None:
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_fake")
    mock_clerk = _mock_clerk([])
    mock_clerk.users.get.return_value = _mock_clerk_user(
        "user_real", external_id="other-system-id"
    )
    with patch("agents_shared.telegram_auth.Clerk", return_value=mock_clerk):
        await telegram_auth.sync_link_to_clerk(
            telegram_user_id="tg-123", clerk_user_id="user_real"
        )
    mock_clerk.users.update.assert_not_called()
    mock_clerk.users.update_metadata.assert_not_called()


@pytest.mark.asyncio
async def test_sync_link_to_clerk_noop_without_secret(monkeypatch) -> None:
    monkeypatch.delenv("CLERK_SECRET_KEY", raising=False)
    with patch("agents_shared.telegram_auth.Clerk") as mock_clerk_cls:
        await telegram_auth.sync_link_to_clerk(
            telegram_user_id="tg-123", clerk_user_id="user_real"
        )
    mock_clerk_cls.assert_not_called()


@pytest.mark.asyncio
async def test_sync_unlink_to_clerk_clears_shadow_pointer(monkeypatch) -> None:
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_fake")
    shadow = _mock_clerk_user(
        "user_shadow",
        private_metadata={"linked_clerk_user_id": "user_real"},
    )
    mock_clerk = _mock_clerk([shadow])
    with patch("agents_shared.telegram_auth.Clerk", return_value=mock_clerk):
        await telegram_auth.sync_unlink_to_clerk(telegram_user_id="tg-123")
    mock_clerk.users.update_metadata.assert_called_once_with(
        user_id="user_shadow",
        private_metadata={"linked_clerk_user_id": None},
    )
    mock_clerk.users.update.assert_not_called()


@pytest.mark.asyncio
async def test_sync_unlink_to_clerk_releases_claimed_external_id(
    monkeypatch,
) -> None:
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_fake")
    owner = _mock_clerk_user(
        "user_real",
        private_metadata={"linked_clerk_user_id": "user_real"},
        external_id="tg-123",
    )
    mock_clerk = _mock_clerk([owner])
    with patch("agents_shared.telegram_auth.Clerk", return_value=mock_clerk):
        await telegram_auth.sync_unlink_to_clerk(telegram_user_id="tg-123")
    mock_clerk.users.update_metadata.assert_called_once_with(
        user_id="user_real",
        private_metadata={"linked_clerk_user_id": None},
    )
    mock_clerk.users.update.assert_called_once_with(
        user_id="user_real", external_id=None
    )


@pytest.mark.asyncio
async def test_sync_unlink_to_clerk_leaves_pure_shadow_user(monkeypatch) -> None:
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_fake")
    shadow = _mock_clerk_user("user_shadow")
    mock_clerk = _mock_clerk([shadow])
    with patch("agents_shared.telegram_auth.Clerk", return_value=mock_clerk):
        await telegram_auth.sync_unlink_to_clerk(telegram_user_id="tg-123")
    mock_clerk.users.update_metadata.assert_not_called()
    mock_clerk.users.update.assert_not_called()


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
        "oauth_custom_shopping",
        "oauth_custom_strava",
    ]
