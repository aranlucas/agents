"""Session service factory with injectable database dependencies."""

import functools
import os
import time
from pathlib import Path

from google.adk.sessions import BaseSessionService
from google.adk.sessions.database_session_service import DatabaseSessionService
from google.adk.sessions.sqlite_session_service import SqliteSessionService
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

_HEALTH_CACHE_TTL = 5.0
_health_cache: tuple[float, dict] | None = None


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


@functools.lru_cache(maxsize=1)
def _health_engine():
    url = get_database_url() or f"sqlite+aiosqlite:///{get_sqlite_db_path()}"
    return create_async_engine(url)


def release_health_engine() -> None:
    """Clear the cached health engine and result — call on server shutdown."""
    global _health_cache
    _health_engine.cache_clear()
    _health_cache = None


async def check_database_connection() -> dict:
    global _health_cache
    now = time.monotonic()
    if _health_cache is not None and now - _health_cache[0] < _HEALTH_CACHE_TTL:
        return _health_cache[1]

    url = get_database_url()
    db_type = "postgres" if url else "sqlite"

    try:
        engine = _health_engine()
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        result: dict = {"status": "ok", "database": "connected", "type": db_type}
    except Exception as e:
        result = {
            "status": "degraded",
            "database": "error",
            "error": str(e),
            "type": db_type,
        }

    _health_cache = (now, result)
    return result
