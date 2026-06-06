from fastapi.testclient import TestClient
from travel_agent import main


def test_agent_card_route() -> None:
    """A2A agent card is served at the well-known URL."""
    client = TestClient(main.app)
    r = client.get("/.well-known/agent-card.json")
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Travel Planning Agent"
    assert body["version"] == "1.0.0"


def test_a2a_rpc_route_exists() -> None:
    """POST / returns an A2A error (not 404), proving the route is registered."""
    client = TestClient(main.app, raise_server_exceptions=False)
    r = client.post("/", json={})
    assert r.status_code != 404


def test_agui_moved_to_slash_agui() -> None:
    """AG-UI endpoint is at /agui, not /."""
    client = TestClient(main.app, raise_server_exceptions=False)
    r = client.post("/agui", content=b"")
    assert r.status_code != 404
