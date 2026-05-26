from starlette.datastructures import Headers


class Request:
    def __init__(self, headers: dict[str, str]):
        self.headers = Headers(headers)


def test_create_session_service_uses_sqlite_and_creates_parent(tmp_path, monkeypatch):
    import main

    db_path = tmp_path / "nested" / "adk_sessions.sqlite"
    monkeypatch.setenv("ADK_SESSION_DB_PATH", str(db_path))

    service = main.create_session_service()

    assert service.__class__.__name__ == "SqliteSessionService"
    assert db_path.parent.exists()


def test_extract_identity_state_includes_clerk_user_id():
    import main

    state = main.extract_identity_state(Request({"x-clerk-user-id": "user_123"}))

    assert state["user_id"] == "user_123"


def test_create_session_service_uses_database_url_for_turso(monkeypatch):
    import main

    captured = {}

    class FakeDatabaseSessionService:
        def __init__(self, db_url: str, **kwargs):
            captured["db_url"] = db_url
            captured["kwargs"] = kwargs

    monkeypatch.setattr(main, "DatabaseSessionService", FakeDatabaseSessionService)
    monkeypatch.setenv("ADK_SESSION_DB_URL", "sqlite+libsql://example.turso.io?secure=true")
    monkeypatch.setenv("TURSO_AUTH_TOKEN", "token-123")

    service = main.create_session_service()

    assert isinstance(service, FakeDatabaseSessionService)
    assert captured == {
        "db_url": "sqlite+libsql://example.turso.io?secure=true",
        "kwargs": {"connect_args": {"auth_token": "token-123"}},
    }


def test_create_session_service_normalizes_turso_database_url(monkeypatch):
    import main

    captured = {}

    class FakeDatabaseSessionService:
        def __init__(self, db_url: str, **kwargs):
            captured["db_url"] = db_url
            captured["kwargs"] = kwargs

    monkeypatch.setattr(main, "DatabaseSessionService", FakeDatabaseSessionService)
    monkeypatch.delenv("ADK_SESSION_DB_URL", raising=False)
    monkeypatch.setenv("TURSO_DATABASE_URL", "libsql://example.turso.io")
    monkeypatch.setenv("TURSO_AUTH_TOKEN", "token-123")

    main.create_session_service()

    assert captured == {
        "db_url": "sqlite+libsql://example.turso.io?secure=true",
        "kwargs": {"connect_args": {"auth_token": "token-123"}},
    }
