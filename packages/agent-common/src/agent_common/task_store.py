"""Task store factory — persistent (PostgreSQL) or in-memory fallback."""

import os

from a2a.server.tasks import DatabaseTaskStore, InMemoryTaskStore

from agent_common.session_service import _database_url


def create_task_store():
    """Return a DatabaseTaskStore backed by Postgres when configured, else InMemoryTaskStore."""
    db_url = _database_url(os.environ)
    if db_url and db_url.startswith("postgresql+asyncpg://"):
        from sqlalchemy.ext.asyncio import create_async_engine

        return DatabaseTaskStore(create_async_engine(db_url))
    return InMemoryTaskStore()
