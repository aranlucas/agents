"""TempStateSessionService forwards temp: keys into invocation temp state."""

import pytest
from agents_shared.invocation_state import (
    get_invocation_temp,
    set_invocation_temp_state,
)
from agents_shared.session_service import TempStateSessionService


class _FakeSession:
    def __init__(self, state):
        self.state = state


@pytest.fixture(autouse=True)
def _reset_invocation_temp_state():
    """Reset the invocation temp contextvar before and after each test."""
    set_invocation_temp_state(None)
    yield
    set_invocation_temp_state(None)


def test_inject_forwards_temp_keys():
    # Use __new__ and manually set _pending_temp_state so super()._inject works.
    # super()._inject only reads self._pending_temp_state; no other instance state needed.
    svc = TempStateSessionService.__new__(TempStateSessionService)
    svc._pending_temp_state = {}

    session = _FakeSession({"temp:kroger_token": "tok-123", "user_id": "u1"})
    # key is a (app_name, user_id, session_id) tuple — pass a dummy since no pending state is set
    result = TempStateSessionService._inject(svc, session, ("app", "user", "session"))
    assert result is session
    assert get_invocation_temp("temp:kroger_token", {}) == "tok-123"


def test_inject_ignores_non_temp_keys():
    svc = TempStateSessionService.__new__(TempStateSessionService)
    svc._pending_temp_state = {}

    session = _FakeSession({"user_id": "u1", "regular_key": "value"})
    result = TempStateSessionService._inject(svc, session, ("app", "user", "session"))
    assert result is session
    # temp:kroger_token was never set in this test; if _inject wrongly forwarded non-temp keys
    # or a prior test leaked state, this would be non-empty — catching both bugs.
    assert get_invocation_temp("temp:kroger_token", {}) == ""


def test_inject_returns_none_when_session_is_none():
    svc = TempStateSessionService.__new__(TempStateSessionService)
    svc._pending_temp_state = {}

    result = TempStateSessionService._inject(svc, None, ("app", "user", "session"))
    assert result is None
