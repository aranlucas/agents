import importlib

from fastapi.testclient import TestClient
from oralboards_agent import main


def test_agent_card_route() -> None:
    client = TestClient(main.app)
    response = client.get("/.well-known/agent-card.json")

    assert response.status_code == 200
    assert response.json()["name"] == "Oral Boards Examiner Agent"


def test_agent_card_url_uses_agent_public_url_env(monkeypatch) -> None:
    monkeypatch.setenv("AGENT_PUBLIC_URL", "http://oralboards:8005")

    reloaded_main = importlib.reload(main)

    assert reloaded_main._a2a_agent_card().url == "http://oralboards:8005"


def test_a2a_rpc_route_exists() -> None:
    client = TestClient(main.app, raise_server_exceptions=False)
    response = client.post("/", json={})

    assert response.status_code != 404


def test_agui_moved_to_slash_agui() -> None:
    client = TestClient(main.app, raise_server_exceptions=False)
    response = client.post("/agui", content=b"")

    assert response.status_code != 404
