"""Session service factory with injectable database dependencies."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Mapping

from dependency_injector import containers, providers
from google.adk.sessions.sqlite_session_service import SqliteSessionService


def default_session_db_path() -> Path:
    return Path(__file__).resolve().parents[4] / ".data" / "adk_sessions.sqlite"


def _database_session_service(db_url: str, **kwargs):
    from google.adk.sessions.database_session_service import DatabaseSessionService

    return DatabaseSessionService(db_url, **kwargs)


def _database_url(env: Mapping[str, str]) -> str | None:
    db_url = env.get("ADK_SESSION_DB_URL")
    if db_url:
        return db_url

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


def create_session_service(container: SessionServiceContainer | None = None):
    container = container or SessionServiceContainer()
    return container.session_service()
