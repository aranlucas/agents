from pathlib import Path

import pytest
from agents_shared import session_service


def test_default_session_db_path_has_correct_layout() -> None:
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


def test_get_database_connect_args_reads_environment(monkeypatch) -> None:
    monkeypatch.setenv("TURSO_AUTH_TOKEN", "token-123")
    monkeypatch.setenv("TURSO_SYNC_URL", "libsql://sync.turso.io")
    assert session_service.get_database_connect_args() == {
        "connect_args": {
            "auth_token": "token-123",
            "sync_url": "libsql://sync.turso.io",
        },
    }


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
