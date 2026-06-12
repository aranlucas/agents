from fastapi.testclient import TestClient


def test_health_route() -> None:
    from a2ui_agent import main

    client = TestClient(main.app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_agui_route_exists() -> None:
    from a2ui_agent import main

    client = TestClient(main.app, raise_server_exceptions=False)
    response = client.post("/agui", content=b"")
    assert response.status_code != 404


def test_instruction_names_basic_catalog_id() -> None:
    from a2ui_agent import main

    assert "https://a2ui.org/specification/v0_9/basic_catalog.json" in main._INSTRUCTION
    assert "Do not use `default`" in main._INSTRUCTION
    assert "Do not use `type`" in main._INSTRUCTION
    assert '"component": "Column"' in main._INSTRUCTION


async def test_extract_demo_state_uses_clerk_user_id() -> None:
    from a2ui_agent import main
    from starlette.datastructures import Headers

    class Request:
        headers = Headers({"x-clerk-user-id": "user_a2ui"})

    assert await main.extract_demo_state(Request(), None) == {"user_id": "user_a2ui"}
