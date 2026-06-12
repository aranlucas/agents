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
