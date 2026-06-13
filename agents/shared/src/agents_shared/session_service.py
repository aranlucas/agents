"""Session service factory with injectable database dependencies."""

import os
from pathlib import Path

from google.adk.sessions import BaseSessionService
from google.adk.sessions.database_session_service import DatabaseSessionService
from google.adk.sessions.sqlite_session_service import SqliteSessionService
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


def _normalize_postgres_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://") :]
    return url


def get_database_url() -> str | None:
    url = os.environ.get("DATABASE_URL")
    return _normalize_postgres_url(url) if url else None


def get_sqlite_db_path() -> Path:
    default = Path(__file__).resolve().parents[4] / ".data" / "adk_sessions.sqlite"
    return Path(os.environ.get("ADK_SESSION_DB_PATH", str(default)))


def create_session_service() -> BaseSessionService:
    url = get_database_url()
    if url:
        return DatabaseSessionService(url)

    path = get_sqlite_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    return SqliteSessionService(str(path))


async def check_database_connection() -> dict:
    url = get_database_url()
    engine_url = url or f"sqlite+aiosqlite:///{get_sqlite_db_path()}"
    db_type = "postgres" if url else "sqlite"

    try:
        engine = create_async_engine(engine_url)
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        await engine.dispose()
        return {"status": "ok", "database": "connected", "type": db_type}
    except Exception as e:
        return {"status": "degraded", "database": "error", "error": str(e), "type": db_type}
