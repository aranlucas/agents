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
        {"DATABASE_URL": "postgres://user:pass@example/db"},
    ) == "postgresql+asyncpg://user:pass@example/db"
    assert session_service._database_url(
        {"DATABASE_URL": "postgresql://user:pass@example/db"},
    ) == "postgresql+asyncpg://user:pass@example/db"


def test_database_url_returns_none_when_not_set() -> None:
    assert session_service._database_url({}) is None


def test_get_sqlite_db_path_uses_env_override(monkeypatch, tmp_path) -> None:
    db_path = tmp_path / "sessions.sqlite"
    monkeypatch.setenv("ADK_SESSION_DB_PATH", str(db_path))
    assert session_service.get_sqlite_db_path() == db_path


def test_get_database_url_reads_environment(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgres://user:pass@example/db")
    assert (
        session_service.get_database_url()
        == "postgresql+asyncpg://user:pass@example/db"
    )


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

    monkeypatch.delenv("DATABASE_URL", raising=False)
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
