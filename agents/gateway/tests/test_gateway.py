import importlib
from collections import Counter
from collections.abc import AsyncIterator
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from agents_shared.telegram_auth import create_link_token
from fastapi import HTTPException
from fastapi.testclient import TestClient
from gateway import main
from gateway.telegram_link import ConsumeTelegramLinkRequest, consume_telegram_link
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine


def _route_paths(app) -> list[str]:
    """Collect all route paths, handling FastAPI's _IncludedRouter lazy wrapper."""
    paths = []
    for route in app.routes:
        if hasattr(route, "path"):
            paths.append(route.path)
        elif hasattr(route, "original_router") and hasattr(route, "include_context"):
            ic = route.include_context
            prefix = getattr(ic, "prefix", "") or ""
            for sub in route.original_router.routes:
                if hasattr(sub, "path"):
                    paths.append(prefix + sub.path)
    return paths


@pytest.fixture
async def engine(tmp_path) -> AsyncIterator[AsyncEngine]:
    db_path = tmp_path / "gateway.sqlite"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
    try:
        yield engine
    finally:
        await engine.dispose()


def test_mounts_every_agent():
    with TestClient(main.app) as client:  # noqa: F841 — triggers lifespan startup
        mounted = set(_route_paths(main.app))
    for prefix in (
        "/travel",
        "/grocery",
        "/fitness",
        "/wellness",
        "/trends",
        "/oralboards",
        "/resume",
    ):
        assert f"{prefix}/agui" in mounted
        assert f"{prefix}/health" in mounted


def test_standalone_a2ui_route_is_removed():
    with TestClient(main.app):
        mounted = set(_route_paths(main.app))
    assert "/a2ui/agui" not in mounted
    assert "/a2ui/health" not in mounted


def test_startup_does_not_mutate_route_table():
    """Route table must be identical across repeated startups (no duplicates)."""
    with TestClient(main.app):
        first_startup = _route_paths(main.app)
    with TestClient(main.app):
        second_startup = _route_paths(main.app)

    assert second_startup == first_startup


def test_agent_routes_are_unique_and_state_is_scoped():
    with TestClient(main.app):
        paths = _route_paths(main.app)
    duplicates = {path: count for path, count in Counter(paths).items() if count > 1}

    assert duplicates == {}
    assert "/agents/state" not in paths
    for prefix in (
        "/travel",
        "/grocery",
        "/fitness",
        "/wellness",
        "/trends",
        "/oralboards",
        "/resume",
    ):
        assert f"{prefix}/agents/state" in paths


def test_gateway_health():
    with TestClient(main.app) as client:
        body = client.get("/health").json()
    assert body["status"] in {"ok", "degraded"}


def test_subapp_health_reachable_under_prefix():
    with TestClient(main.app) as client:
        assert client.get("/travel/health").status_code == 200
        assert client.get("/grocery/health").status_code == 200
        assert client.get("/oralboards/health").status_code == 200


def test_gateway_is_only_otel_setup_call():
    repo_root = Path(__file__).resolve().parents[3]
    agent_main_files = [
        path
        for path in (repo_root / "agents").glob("*/src/*_agent/main.py")
        if path.parts[-3] != "gateway"
    ]

    offenders = [
        str(path.relative_to(repo_root))
        for path in agent_main_files
        if "setup_otel(" in path.read_text()
    ]

    assert offenders == []
    assert (
        "setup_otel(" in (repo_root / "agents/gateway/src/gateway/main.py").read_text()
    )


def test_agui_requires_token_when_clerk_auth_enabled(monkeypatch):
    monkeypatch.setenv(
        "CLERK_JWKS_URL",
        "https://example.clerk.accounts.dev/.well-known/jwks.json",
    )

    module = importlib.reload(main)
    with TestClient(module.app) as client:
        assert client.get("/health").status_code == 200
        assert client.post("/travel/agui", json={}).status_code == 401

    monkeypatch.delenv("CLERK_JWKS_URL")
    importlib.reload(main)


def test_resume_agui_is_public_with_auth_enabled(monkeypatch):
    monkeypatch.setenv(
        "CLERK_JWKS_URL",
        "https://example.clerk.accounts.dev/.well-known/jwks.json",
    )
    module = importlib.reload(main)
    with TestClient(module.app) as client:
        assert client.post("/resume/agui", json={}).status_code != 401

    monkeypatch.delenv("CLERK_JWKS_URL")
    importlib.reload(main)


def test_lifespan_starts_and_stops_telegram_bot_when_token_set(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123:fake_token")

    fake_updater = MagicMock()
    fake_updater.start_polling = AsyncMock()
    fake_updater.stop = AsyncMock()

    fake_ptb = MagicMock()
    fake_ptb.initialize = AsyncMock()
    fake_ptb.start = AsyncMock()
    fake_ptb.stop = AsyncMock()
    fake_ptb.shutdown = AsyncMock()
    fake_ptb.updater = fake_updater
    fake_ptb.bot = MagicMock()
    fake_ptb.bot.delete_webhook = AsyncMock()

    fake_runner = MagicMock()
    fake_runner.application = fake_ptb

    with (
        patch("telegram_bot.runner.build_telegram_runner", return_value=fake_runner),
        TestClient(main.app) as client,
    ):
        assert client.get("/health").status_code in {200, 503}

    fake_ptb.initialize.assert_called_once()
    fake_ptb.start.assert_called_once()
    fake_updater.start_polling.assert_called_once()
    fake_ptb.stop.assert_called_once()
    fake_updater.stop.assert_called_once()
    fake_ptb.shutdown.assert_called_once()


def test_telegram_link_consume_is_public_with_auth_enabled(monkeypatch):
    monkeypatch.setenv(
        "CLERK_JWKS_URL",
        "https://example.clerk.accounts.dev/.well-known/jwks.json",
    )
    monkeypatch.setenv("TELEGRAM_LINK_SECRET", "secret")
    module = importlib.reload(main)
    with TestClient(module.app) as client:
        response = client.post(
            "/telegram/link/consume",
            json={"token": "missing", "clerk_user_id": "clerk-user"},
        )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid link secret"

    monkeypatch.delenv("CLERK_JWKS_URL")
    monkeypatch.delenv("TELEGRAM_LINK_SECRET")
    importlib.reload(main)


@pytest.mark.asyncio
async def test_telegram_link_consume_rejects_invalid_token(
    engine: AsyncEngine,
    monkeypatch,
):
    monkeypatch.setenv("TELEGRAM_LINK_SECRET", "secret")
    request = ConsumeTelegramLinkRequest(
        token="missing",  # noqa: S106
        clerk_user_id="clerk-user",
    )

    with pytest.raises(HTTPException) as exc_info:
        await consume_telegram_link(
            request,
            SimpleNamespace(engine=engine),
            x_telegram_link_secret="secret",  # noqa: S106
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Invalid or expired link token"


@pytest.mark.asyncio
async def test_telegram_link_consume_returns_telegram_user_id(
    engine: AsyncEngine,
    monkeypatch,
):
    monkeypatch.setenv("TELEGRAM_LINK_SECRET", "secret")
    token = await create_link_token(
        engine,
        telegram_user_id="tg-user",
        telegram_chat_id="tg-chat",
    )

    with patch(
        "gateway.telegram_link.sync_link_to_clerk", new_callable=AsyncMock
    ) as sync_mock:
        response = await consume_telegram_link(
            ConsumeTelegramLinkRequest(token=token, clerk_user_id="clerk-user"),
            SimpleNamespace(engine=engine),
            x_telegram_link_secret="secret",  # noqa: S106
        )

    assert response == {"ok": True, "telegram_user_id": "tg-user"}
    sync_mock.assert_awaited_once_with(
        telegram_user_id="tg-user",
        clerk_user_id="clerk-user",
    )
