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
    assert response.json()["name"] == "Wellness Planning Agent"


def test_a2a_rpc_route_exists():
    import main

    client = TestClient(main.app, raise_server_exceptions=False)

    response = client.post("/", json={})

    assert response.status_code != 404


def test_extract_identity_state_includes_clerk_user_id():
    import main
    from starlette.datastructures import Headers

    class Request:
        headers = Headers({"x-clerk-user-id": "user_123"})

    assert main.extract_identity_state(Request()) == {"user_id": "user_123"}
