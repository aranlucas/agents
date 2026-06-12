from fastapi.testclient import TestClient
from resume_agent import main


def test_instruction_embeds_resume_content():
    assert "# Lucas Aran" in main.resume_agent.instruction
    assert "only answer questions" in main.resume_agent.instruction.lower()


async def test_extract_state_defaults_to_anonymous():
    class DummyRequest:
        headers = {}

    state = await main.extract_visitor_state(DummyRequest(), None)
    assert state == {"user_id": "anonymous"}


def test_app_exposes_agui_and_health_routes():
    paths = {route.path for route in main.app.routes}
    assert "/health" in paths
    assert any(p.startswith("/agui") for p in paths)


def test_health_endpoint_reports_database():
    client = TestClient(main.app)
    body = client.get("/health").json()
    assert body["status"] in {"ok", "degraded"}
