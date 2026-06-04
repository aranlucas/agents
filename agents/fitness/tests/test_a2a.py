def test_agent_card_route():
    """A2A agent card is served at the well-known URL."""
    import os
    import sys

    from fastapi.testclient import TestClient

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    import main

    client = TestClient(main.app)
    r = client.get("/.well-known/agent-card.json")
    assert r.status_code == 200
    assert r.json()["name"] == "Fitness Training Agent"


def test_agent_card_url_uses_agent_public_url_env(monkeypatch):
    """A2A card advertises the reachable RPC endpoint for the current network."""
    import importlib
    import os
    import sys

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    import main

    monkeypatch.setenv("AGENT_PUBLIC_URL", "http://fitness:8002")
    main = importlib.reload(main)

    assert main._a2a_agent_card().url == "http://fitness:8002"


def test_a2a_rpc_route_exists():
    """POST / returns an A2A error (not 404), proving the route is registered."""
    import os
    import sys

    from fastapi.testclient import TestClient

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    import main

    client = TestClient(main.app, raise_server_exceptions=False)
    r = client.post("/", json={})
    assert r.status_code != 404


def test_agui_moved_to_slash_agui():
    """AG-UI endpoint is at /agui, not /."""
    import os
    import sys

    from fastapi.testclient import TestClient

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    import main

    client = TestClient(main.app, raise_server_exceptions=False)
    r = client.post("/agui", content=b"")
    assert r.status_code != 404
