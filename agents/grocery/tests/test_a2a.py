import importlib

from fastapi.testclient import TestClient
from grocery_agent import main


def test_agent_card_route() -> None:
    """A2A agent card is served at the well-known URL."""
    client = TestClient(main.app)
    r = client.get("/.well-known/agent-card.json")
    assert r.status_code == 200
    assert r.json()["name"] == "Grocery Planning Agent"


def test_agent_card_url_uses_agent_public_url_env(monkeypatch) -> None:
    """A2A card advertises the reachable RPC endpoint for the current network."""
    monkeypatch.setenv("AGENT_PUBLIC_URL", "http://grocery:8001")
    reloaded_main = importlib.reload(main)
    assert reloaded_main._a2a_agent_card().url == "http://grocery:8001"


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
