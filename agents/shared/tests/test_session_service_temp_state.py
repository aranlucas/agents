"""TempStateSessionService forwards temp: keys into invocation temp state."""

from agents_shared.invocation_state import get_invocation_temp
from agents_shared.session_service import TempStateSessionService


class _FakeSession:
    def __init__(self, state):
        self.state = state


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
    # No temp state should be set (invocation temp remains empty/None)
    assert get_invocation_temp("temp:nonexistent", {}) == ""


def test_inject_returns_none_when_session_is_none():
    svc = TempStateSessionService.__new__(TempStateSessionService)
    svc._pending_temp_state = {}

    result = TempStateSessionService._inject(svc, None, ("app", "user", "session"))
    assert result is None
