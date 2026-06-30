"""Tests for D1SessionService.

All HTTP calls are mocked via pytest-mock / httpx respx-style patching using
httpx.MockTransport so no real D1 API is hit.
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from agents_shared.d1_session_service import (
    _DDL_STATEMENTS,
    D1SessionService,
    _merge_state,
    _stmt_upsert_app_state,
    _stmt_upsert_user_state,
)
from google.adk.errors.already_exists_error import AlreadyExistsError
from google.adk.events.event import Event
from google.adk.events.event_actions import EventActions
from google.adk.sessions.session import Session

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _svc() -> D1SessionService:
    svc = D1SessionService(
        account_id="acct",
        api_token="tok",  # noqa: S106 - placeholder token for tests
        database_id="db",
    )
    svc._tables_ready = True  # skip DDL in unit tests
    return svc


# ---------------------------------------------------------------------------
# Unit tests — helpers
# ---------------------------------------------------------------------------


def test_merge_state_combines_all_three() -> None:
    merged = _merge_state(
        app_state={"x": 1},
        user_state={"y": 2},
        session_state={"z": 3},
    )
    assert merged == {"z": 3, "app:x": 1, "user:y": 2}


def test_stmt_upsert_app_state_has_json_patch() -> None:
    stmt = _stmt_upsert_app_state("myapp", {"k": "v"})
    assert "json_patch" in stmt["sql"]
    assert stmt["params"] == ["myapp", '{"k": "v"}']


def test_stmt_upsert_user_state_has_json_patch() -> None:
    stmt = _stmt_upsert_user_state("myapp", "user1", {"k": "v"})
    assert "json_patch" in stmt["sql"]
    assert stmt["params"][0] == "myapp"
    assert stmt["params"][1] == "user1"


# ---------------------------------------------------------------------------
# _batch / _query
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_batch_uses_cloudflare_d1_query_api() -> None:
    svc = _svc()

    class FakeQueryResult:
        def __init__(self, results: list[dict[str, Any]]) -> None:
            self.results = results

    class FakePaginator:
        def __aiter__(self):
            self._items = iter([FakeQueryResult([{"value": 1}]), FakeQueryResult([])])
            return self

        async def __anext__(self):
            try:
                return next(self._items)
            except StopIteration as exc:
                raise StopAsyncIteration from exc

    query = MagicMock(return_value=FakePaginator())
    fake_client = MagicMock()
    fake_client.d1.database.query = query

    rows = await svc._batch(
        [
            {"sql": "SELECT ?", "params": [1]},
            {"sql": "UPDATE sessions SET update_time = ?", "params": [2]},
        ],
        client=fake_client,
    )

    query.assert_called_once_with(
        "db",
        account_id="acct",
        batch=[
            {"sql": "SELECT ?", "params": [1]},
            {"sql": "UPDATE sessions SET update_time = ?", "params": [2]},
        ],
    )
    assert rows == [[{"value": 1}], []]


@pytest.mark.asyncio
async def test_batch_raises_on_d1_error() -> None:
    svc = _svc()

    with (
        patch.object(
            svc, "_do_batch", AsyncMock(side_effect=RuntimeError("D1 batch failed"))
        ),
        pytest.raises(RuntimeError, match="D1 batch failed"),
    ):
        await svc._batch([{"sql": "SELECT 1"}])


@pytest.mark.asyncio
async def test_query_returns_empty_list_on_no_results() -> None:
    svc = _svc()
    with patch.object(svc, "_batch", AsyncMock(return_value=[])):
        rows = await svc._query("SELECT 1")
    assert rows == []


@pytest.mark.asyncio
async def test_ensure_tables_runs_ddl_once() -> None:
    svc = D1SessionService(
        account_id="acct",
        api_token="tok",  # noqa: S106 - placeholder token for tests
        database_id="db",
    )
    captured: list[list[dict[str, Any]]] = []

    async def fake_batch(stmts, *, client=None):
        captured.append(stmts)
        return [[] for _ in stmts]

    with patch.object(svc, "_batch", side_effect=fake_batch):
        await svc._ensure_tables()
        await svc._ensure_tables()

    assert len(captured) == 1
    assert [stmt["sql"] for stmt in captured[0]] == [
        ddl.strip() for ddl in _DDL_STATEMENTS
    ]


@pytest.mark.asyncio
async def test_state_helpers_decode_rows() -> None:
    svc = _svc()

    with patch.object(
        svc,
        "_query",
        AsyncMock(side_effect=[
            [{"state": json.dumps({"global": True})}],
            [{"state": json.dumps({"theme": "dark"})}],
        ]),
    ):
        app_state = await svc._get_app_state("myapp", MagicMock())
        user_state = await svc._get_user_state_db("myapp", "u1", MagicMock())

    assert app_state == {"global": True}
    assert user_state == {"theme": "dark"}


# ---------------------------------------------------------------------------
# create_session
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_session_returns_session_with_merged_state() -> None:
    svc = _svc()
    session_id = "sess-1"
    app_state_json = json.dumps({"score": 99})
    user_state_json = json.dumps({"pref": "dark"})

    # _query (duplicate check) → no rows
    # _batch (insert + state fetch) → [] empty app_state, [] empty user_state
    check_response: list[dict[str, Any]] = []
    write_app_rows: list[dict[str, Any]] = [{"state": app_state_json}]
    write_user_rows: list[dict[str, Any]] = [{"state": user_state_json}]

    call_count = 0

    async def fake_batch(stmts, *, client=None):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            # duplicate check
            return [check_response]
        # insert + app fetch + user fetch
        return [[] for _ in stmts[:-2]] + [write_app_rows, write_user_rows]

    with patch.object(svc, "_batch", side_effect=fake_batch):
        session = await svc.create_session(
            app_name="myapp",
            user_id="u1",
            session_id=session_id,
        )

    assert session.id == session_id
    assert session.app_name == "myapp"
    assert session.user_id == "u1"
    assert session.state.get("app:score") == 99
    assert session.state.get("user:pref") == "dark"
    assert session.events == []


@pytest.mark.asyncio
async def test_create_session_generates_id_and_persists_state_deltas() -> None:
    svc = _svc()
    captured_write: list[dict[str, Any]] = []

    async def fake_batch(stmts, *, client=None):
        if stmts[0]["sql"].startswith("SELECT 1"):
            return [[]]
        captured_write.extend(stmts)
        return (
            [[] for _ in stmts[:-2]]
            + [[{"state": json.dumps({"shared": "app"})}]]
            + [[{"state": json.dumps({"pref": "user"})}]]
        )

    with (
        patch.object(svc, "_batch", side_effect=fake_batch),
        patch("agents_shared.d1_session_service.platform_uuid.new_uuid", return_value="new-id"),
    ):
        session = await svc.create_session(
            app_name="myapp",
            user_id="u1",
            state={"app:shared": "app", "user:pref": "user", "local": 1},
        )

    assert session.id == "new-id"
    assert session.state == {
        "local": 1,
        "app:shared": "app",
        "user:pref": "user",
    }
    assert captured_write[0]["params"] == ["myapp", '{"shared": "app"}']
    assert captured_write[1]["params"] == ["myapp", "u1", '{"pref": "user"}']
    assert json.loads(captured_write[2]["params"][3]) == {"local": 1}


@pytest.mark.asyncio
async def test_create_session_raises_if_already_exists() -> None:
    svc = _svc()

    async def fake_batch(stmts, *, client=None):
        # Duplicate check returns a row
        return [[{"1": 1}]]

    with (
        patch.object(svc, "_batch", side_effect=fake_batch),
        pytest.raises(AlreadyExistsError),
    ):
        await svc.create_session(
            app_name="myapp",
            user_id="u1",
            session_id="existing",
        )


# ---------------------------------------------------------------------------
# get_session
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_session_returns_none_when_not_found() -> None:
    svc = _svc()

    async def fake_query(sql, params=None, *, client=None):
        return []

    with patch.object(svc, "_query", side_effect=fake_query):
        result = await svc.get_session(
            app_name="myapp", user_id="u1", session_id="missing"
        )
    assert result is None


@pytest.mark.asyncio
async def test_get_session_returns_session_with_events() -> None:
    svc = _svc()

    event = Event(
        invocation_id="inv1",
        author="user",
        timestamp=1.0,
    )
    event_json = event.model_dump_json(exclude_none=True)

    session_state = json.dumps({"local": "val"})
    app_state_json = json.dumps({})
    user_state_json = json.dumps({"pref": "light"})

    call_count = 0

    async def fake_query(sql, params=None, *, client=None):
        nonlocal call_count
        call_count += 1
        if "sessions" in sql and "state, update_time" in sql:
            return [{"state": session_state, "update_time": 100.0}]
        if "event_data" in sql:
            return [{"event_data": event_json}]
        if "app_state" in sql:
            return [{"state": app_state_json}]
        if "user_state" in sql:
            return [{"state": user_state_json}]
        return []

    with (
        patch.object(svc, "_get_app_state", AsyncMock(return_value={})),
        patch.object(
            svc, "_get_user_state_db", AsyncMock(return_value={"pref": "light"})
        ),
        patch.object(
            svc,
            "_query",
            AsyncMock(
                side_effect=[
                    [{"state": session_state, "update_time": 100.0}],
                    [{"event_data": event_json}],
                ]
            ),
        ),
    ):
        result = await svc.get_session(app_name="myapp", user_id="u1", session_id="s1")

    assert result is not None
    assert result.id == "s1"
    assert result.state.get("user:pref") == "light"
    assert len(result.events) == 1


@pytest.mark.asyncio
async def test_get_session_honors_zero_recent_events_config() -> None:
    svc = _svc()
    queries: list[str] = []

    async def fake_query(sql, params=None, *, client=None):
        queries.append(sql)
        if "sessions" in sql and "state, update_time" in sql:
            return [{"state": json.dumps({}), "update_time": 10.0}]
        return []

    from google.adk.sessions.base_session_service import GetSessionConfig

    with (
        patch.object(svc, "_query", side_effect=fake_query),
        patch.object(svc, "_get_app_state", AsyncMock(return_value={})),
        patch.object(svc, "_get_user_state_db", AsyncMock(return_value={})),
    ):
        result = await svc.get_session(
            app_name="myapp",
            user_id="u1",
            session_id="s1",
            config=GetSessionConfig(num_recent_events=0),
        )

    assert result is not None
    assert result.events == []
    assert not any("SELECT event_data" in sql for sql in queries)


@pytest.mark.asyncio
async def test_get_session_applies_event_filters() -> None:
    svc = _svc()
    event = Event(invocation_id="inv1", author="user", timestamp=2.0)
    captured_event_params: list[Any] = []

    async def fake_query(sql, params=None, *, client=None):
        nonlocal captured_event_params
        if "sessions" in sql and "state, update_time" in sql:
            return [{"state": json.dumps({}), "update_time": 10.0}]
        if "event_data" in sql:
            captured_event_params = params or []
            assert "AND timestamp >= ?" in sql
            assert "LIMIT ?" in sql
            return [{"event_data": event.model_dump_json(exclude_none=True)}]
        return []

    from google.adk.sessions.base_session_service import GetSessionConfig

    with (
        patch.object(svc, "_query", side_effect=fake_query),
        patch.object(svc, "_get_app_state", AsyncMock(return_value={})),
        patch.object(svc, "_get_user_state_db", AsyncMock(return_value={})),
    ):
        result = await svc.get_session(
            app_name="myapp",
            user_id="u1",
            session_id="s1",
            config=GetSessionConfig(after_timestamp=1.0, num_recent_events=1),
        )

    assert result is not None
    assert len(result.events) == 1
    assert captured_event_params == ["myapp", "u1", "s1", 1.0, 1]


# ---------------------------------------------------------------------------
# delete_session
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_session_sends_delete_sql() -> None:
    svc = _svc()
    captured: list[list[dict[str, Any]]] = []

    async def fake_batch(stmts, *, client=None):
        captured.append(stmts)
        return [[]]

    with patch.object(svc, "_batch", side_effect=fake_batch):
        await svc.delete_session(app_name="myapp", user_id="u1", session_id="s1")

    assert len(captured) == 1
    sql = captured[0][0]["sql"]
    assert "DELETE FROM sessions" in sql
    assert captured[0][0]["params"] == ["myapp", "u1", "s1"]


# ---------------------------------------------------------------------------
# get_user_state
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_user_state_returns_empty_when_not_found() -> None:
    svc = _svc()

    with patch.object(svc, "_get_user_state_db", AsyncMock(return_value={})):
        result = await svc.get_user_state(app_name="myapp", user_id="u1")

    assert result == {}


@pytest.mark.asyncio
async def test_append_event_raises_when_session_missing() -> None:
    svc = _svc()
    session = Session(
        app_name="myapp",
        user_id="u1",
        id="s1",
        state={},
        events=[],
        last_update_time=1.0,
    )
    event = Event(invocation_id="inv1", author="agent", timestamp=2.0)

    with (
        patch.object(svc, "_batch", AsyncMock(return_value=[[]])),
        pytest.raises(ValueError, match="Session s1 not found"),
    ):
        await svc.append_event(session, event)


# ---------------------------------------------------------------------------
# append_event — stale detection
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_append_event_raises_on_stale_session() -> None:
    svc = _svc()

    session = Session(
        app_name="myapp",
        user_id="u1",
        id="s1",
        state={},
        events=[],
        last_update_time=1.0,  # older than storage
    )
    event = Event(invocation_id="inv1", author="agent", timestamp=5.0)

    async def fake_batch(stmts, *, client=None):
        # Return storage update_time=99.0, which is newer than session.last_update_time=1.0
        return [[{"update_time": 99.0}]]

    with (
        patch.object(svc, "_batch", side_effect=fake_batch),
        pytest.raises(ValueError, match="stale session"),
    ):
        await svc.append_event(session, event)


@pytest.mark.asyncio
async def test_append_event_skips_partial_events() -> None:
    svc = _svc()
    session = Session(
        app_name="myapp",
        user_id="u1",
        id="s1",
        state={},
        events=[],
        last_update_time=1.0,
    )
    event = Event(invocation_id="inv1", author="agent", timestamp=2.0, partial=True)

    batch_calls: list = []
    with patch.object(
        svc, "_batch", AsyncMock(side_effect=lambda *a, **kw: batch_calls.append(a))
    ):
        result = await svc.append_event(session, event)

    assert result is event
    assert batch_calls == []  # no DB calls for partial events


@pytest.mark.asyncio
async def test_append_event_writes_event_and_all_state_deltas() -> None:
    svc = _svc()
    captured_write: list[dict[str, Any]] = []
    session = Session(
        app_name="myapp",
        user_id="u1",
        id="s1",
        state={},
        events=[],
        last_update_time=1.0,
    )
    event = Event(
        invocation_id="inv1",
        author="agent",
        timestamp=2.0,
        actions=EventActions(
            state_delta={
                "app:shared": "app",
                "user:pref": "user",
                "local": "session",
            }
        ),
    )

    async def fake_batch(stmts, *, client=None):
        if stmts[0]["sql"].startswith("SELECT update_time"):
            return [[{"update_time": 1.0}]]
        captured_write.extend(stmts)
        return [[] for _ in stmts]

    with patch.object(svc, "_batch", side_effect=fake_batch):
        result = await svc.append_event(session, event)

    assert result is event
    assert session.last_update_time == 2.0
    assert session.events == [event]
    assert captured_write[0]["params"] == ["myapp", '{"shared": "app"}']
    assert captured_write[1]["params"] == ["myapp", "u1", '{"pref": "user"}']
    assert "UPDATE sessions SET state = json_patch" in captured_write[2]["sql"]
    assert json.loads(captured_write[2]["params"][0]) == {"local": "session"}
    assert "INSERT INTO events" in captured_write[3]["sql"]


@pytest.mark.asyncio
async def test_append_event_updates_timestamp_without_session_delta() -> None:
    svc = _svc()
    captured_write: list[dict[str, Any]] = []
    session = Session(
        app_name="myapp",
        user_id="u1",
        id="s1",
        state={},
        events=[],
        last_update_time=1.0,
    )
    event = Event(invocation_id="inv1", author="agent", timestamp=2.0)

    async def fake_batch(stmts, *, client=None):
        if stmts[0]["sql"].startswith("SELECT update_time"):
            return [[{"update_time": 1.0}]]
        captured_write.extend(stmts)
        return [[] for _ in stmts]

    with patch.object(svc, "_batch", side_effect=fake_batch):
        await svc.append_event(session, event)

    assert "INSERT INTO events" in captured_write[0]["sql"]
    assert "UPDATE sessions SET update_time" in captured_write[1]["sql"]
    assert captured_write[1]["params"] == [2.0, "myapp", "u1", "s1"]


# ---------------------------------------------------------------------------
# list_sessions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_sessions_returns_empty_when_no_sessions() -> None:
    svc = _svc()

    with (
        patch.object(svc, "_query", AsyncMock(return_value=[])),
        patch.object(svc, "_get_app_state", AsyncMock(return_value={})),
    ):
        result = await svc.list_sessions(app_name="myapp")

    assert result.sessions == []


@pytest.mark.asyncio
async def test_list_sessions_merges_app_and_each_user_state() -> None:
    svc = _svc()

    async def fake_query(sql, params=None, *, client=None):
        if "FROM sessions" in sql:
            return [
                {
                    "id": "s1",
                    "user_id": "u1",
                    "state": json.dumps({"local": 1}),
                    "update_time": 2.0,
                }
            ]
        if "FROM user_state" in sql:
            return [{"user_id": "u1", "state": json.dumps({"pref": "dark"})}]
        return []

    with (
        patch.object(svc, "_query", side_effect=fake_query),
        patch.object(svc, "_get_app_state", AsyncMock(return_value={"global": True})),
    ):
        result = await svc.list_sessions(app_name="myapp")

    assert len(result.sessions) == 1
    assert result.sessions[0].state == {
        "local": 1,
        "app:global": True,
        "user:pref": "dark",
    }


@pytest.mark.asyncio
async def test_list_sessions_with_user_id_fetches_that_user_state() -> None:
    svc = _svc()

    async def fake_query(sql, params=None, *, client=None):
        assert params == ["myapp", "u1"]
        return [
            {
                "id": "s1",
                "user_id": "u1",
                "state": json.dumps({}),
                "update_time": 2.0,
            }
        ]

    with (
        patch.object(svc, "_query", side_effect=fake_query),
        patch.object(svc, "_get_app_state", AsyncMock(return_value={})),
        patch.object(svc, "_get_user_state_db", AsyncMock(return_value={"pref": "dark"})),
    ):
        result = await svc.list_sessions(app_name="myapp", user_id="u1")

    assert result.sessions[0].state == {"user:pref": "dark"}


# ---------------------------------------------------------------------------
# create_d1_session_service factory
# ---------------------------------------------------------------------------


def test_create_d1_session_service_reads_env(monkeypatch) -> None:
    monkeypatch.setenv("CF_ACCOUNT_ID", "acct123")
    monkeypatch.setenv("CF_API_TOKEN", "tok456")
    monkeypatch.setenv("CF_D1_DATABASE_ID", "db789")

    from agents_shared.session_service import create_d1_session_service

    svc = create_d1_session_service()
    assert isinstance(svc, D1SessionService)
    assert "acct123" in svc._base
    assert "db789" in svc._base
