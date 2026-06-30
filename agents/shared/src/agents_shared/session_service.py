"""Session service factory with injectable database dependencies."""

import os
import time
from pathlib import Path

from google.adk.sessions import BaseSessionService
from google.adk.sessions.database_session_service import DatabaseSessionService
from google.adk.sessions.sqlite_session_service import SqliteSessionService
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

from .d1_session_service import D1SessionService

_HEALTH_CACHE_TTL = 5.0
_health_cache: tuple[float, dict[str, str]] | None = None


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


def create_d1_session_service() -> D1SessionService:
    return D1SessionService(
        account_id=os.environ["CF_ACCOUNT_ID"],
        api_token=os.environ["CF_API_TOKEN"],
        database_id=os.environ["CF_D1_DATABASE_ID"],
    )


def create_session_service() -> BaseSessionService:
    url = get_database_url()
    if url:
        return DatabaseSessionService(url)

    path = get_sqlite_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    return SqliteSessionService(str(path))


async def check_database_connection(engine: AsyncEngine) -> dict[str, str]:
    """Probe the database with a ``SELECT 1``; result is cached for 5 s."""
    global _health_cache
    now = time.monotonic()
    if _health_cache is not None and now - _health_cache[0] < _HEALTH_CACHE_TTL:
        return _health_cache[1]

    db_type = "postgres" if get_database_url() else "sqlite"

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        result: dict[str, str] = {
            "status": "ok",
            "database": "connected",
            "type": db_type,
        }
    except Exception as e:
        result = {
            "status": "degraded",
            "database": "error",
            "error": str(e),
            "type": db_type,
        }

    _health_cache = (now, result)
    return result
