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


def test_agent_card_url_uses_agent_public_url_env(monkeypatch):
    import importlib

    import main

    monkeypatch.setenv("AGENT_PUBLIC_URL", "http://wellness:8003")
    main = importlib.reload(main)

    assert main._a2a_agent_card().url == "http://wellness:8003"


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


def test_extract_identity_state_includes_provider_tokens():
    import main
    from starlette.datastructures import Headers

    class Request:
        headers = Headers(
            {
                "x-clerk-user-id": "user_123",
                "x-kroger-access-token": "kroger-token",
                "x-strava-access-token": "strava-token",
            }
        )

    assert main.extract_identity_state(Request()) == {
        "user_id": "user_123",
        "temp:kroger_token": "kroger-token",
        "temp:strava_token": "strava-token",
    }
