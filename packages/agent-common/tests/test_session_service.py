from pathlib import Path

from agent_common.session_service import SessionServiceContainer, create_session_service


def test_create_session_service_uses_sqlite_and_creates_parent(tmp_path) -> None:
    created = {}
    db_path = tmp_path / "nested" / "adk_sessions.sqlite"

    class FakeSqliteSessionService:
        def __init__(self, path: str) -> None:
            created["path"] = path

    container = SessionServiceContainer()
    container.env.override({"ADK_SESSION_DB_PATH": str(db_path)})
    container.sqlite_session_service.override(FakeSqliteSessionService)
    container.database_session_service.override(lambda *_args, **_kwargs: None)
    container.default_db_path.override(lambda: tmp_path / "unused.sqlite")
    service = create_session_service(container)
    assert isinstance(service, FakeSqliteSessionService)
    assert created["path"] == str(db_path)
    assert db_path.parent.exists()


def test_create_session_service_defaults_to_repo_data_path() -> None:
    from agent_common import session_service

    default_path = session_service.default_session_db_path()
    assert default_path.name == "adk_sessions.sqlite"
    assert default_path.parent.name == ".data"
    assert isinstance(default_path, Path)


def test_create_session_service_uses_database_url_for_turso() -> None:
    captured = {}

    class FakeDatabaseSessionService:
        def __init__(self, db_url: str, **kwargs) -> None:
            captured["db_url"] = db_url
            captured["kwargs"] = kwargs

    container = SessionServiceContainer()
    container.env.override(
        {
            "ADK_SESSION_DB_URL": "sqlite+libsql://example.turso.io?secure=true",
            "TURSO_AUTH_TOKEN": "token-123",
        },
    )
    container.sqlite_session_service.override(lambda _path: None)
    container.database_session_service.override(FakeDatabaseSessionService)
    container.default_db_path.override(lambda: None)
    service = create_session_service(container)
    assert isinstance(service, FakeDatabaseSessionService)
    assert captured == {
        "db_url": "sqlite+libsql://example.turso.io?secure=true",
        "kwargs": {"connect_args": {"auth_token": "token-123"}},
    }


def test_create_session_service_normalizes_turso_database_url() -> None:
    captured = {}

    class FakeDatabaseSessionService:
        def __init__(self, db_url: str, **kwargs) -> None:
            captured["db_url"] = db_url
            captured["kwargs"] = kwargs

    container = SessionServiceContainer()
    container.env.override(
        {
            "TURSO_DATABASE_URL": "libsql://example.turso.io",
            "TURSO_AUTH_TOKEN": "token-123",
        },
    )
    container.sqlite_session_service.override(lambda _path: None)
    container.database_session_service.override(FakeDatabaseSessionService)
    container.default_db_path.override(lambda: None)
    create_session_service(container)
    assert captured == {
        "db_url": "sqlite+libsql://example.turso.io?secure=true",
        "kwargs": {"connect_args": {"auth_token": "token-123"}},
    }
