from agents_shared.tools import extract_identity_state
from starlette.datastructures import Headers


class Request:
    def __init__(self, headers: dict[str, str]) -> None:
        self.headers = Headers(headers)


def test_extract_identity_state_includes_clerk_user_id() -> None:
    state = extract_identity_state(Request({"x-clerk-user-id": "user_123"}))
    assert state["user_id"] == "user_123"
