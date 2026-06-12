from pathlib import Path

import pytest
from agents_shared import session_service
from agents_shared.session_service import (
    SessionServiceContainer,
    create_check_database,
    create_session_service,
)


def test_create_session_service_uses_sqlite_and_creates_parent(tmp_path) -> None:
    created = {}
    db_path = tmp_path / "nested" / "adk_sessions.sqlite"

    class FakeSqliteSessionService:
        def __init__(self, path: str) -> None:
            created["path"] = path

    container = SessionServiceContainer()
    container.env.override({"ADK_SESSION_DB_PATH": str(db_path)})
    container.sqlite_session_service.override(FakeSqliteSessionService)
    container.database_session_service.override(lambda *_args, **_kwargs: None)
    container.default_db_path.override(lambda: tmp_path / "unused.sqlite")
    service = create_session_service(container)
    assert isinstance(service, FakeSqliteSessionService)
    assert created["path"] == str(db_path)
    assert db_path.parent.exists()


def test_create_session_service_defaults_to_repo_data_path() -> None:
    default_path = session_service.default_session_db_path()
    assert default_path.name == "adk_sessions.sqlite"
    assert default_path.parent.name == ".data"
    assert isinstance(default_path, Path)


def test_database_url_normalizes_postgres_variants() -> None:
    assert session_service._database_url(
        {"ADK_SESSION_DB_URL": "postgres://user:pass@example/db"},
    ) == "postgresql+asyncpg://user:pass@example/db"
    assert session_service._database_url(
        {"ADK_SESSION_DB_URL": "postgresql://user:pass@example/db"},
    ) == "postgresql+asyncpg://user:pass@example/db"


def test_database_url_returns_existing_sqlite_turso_url() -> None:
    assert session_service._database_url(
        {"TURSO_DATABASE_URL": "sqlite+libsql://example.turso.io"},
    ) == "sqlite+libsql://example.turso.io"


def test_database_url_appends_secure_param_with_existing_query() -> None:
    assert session_service._database_url(
        {"TURSO_DATABASE_URL": "libsql://example.turso.io?foo=bar"},
    ) == "sqlite+libsql://example.turso.io?foo=bar&secure=true"


def test_database_kwargs_merges_auth_and_sync_tokens() -> None:
    assert session_service._database_kwargs(
        {
            "ADK_SESSION_DB_AUTH_TOKEN": "auth-token",
            "TURSO_SYNC_URL": "libsql://sync",
        },
    ) == {
        "connect_args": {
            "auth_token": "auth-token",
            "sync_url": "libsql://sync",
        },
    }


def test_get_sqlite_db_path_uses_env_override(monkeypatch, tmp_path) -> None:
    db_path = tmp_path / "sessions.sqlite"
    monkeypatch.setenv("ADK_SESSION_DB_PATH", str(db_path))
    assert session_service.get_sqlite_db_path() == db_path


def test_get_database_url_reads_environment(monkeypatch) -> None:
    monkeypatch.setenv("ADK_SESSION_DB_URL", "postgres://user:pass@example/db")
    assert (
        session_service.get_database_url()
        == "postgresql+asyncpg://user:pass@example/db"
    )


def test_create_session_service_uses_database_url_for_turso() -> None:
    captured = {}

    class FakeDatabaseSessionService:
        def __init__(self, db_url: str, **kwargs) -> None:
            captured["db_url"] = db_url
            captured["kwargs"] = kwargs

    container = SessionServiceContainer()
    container.env.override(
        {
            "ADK_SESSION_DB_URL": "sqlite+libsql://example.turso.io?secure=true",
            "TURSO_AUTH_TOKEN": "token-123",
        },
    )
    container.sqlite_session_service.override(lambda _path: None)
    container.database_session_service.override(FakeDatabaseSessionService)
    container.default_db_path.override(lambda: None)
    service = create_session_service(container)
    assert isinstance(service, FakeDatabaseSessionService)
    assert captured == {
        "db_url": "sqlite+libsql://example.turso.io?secure=true",
        "kwargs": {"connect_args": {"auth_token": "token-123"}},
    }


def test_create_session_service_normalizes_turso_database_url() -> None:
    captured = {}

    class FakeDatabaseSessionService:
        def __init__(self, db_url: str, **kwargs) -> None:
            captured["db_url"] = db_url
            captured["kwargs"] = kwargs

    container = SessionServiceContainer()
    container.env.override(
        {
            "TURSO_DATABASE_URL": "libsql://example.turso.io",
            "TURSO_AUTH_TOKEN": "token-123",
        },
    )
    container.sqlite_session_service.override(lambda _path: None)
    container.database_session_service.override(FakeDatabaseSessionService)
    container.default_db_path.override(lambda: None)
    create_session_service(container)
    assert captured == {
        "db_url": "sqlite+libsql://example.turso.io?secure=true",
        "kwargs": {"connect_args": {"auth_token": "token-123"}},
    }


def test_create_check_database_uses_container_provider() -> None:
    container = SessionServiceContainer()
    container.check_database_connection.override(lambda: {"status": "ok"})
    assert create_check_database(container)() == {"status": "ok"}


@pytest.mark.asyncio
async def test_check_database_connection_reports_sqlite_error(monkeypatch, tmp_path) -> None:
    class FailingConnection:
        async def __aenter__(self):
            raise RuntimeError("cannot connect")

        async def __aexit__(self, exc_type, exc, tb):
            return None

    class FailingEngine:
        def connect(self):
            return FailingConnection()

    monkeypatch.delenv("ADK_SESSION_DB_URL", raising=False)
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.setenv("ADK_SESSION_DB_PATH", str(tmp_path / "missing" / "db.sqlite"))
    monkeypatch.setattr(
        session_service,
        "create_async_engine",
        lambda _url, **_kwargs: FailingEngine(),
    )

    result = await session_service.check_database_connection()
    assert result["status"] == "degraded"
    assert result["database"] == "error"
    assert result["type"] == "sqlite"
