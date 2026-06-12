from agents_shared.invocation_state import (
    get_invocation_temp,
    set_invocation_temp_state,
)


def test_reads_from_state_first():
    set_invocation_temp_state({"temp:kroger_token": "from-contextvar"})
    state = {"temp:kroger_token": "from-state"}
    assert get_invocation_temp("temp:kroger_token", state) == "from-state"


def test_falls_back_to_contextvar_when_state_missing_key():
    set_invocation_temp_state({"temp:strava_token": "tok-123"})
    assert get_invocation_temp("temp:strava_token", {}) == "tok-123"


def test_returns_empty_when_nowhere():
    set_invocation_temp_state(None)
    assert get_invocation_temp("temp:kroger_token", {}) == ""
    assert get_invocation_temp("temp:kroger_token", None) == ""
