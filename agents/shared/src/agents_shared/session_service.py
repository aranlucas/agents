"""Session service factory with injectable database dependencies."""

import os
from pathlib import Path
from typing import TYPE_CHECKING

from google.adk.sessions.database_session_service import DatabaseSessionService
from google.adk.sessions.sqlite_session_service import SqliteSessionService
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

if TYPE_CHECKING:
    from collections.abc import Mapping


def default_session_db_path() -> Path:
    return Path(__file__).resolve().parents[4] / ".data" / "adk_sessions.sqlite"


def _normalize_postgres_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://") :]
    return url


def _database_url(env: Mapping[str, str]) -> str | None:
    db_url = env.get("DATABASE_URL")
    if db_url:
        return _normalize_postgres_url(db_url)
    return None


def create_session_service() -> DatabaseSessionService | SqliteSessionService:
    db_url = _database_url(os.environ)
    if db_url:
        return DatabaseSessionService(db_url)

    db_path = Path(os.environ.get("ADK_SESSION_DB_PATH", str(default_session_db_path())))
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return SqliteSessionService(str(db_path))


def get_database_url() -> str | None:
    return _database_url(os.environ)


def get_sqlite_db_path() -> Path:
    db_path = Path(os.environ.get("ADK_SESSION_DB_PATH", str(default_session_db_path())))
    return db_path


async def check_database_connection() -> dict:
    db_url = get_database_url()
    if db_url:
        try:
            engine = create_async_engine(db_url)
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            await engine.dispose()
            return {"status": "ok", "database": "connected", "type": "postgres"}
        except Exception as e:
            return {"status": "degraded", "database": "error", "error": str(e), "type": "postgres"}

    db_path = get_sqlite_db_path()
    try:
        sqlite_url = f"sqlite+aiosqlite:///{db_path}"
        engine = create_async_engine(sqlite_url)
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        await engine.dispose()
        return {"status": "ok", "database": "connected", "type": "sqlite"}
    except Exception as e:
        return {"status": "degraded", "database": "error", "error": str(e), "type": "sqlite"}
