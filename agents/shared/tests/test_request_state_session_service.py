"""RequestStateSessionService injects temp keys into ADK session state."""

from ag_ui_adk.request_state_service import RequestStateSessionService


class _FakeSession:
    def __init__(self, state):
        self.id = "session"
        self.state = state


def test_request_state_service_injects_pending_temp_keys() -> None:
    svc = RequestStateSessionService.__new__(RequestStateSessionService)
    svc._pending_temp_state = {
        ("app", "user", "session"): {"temp:kroger_token": "tok-123"}
    }

    session = _FakeSession({"user_id": "u1"})
    result = RequestStateSessionService._inject(
        svc, session, ("app", "user", "session")
    )

    assert result is session
    assert session.state["temp:kroger_token"] == "tok-123"


def test_request_state_service_leaves_session_without_pending_temp_state() -> None:
    svc = RequestStateSessionService.__new__(RequestStateSessionService)
    svc._pending_temp_state = {}

    session = _FakeSession({"user_id": "u1"})
    result = RequestStateSessionService._inject(
        svc, session, ("app", "user", "session")
    )

    assert result is session
    assert session.state == {"user_id": "u1"}
