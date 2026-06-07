from unittest.mock import Mock

from a2a.server.tasks import InMemoryTaskStore
from agent_common import task_store


def test_create_task_store_uses_memory_without_postgres(monkeypatch) -> None:
    monkeypatch.setattr(task_store, "_database_url", lambda _env: None)
    assert isinstance(task_store.create_task_store(), InMemoryTaskStore)


def test_create_task_store_uses_database_for_postgres(monkeypatch) -> None:
    engine = object()
    database_store = object()
    monkeypatch.setattr(
        task_store,
        "_database_url",
        lambda _env: "postgresql+asyncpg://user:pass@example/db",
    )
    monkeypatch.setattr(
        "sqlalchemy.ext.asyncio.create_async_engine",
        lambda url: engine if url == "postgresql+asyncpg://user:pass@example/db" else None,
    )
    monkeypatch.setattr(task_store, "DatabaseTaskStore", Mock(return_value=database_store))
    assert task_store.create_task_store() is database_store
    task_store.DatabaseTaskStore.assert_called_once_with(engine)
