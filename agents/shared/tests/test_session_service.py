from pathlib import Path

import agents_shared.session_service as session_service
import pytest
from agents_shared.session_service import _normalize_postgres_url


def test_get_sqlite_db_path_default() -> None:
    path = session_service.get_sqlite_db_path()
    assert path.name == "adk_sessions.sqlite"
    assert path.parent.name == ".data"
    assert isinstance(path, Path)


def test_get_sqlite_db_path_uses_env_override(monkeypatch, tmp_path) -> None:
    db_path = tmp_path / "sessions.sqlite"
    monkeypatch.setenv("ADK_SESSION_DB_PATH", str(db_path))
    assert session_service.get_sqlite_db_path() == db_path


def test_normalize_postgres_url_passthrough_non_postgres() -> None:
    assert _normalize_postgres_url("sqlite:///test.db") == "sqlite:///test.db"
    assert _normalize_postgres_url("") == ""


def test_get_database_url_returns_none_when_not_set(monkeypatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert session_service.get_database_url() is None


def test_get_database_url_normalizes_postgres(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgres://user:pass@example/db")
    assert (
        session_service.get_database_url()
        == "postgresql+asyncpg://user:pass@example/db"
    )

    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@example/db")
    assert (
        session_service.get_database_url()
        == "postgresql+asyncpg://user:pass@example/db"
    )


@pytest.mark.asyncio
async def test_create_agent_services_prefers_d1_when_configured(monkeypatch) -> None:
    from agents_shared import dependencies
    from agents_shared.d1_session_service import D1SessionService

    monkeypatch.setenv("CF_ACCOUNT_ID", "acct123")
    monkeypatch.setenv("CF_API_TOKEN", "tok456")
    monkeypatch.setenv("CF_D1_DATABASE_ID", "db789")
    monkeypatch.delenv("CF_R2_BUCKET_NAME", raising=False)

    services = dependencies.create_agent_services()

    try:
        assert isinstance(services.session_service, D1SessionService)
        assert "acct123" in services.session_service._base
        assert "db789" in services.session_service._base
    finally:
        await services.engine.dispose()


@pytest.mark.asyncio
async def test_check_database_connection_reports_sqlite_error(
    monkeypatch, tmp_path
) -> None:
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
    monkeypatch.setattr(session_service, "_health_cache", None)

    result = await session_service.check_database_connection(FailingEngine())
    assert result["status"] == "degraded"
    assert result["database"] == "error"
    assert result["type"] == "sqlite"
