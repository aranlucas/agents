"""Session service factory with injectable database dependencies."""

import os
from pathlib import Path
from typing import TYPE_CHECKING

from ag_ui_adk.request_state_service import RequestStateSessionService
from dependency_injector import containers, providers
from google.adk.sessions.database_session_service import DatabaseSessionService
from google.adk.sessions.sqlite_session_service import SqliteSessionService
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from .invocation_state import set_invocation_temp_state

if TYPE_CHECKING:
    from collections.abc import Mapping


def default_session_db_path() -> Path:
    return Path(__file__).resolve().parents[4] / ".data" / "adk_sessions.sqlite"


def _database_session_service(db_url: str, **kwargs):
    return DatabaseSessionService(db_url, **kwargs)


def _normalize_postgres_url(url: str) -> str:
    """Rewrite bare postgresql:// or postgres:// to use the asyncpg async driver."""
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://") :]
    return url


def _database_url(env: Mapping[str, str]) -> str | None:
    db_url = env.get("ADK_SESSION_DB_URL")
    if db_url:
        return _normalize_postgres_url(db_url)

    turso_url = env.get("TURSO_DATABASE_URL")
    if not turso_url:
        return None
    if turso_url.startswith("sqlite+"):
        return turso_url

    separator = "&" if "?" in turso_url else "?"
    return f"sqlite+{turso_url}{separator}secure=true"


def _database_kwargs(env: Mapping[str, str]) -> dict:
    connect_args = {}
    auth_token = env.get("ADK_SESSION_DB_AUTH_TOKEN") or env.get("TURSO_AUTH_TOKEN")
    sync_url = env.get("TURSO_SYNC_URL")
    if auth_token:
        connect_args["auth_token"] = auth_token
    if sync_url:
        connect_args["sync_url"] = sync_url
    return {"connect_args": connect_args} if connect_args else {}


def _create_session_service(
    *,
    env: Mapping[str, str],
    sqlite_session_service,
    database_session_service,
    default_db_path,
):
    db_url = _database_url(env)
    if db_url:
        return database_session_service(db_url, **_database_kwargs(env))

    db_path = Path(env.get("ADK_SESSION_DB_PATH", default_db_path()))
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return sqlite_session_service(str(db_path))


def get_database_url() -> str | None:
    """Get the database URL that would be used by the session service."""
    return _database_url(os.environ)


def get_sqlite_db_path() -> Path:
    """Get the SQLite database path that would be used by the session service."""
    db_path = Path(os.environ.get("ADK_SESSION_DB_PATH", default_session_db_path()))
    return db_path


async def check_database_connection() -> dict:
    """Test database connectivity without creating a session."""
    db_url = get_database_url()
    if db_url:
        try:
            engine = create_async_engine(db_url, **_database_kwargs(os.environ))
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


class SessionServiceContainer(containers.DeclarativeContainer):
    env = providers.Object(os.environ)
    sqlite_session_service = providers.Object(SqliteSessionService)
    database_session_service = providers.Object(_database_session_service)
    default_db_path = providers.Object(default_session_db_path)

    session_service = providers.Factory(
        _create_session_service,
        env=env,
        sqlite_session_service=sqlite_session_service,
        database_session_service=database_session_service,
        default_db_path=default_db_path,
    )

    check_database_connection = providers.Callable(check_database_connection)


def create_session_service(container: SessionServiceContainer | None = None):
    container = container or SessionServiceContainer()
    return container.session_service()


def create_check_database(container: SessionServiceContainer | None = None):
    container = container or SessionServiceContainer()
    return container.check_database_connection()


class TempStateSessionService(RequestStateSessionService):
    """Sets invocation temp state when temp: keys are injected into a session."""

    def _inject(self, session, key):
        session = super()._inject(session, key)
        if session is not None:
            state = session.state
            state_dict = state.to_dict() if hasattr(state, "to_dict") else state
            temp = {
                k: v
                for k, v in state_dict.items()
                if isinstance(k, str) and k.startswith("temp:")
            }
            if temp:
                set_invocation_temp_state(temp)
        return session
