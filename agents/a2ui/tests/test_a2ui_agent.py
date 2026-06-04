from fastapi.testclient import TestClient


def test_health_route():
    import main

    client = TestClient(main.app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_a2a_agent_card_route_exists():
    import main

    client = TestClient(main.app)

    response = client.get("/.well-known/agent-card.json")

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "A2UI Showcase Agent"
    assert body["capabilities"]["streaming"] is True


def test_agent_card_url_uses_agent_public_url_env(monkeypatch):
    import importlib

    import main

    monkeypatch.setenv("AGENT_PUBLIC_URL", "http://a2ui:8004")
    main = importlib.reload(main)

    assert main._a2a_agent_card().url == "http://a2ui:8004"


def test_a2a_rpc_route_exists():
    import main

    client = TestClient(main.app, raise_server_exceptions=False)

    response = client.post("/", json={})

    assert response.status_code != 404


def test_agui_route_exists():
    import main

    client = TestClient(main.app, raise_server_exceptions=False)

    response = client.post("/agui", content=b"")

    assert response.status_code != 404


def test_instruction_names_basic_catalog_id():
    import main

    assert "https://a2ui.org/specification/v0_9/basic_catalog.json" in main._INSTRUCTION
    assert "Do not use `default`" in main._INSTRUCTION
    assert "Do not use `type`" in main._INSTRUCTION
    assert '"component": "Column"' in main._INSTRUCTION


async def test_extract_demo_state_uses_clerk_user_id():
    import main
    from starlette.datastructures import Headers

    class Request:
        headers = Headers({"x-clerk-user-id": "user_a2ui"})

    assert await main.extract_demo_state(Request(), None) == {"user_id": "user_a2ui"}
