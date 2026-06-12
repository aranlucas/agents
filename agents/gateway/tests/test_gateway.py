from fastapi.testclient import TestClient
from gateway import main


def test_mounts_every_agent():
    mounted = {route.path for route in main.app.routes}
    for prefix in (
        "/travel",
        "/grocery",
        "/fitness",
        "/wellness",
        "/a2ui",
        "/oralboards",
        "/resume",
    ):
        assert prefix in mounted


def test_gateway_health():
    client = TestClient(main.app)
    body = client.get("/health").json()
    assert body["status"] in {"ok", "degraded"}


def test_subapp_health_reachable_under_prefix():
    client = TestClient(main.app)
    assert client.get("/travel/health").status_code == 200
    assert client.get("/grocery/health").status_code == 200
    assert client.get("/oralboards/health").status_code == 200


def test_agui_requires_token_when_clerk_auth_enabled(monkeypatch):
    monkeypatch.setenv(
        "CLERK_JWKS_URL",
        "https://example.clerk.accounts.dev/.well-known/jwks.json",
    )
    import importlib

    module = importlib.reload(main)
    client = TestClient(module.app)
    assert client.get("/health").status_code == 200
    assert client.post("/travel/agui", json={}).status_code == 401

    monkeypatch.delenv("CLERK_JWKS_URL")
    importlib.reload(main)


def test_resume_agui_is_public_with_auth_enabled(monkeypatch):
    monkeypatch.setenv(
        "CLERK_JWKS_URL",
        "https://example.clerk.accounts.dev/.well-known/jwks.json",
    )
    import importlib

    module = importlib.reload(main)
    client = TestClient(module.app)
    assert client.post("/resume/agui", json={}).status_code != 401

    monkeypatch.delenv("CLERK_JWKS_URL")
    importlib.reload(main)
