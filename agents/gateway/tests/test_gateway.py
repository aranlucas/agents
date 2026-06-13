import importlib
from collections import Counter
from pathlib import Path

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
        assert f"{prefix}/agui" in mounted
        assert f"{prefix}/health" in mounted


def test_startup_does_not_mutate_route_table():
    before = [route.path for route in main.app.routes]
    with TestClient(main.app):
        first_startup = [route.path for route in main.app.routes]
    with TestClient(main.app):
        second_startup = [route.path for route in main.app.routes]

    assert first_startup == before
    assert second_startup == before


def test_agent_routes_are_unique_and_state_is_scoped():
    paths = [route.path for route in main.app.routes]
    duplicates = {path: count for path, count in Counter(paths).items() if count > 1}

    assert duplicates == {}
    assert "/agents/state" not in paths
    for prefix in (
        "/travel",
        "/grocery",
        "/fitness",
        "/wellness",
        "/a2ui",
        "/oralboards",
        "/resume",
    ):
        assert f"{prefix}/agents/state" in paths


def test_gateway_health():
    client = TestClient(main.app)
    body = client.get("/health").json()
    assert body["status"] in {"ok", "degraded"}


def test_subapp_health_reachable_under_prefix():
    client = TestClient(main.app)
    assert client.get("/travel/health").status_code == 200
    assert client.get("/grocery/health").status_code == 200
    assert client.get("/oralboards/health").status_code == 200


def test_gateway_is_only_otel_setup_call():
    repo_root = Path(__file__).resolve().parents[3]
    agent_main_files = [
        path
        for path in (repo_root / "agents").glob("*/src/*_agent/main.py")
        if path.parts[-3] != "gateway"
    ]

    offenders = [
        str(path.relative_to(repo_root))
        for path in agent_main_files
        if "setup_otel(" in path.read_text()
    ]

    assert offenders == []
    assert "setup_otel(" in (repo_root / "agents/gateway/src/gateway/main.py").read_text()


def test_agui_requires_token_when_clerk_auth_enabled(monkeypatch):
    monkeypatch.setenv(
        "CLERK_JWKS_URL",
        "https://example.clerk.accounts.dev/.well-known/jwks.json",
    )

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
    module = importlib.reload(main)
    client = TestClient(module.app)
    assert client.post("/resume/agui", json={}).status_code != 401

    monkeypatch.delenv("CLERK_JWKS_URL")
    importlib.reload(main)
