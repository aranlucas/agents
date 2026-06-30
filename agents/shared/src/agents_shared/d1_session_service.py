"""Cloudflare D1 session service for ADK.

Implements BaseSessionService over the D1 REST API so Railway Python agents
can persist sessions to Cloudflare D1 instead of Postgres/SQLite.

Three env vars are required:
    CF_ACCOUNT_ID    — Cloudflare account ID
    CF_API_TOKEN     — API token with D1:Edit permission
    CF_D1_DATABASE_ID — Target D1 database ID
"""

from __future__ import annotations

import asyncio
import copy
import json
import logging
from typing import Any, cast, override

from cloudflare.types.d1.database_query_params import MultipleQueriesBatch
from google.adk.errors.already_exists_error import AlreadyExistsError
from google.adk.events.event import Event
from google.adk.platform import time as platform_time
from google.adk.platform import uuid as platform_uuid
from google.adk.sessions import _session_util
from google.adk.sessions.base_session_service import (
    BaseSessionService,
    GetSessionConfig,
    ListSessionsResponse,
)
from google.adk.sessions.session import Session
from google.adk.sessions.state import State

from cloudflare import APIStatusError, AsyncCloudflare

logger = logging.getLogger(__name__)

_DDL_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS sessions (
        app_name    TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        id          TEXT NOT NULL,
        state       TEXT NOT NULL DEFAULT '{}',
        create_time REAL NOT NULL,
        update_time REAL NOT NULL,
        PRIMARY KEY (app_name, user_id, id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS events (
        id            TEXT PRIMARY KEY,
        app_name      TEXT NOT NULL,
        user_id       TEXT NOT NULL,
        session_id    TEXT NOT NULL,
        invocation_id TEXT,
        timestamp     REAL NOT NULL,
        event_data    TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS app_state (
        app_name TEXT PRIMARY KEY,
        state    TEXT NOT NULL DEFAULT '{}'
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS user_state (
        app_name TEXT NOT NULL,
        user_id  TEXT NOT NULL,
        state    TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (app_name, user_id)
    )
    """,
]

# Per-(app, user, session) locks to prevent concurrent append_event races
# within the same process.
_session_locks: dict[tuple[str, str, str], asyncio.Lock] = {}
_session_locks_mu = asyncio.Lock()


def merge_state(
    app_state: dict[str, Any],
    user_state: dict[str, Any],
    session_state: dict[str, Any],
) -> dict[str, Any]:
    merged = copy.deepcopy(session_state)
    for k, v in app_state.items():
        merged[State.APP_PREFIX + k] = v
    for k, v in user_state.items():
        merged[State.USER_PREFIX + k] = v
    return merged


def _load_json_object(value: str) -> dict[str, Any]:
    loaded = json.loads(value)
    return cast(dict[str, Any], loaded)


def _stmt_upsert_app_state(app_name: str, delta: dict[str, Any]) -> dict[str, Any]:
    return {
        "sql": (
            "INSERT INTO app_state (app_name, state) VALUES (?, ?)"
            " ON CONFLICT(app_name) DO UPDATE SET"
            " state = json_patch(state, excluded.state)"
        ),
        "params": [app_name, json.dumps(delta)],
    }


def _stmt_upsert_user_state(
    app_name: str, user_id: str, delta: dict[str, Any]
) -> dict[str, Any]:
    return {
        "sql": (
            "INSERT INTO user_state (app_name, user_id, state) VALUES (?, ?, ?)"
            " ON CONFLICT(app_name, user_id) DO UPDATE SET"
            " state = json_patch(state, excluded.state)"
        ),
        "params": [app_name, user_id, json.dumps(delta)],
    }


class D1SessionService(BaseSessionService):
    """ADK session service backed by Cloudflare D1 (REST API)."""

    def __init__(self, account_id: str, api_token: str, database_id: str) -> None:
        self._account_id = account_id
        self._database_id = database_id
        self._client = AsyncCloudflare(api_token=api_token, timeout=30.0)
        self._base = f"accounts/{account_id}/d1/database/{database_id}"
        self._tables_ready = False
        self._tables_lock = asyncio.Lock()

    # ------------------------------------------------------------------ #
    # D1 REST helpers                                                       #
    # ------------------------------------------------------------------ #

    async def _batch(
        self,
        stmts: list[dict[str, Any]],
        *,
        client: AsyncCloudflare | None = None,
    ) -> list[list[dict[str, Any]]]:
        """Call Cloudflare's D1 query API with a batch payload."""
        return await self._do_batch(client or self._client, stmts)

    async def _do_batch(
        self, client: AsyncCloudflare, stmts: list[dict[str, Any]]
    ) -> list[list[dict[str, Any]]]:
        try:
            paginator = client.d1.database.query(
                self._database_id,
                account_id=self._account_id,
                batch=cast(list[MultipleQueriesBatch], stmts),
            )
            rows: list[list[dict[str, Any]]] = []
            async for result in paginator:
                rows.append(cast(list[dict[str, Any]], result.results or []))
            return rows
        except APIStatusError as exc:
            raise RuntimeError(f"D1 batch failed: {exc.response.text}") from exc

    async def _query(
        self,
        sql: str,
        params: list[Any] | None = None,
        *,
        client: AsyncCloudflare | None = None,
    ) -> list[dict[str, Any]]:
        """Single-statement convenience wrapper around _batch."""
        stmt: dict[str, Any] = {"sql": sql}
        if params:
            stmt["params"] = params
        results = await self._batch([stmt], client=client)
        return results[0] if results else []

    async def _ensure_tables(self) -> None:
        if self._tables_ready:
            return
        async with self._tables_lock:
            if self._tables_ready:
                return
            stmts = [{"sql": s.strip()} for s in _DDL_STATEMENTS]
            await self._batch(stmts)
            self._tables_ready = True

    # ------------------------------------------------------------------ #
    # State helpers                                                          #
    # ------------------------------------------------------------------ #

    async def _get_app_state(
        self, app_name: str, client: AsyncCloudflare
    ) -> dict[str, Any]:
        rows = await self._query(
            "SELECT state FROM app_state WHERE app_name = ?",
            [app_name],
            client=client,
        )
        return _load_json_object(rows[0]["state"]) if rows else {}

    async def _get_user_state_db(
        self, app_name: str, user_id: str, client: AsyncCloudflare
    ) -> dict[str, Any]:
        rows = await self._query(
            "SELECT state FROM user_state WHERE app_name = ? AND user_id = ?",
            [app_name, user_id],
            client=client,
        )
        return _load_json_object(rows[0]["state"]) if rows else {}

    # ------------------------------------------------------------------ #
    # BaseSessionService                                                    #
    # ------------------------------------------------------------------ #

    @override
    async def create_session(
        self,
        *,
        app_name: str,
        user_id: str,
        state: dict[str, Any] | None = None,
        session_id: str | None = None,
    ) -> Session:
        await self._ensure_tables()
        if session_id:
            session_id = session_id.strip()
        if not session_id:
            session_id = platform_uuid.new_uuid()
        now = platform_time.get_time()

        state_deltas = _session_util.extract_state_delta(state or {})
        app_delta = state_deltas["app"]
        user_delta = state_deltas["user"]
        session_state = state_deltas["session"]

        # Round trip 1: check for duplicate
        check = await self._query(
            "SELECT 1 FROM sessions WHERE app_name = ? AND user_id = ? AND id = ?",
            [app_name, user_id, session_id],
        )
        if check:
            raise AlreadyExistsError(f"Session with id {session_id} already exists.")

        # Round trip 2: insert + optional state upserts + fetch merged state
        stmts: list[dict[str, Any]] = []
        if app_delta:
            stmts.append(_stmt_upsert_app_state(app_name, app_delta))
        if user_delta:
            stmts.append(_stmt_upsert_user_state(app_name, user_id, user_delta))
        stmts.append(
            {
                "sql": (
                    "INSERT INTO sessions"
                    " (app_name, user_id, id, state, create_time, update_time)"
                    " VALUES (?, ?, ?, ?, ?, ?)"
                ),
                "params": [
                    app_name,
                    user_id,
                    session_id,
                    json.dumps(session_state),
                    now,
                    now,
                ],
            }
        )
        stmts.append(
            {
                "sql": "SELECT state FROM app_state WHERE app_name = ?",
                "params": [app_name],
            }
        )
        stmts.append(
            {
                "sql": "SELECT state FROM user_state WHERE app_name = ? AND user_id = ?",
                "params": [app_name, user_id],
            }
        )

        results = await self._batch(stmts)
        app_rows = results[-2]
        user_rows = results[-1]
        storage_app = _load_json_object(app_rows[0]["state"]) if app_rows else {}
        storage_user = _load_json_object(user_rows[0]["state"]) if user_rows else {}

        return Session(
            app_name=app_name,
            user_id=user_id,
            id=session_id,
            state=merge_state(storage_app, storage_user, session_state),
            events=[],
            last_update_time=now,
        )

    @override
    async def get_session(
        self,
        *,
        app_name: str,
        user_id: str,
        session_id: str,
        config: GetSessionConfig | None = None,
    ) -> Session | None:
        await self._ensure_tables()

        client = self._client
        session_rows = await self._query(
            "SELECT state, update_time FROM sessions"
            " WHERE app_name = ? AND user_id = ? AND id = ?",
            [app_name, user_id, session_id],
            client=client,
        )
        if not session_rows:
            return None
        session_state = _load_json_object(session_rows[0]["state"])
        last_update_time = session_rows[0]["update_time"]

        # Build events query
        parts = [
            "SELECT event_data FROM events",
            "WHERE app_name = ? AND user_id = ? AND session_id = ?",
        ]
        params: list[Any] = [app_name, user_id, session_id]

        if config and config.after_timestamp:
            parts.append("AND timestamp >= ?")
            params.append(config.after_timestamp)

        parts.append("ORDER BY timestamp DESC")

        if config and config.num_recent_events is not None:
            parts.append("LIMIT ?")
            params.append(config.num_recent_events)

        if config and config.num_recent_events == 0:
            event_rows: list[dict[str, Any]] = []
        else:
            event_rows = await self._query(" ".join(parts), params, client=client)

        app_state = await self._get_app_state(app_name, client)
        user_state = await self._get_user_state_db(app_name, user_id, client)

        events = [
            Event.model_validate_json(row["event_data"]) for row in reversed(event_rows)
        ]
        return Session(
            app_name=app_name,
            user_id=user_id,
            id=session_id,
            state=merge_state(app_state, user_state, session_state),
            events=events,
            last_update_time=last_update_time,
        )

    @override
    async def list_sessions(
        self, *, app_name: str, user_id: str | None = None
    ) -> ListSessionsResponse:
        await self._ensure_tables()

        client = self._client
        if user_id:
            session_rows = await self._query(
                "SELECT id, user_id, state, update_time FROM sessions"
                " WHERE app_name = ? AND user_id = ?",
                [app_name, user_id],
                client=client,
            )
        else:
            session_rows = await self._query(
                "SELECT id, user_id, state, update_time FROM sessions"
                " WHERE app_name = ?",
                [app_name],
                client=client,
            )

        app_state = await self._get_app_state(app_name, client)

        user_states: dict[str, dict[str, Any]] = {}
        if user_id:
            user_states[user_id] = await self._get_user_state_db(
                app_name, user_id, client
            )
        else:
            rows = await self._query(
                "SELECT user_id, state FROM user_state WHERE app_name = ?",
                [app_name],
                client=client,
            )
            for row in rows:
                user_states[row["user_id"]] = _load_json_object(row["state"])

        sessions = [
            Session(
                app_name=app_name,
                user_id=row["user_id"],
                id=row["id"],
                state=merge_state(
                    app_state,
                    user_states.get(row["user_id"], {}),
                    _load_json_object(row["state"]),
                ),
                events=[],
                last_update_time=row["update_time"],
            )
            for row in session_rows
        ]
        return ListSessionsResponse(sessions=sessions)

    @override
    async def delete_session(
        self, *, app_name: str, user_id: str, session_id: str
    ) -> None:
        await self._ensure_tables()
        await self._batch(
            [
                {
                    "sql": (
                        "DELETE FROM sessions"
                        " WHERE app_name = ? AND user_id = ? AND id = ?"
                    ),
                    "params": [app_name, user_id, session_id],
                }
            ]
        )

    @override
    async def get_user_state(self, *, app_name: str, user_id: str) -> dict[str, Any]:
        await self._ensure_tables()
        return await self._get_user_state_db(app_name, user_id, self._client)

    @override
    async def append_event(self, session: Session, event: Event) -> Event:
        if event.partial:
            return event

        self._apply_temp_state(session, event)
        event = self._trim_temp_delta_state(event)
        event_timestamp = event.timestamp

        await self._ensure_tables()

        # Process-level lock to serialize concurrent append_event calls
        # for the same session within this process.
        async with _session_locks_mu:
            key = (session.app_name, session.user_id, session.id)
            if key not in _session_locks:
                _session_locks[key] = asyncio.Lock()
            lock = _session_locks[key]

        async with lock:
            # Round trip 1: read current state for stale check
            read_results = await self._batch(
                [
                    {
                        "sql": (
                            "SELECT update_time FROM sessions"
                            " WHERE app_name = ? AND user_id = ? AND id = ?"
                        ),
                        "params": [session.app_name, session.user_id, session.id],
                    },
                ]
            )
            session_rows = read_results[0]
            if not session_rows:
                raise ValueError(f"Session {session.id} not found.")
            storage_update_time = session_rows[0]["update_time"]
            if storage_update_time > session.last_update_time:
                raise ValueError(
                    "The last_update_time provided in the session object is"
                    " earlier than the update_time in storage."
                    " Please check if it is a stale session."
                )

            # Round trip 2: write event + state deltas
            write_stmts: list[dict[str, Any]] = []
            has_session_delta = False

            if event.actions and event.actions.state_delta:
                state_deltas = _session_util.extract_state_delta(
                    event.actions.state_delta
                )
                app_delta = state_deltas["app"]
                user_delta = state_deltas["user"]
                session_delta = state_deltas["session"]

                if app_delta:
                    write_stmts.append(
                        _stmt_upsert_app_state(session.app_name, app_delta)
                    )
                if user_delta:
                    write_stmts.append(
                        _stmt_upsert_user_state(
                            session.app_name, session.user_id, user_delta
                        )
                    )
                if session_delta:
                    write_stmts.append(
                        {
                            "sql": (
                                "UPDATE sessions SET"
                                " state = json_patch(state, ?),"
                                " update_time = ?"
                                " WHERE app_name = ? AND user_id = ? AND id = ?"
                            ),
                            "params": [
                                json.dumps(session_delta),
                                event_timestamp,
                                session.app_name,
                                session.user_id,
                                session.id,
                            ],
                        }
                    )
                    has_session_delta = True

            write_stmts.append(
                {
                    "sql": (
                        "INSERT INTO events"
                        " (id, app_name, user_id, session_id, invocation_id, timestamp, event_data)"
                        " VALUES (?, ?, ?, ?, ?, ?, ?)"
                    ),
                    "params": [
                        event.id,
                        session.app_name,
                        session.user_id,
                        session.id,
                        event.invocation_id,
                        event.timestamp,
                        event.model_dump_json(exclude_none=True),
                    ],
                }
            )

            if not has_session_delta:
                write_stmts.append(
                    {
                        "sql": (
                            "UPDATE sessions SET update_time = ?"
                            " WHERE app_name = ? AND user_id = ? AND id = ?"
                        ),
                        "params": [
                            event_timestamp,
                            session.app_name,
                            session.user_id,
                            session.id,
                        ],
                    }
                )

            await self._batch(write_stmts)
            session.last_update_time = event_timestamp

        await super().append_event(session=session, event=event)
        return event
