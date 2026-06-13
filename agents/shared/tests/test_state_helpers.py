"""Tests for the shared state-initializer / instruction / extractor factories."""

import asyncio
from types import SimpleNamespace

from agents_shared.state import (
    KROGER_AUTH,
    STRAVA_AUTH,
    TokenAuth,
    make_extract_state,
    make_state_initializer,
)
from pydantic import BaseModel


class DemoState(BaseModel):
    status: str = "idle"
    plan: str = ""
    kroger_connected: bool = False


def test_initializer_backfills_missing_keys_only():
    init = make_state_initializer(DemoState)
    ctx = SimpleNamespace(state={"status": "ready"})
    init(ctx)
    assert ctx.state["status"] == "ready"  # existing value untouched
    assert ctx.state["plan"] == ""
    assert ctx.state["kroger_connected"] is False


def test_initializer_flips_connected_flag_from_temp_token():
    init = make_state_initializer(
        DemoState, token_flags={"temp:kroger_token": "kroger_connected"}
    )
    ctx = SimpleNamespace(state={"temp:kroger_token": "tok"})
    init(ctx)
    assert ctx.state["kroger_connected"] is True


def test_extract_state_identity_only():
    extract = make_extract_state()
    request = SimpleNamespace(headers={"x-clerk-user-id": "user_1"})
    state = asyncio.run(extract(request, None))
    assert state == {"user_id": "user_1"}


def test_extract_state_with_token_auth():
    extract = make_extract_state(KROGER_AUTH, STRAVA_AUTH)
    request = SimpleNamespace(
        headers={"x-clerk-user-id": "user_1", "x-kroger-access-token": "ktok"}
    )
    state = asyncio.run(extract(request, None))
    assert state["user_id"] == "user_1"
    assert state["kroger_connected"] is True
    assert state["temp:kroger_token"] == "ktok"
    assert state["strava_connected"] is False
    assert "temp:strava_token" not in state


def test_token_auth_constants():
    assert TokenAuth(
        "x-kroger-access-token", "temp:kroger_token", "kroger_connected"
    ) == KROGER_AUTH
    assert TokenAuth(
        "x-strava-access-token", "temp:strava_token", "strava_connected"
    ) == STRAVA_AUTH


def test_extract_state_strava_token_present():
    extract = make_extract_state(STRAVA_AUTH)
    request = SimpleNamespace(headers={"x-strava-access-token": "stok"})
    state = asyncio.run(extract(request, None))
    assert state["strava_connected"] is True
    assert state["temp:strava_token"] == "stok"
