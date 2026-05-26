def test_agent_card_route():
    """A2A agent card is served at the well-known URL."""
    from fastapi.testclient import TestClient
    import sys
    import os

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    import main

    client = TestClient(main.app)
    r = client.get("/.well-known/agent-card.json")
    assert r.status_code == 200
    assert r.json()["name"] == "Grocery Planning Agent"


def test_a2a_rpc_route_exists():
    """POST / returns an A2A error (not 404), proving the route is registered."""
    from fastapi.testclient import TestClient
    import sys
    import os

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    import main

    client = TestClient(main.app, raise_server_exceptions=False)
    r = client.post("/", json={})
    assert r.status_code != 404


def test_agui_moved_to_slash_agui():
    """AG-UI endpoint is at /agui, not /."""
    from fastapi.testclient import TestClient
    import sys
    import os

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    import main

    client = TestClient(main.app, raise_server_exceptions=False)
    r = client.post("/agui", content=b"")
    assert r.status_code != 404
