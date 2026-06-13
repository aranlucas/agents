from a2ui_agent import agent, main
from fastapi.testclient import TestClient


def test_health_route() -> None:
    client = TestClient(main.app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_agui_route_exists() -> None:
    client = TestClient(main.app, raise_server_exceptions=False)
    response = client.post("/agui", content=b"")
    assert response.status_code != 404


def test_instruction_names_basic_catalog_id() -> None:
    assert "https://a2ui.org/specification/v0_9/basic_catalog.json" in agent._STATIC_INSTRUCTION
    assert "Do not use `default`" in agent._STATIC_INSTRUCTION
    assert "Do not use `type`" in agent._STATIC_INSTRUCTION
    assert '"component": "Column"' in agent._STATIC_INSTRUCTION
