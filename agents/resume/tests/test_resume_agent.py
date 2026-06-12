from fastapi.testclient import TestClient
from resume_agent import main
from resume_agent.agent import _INSTRUCTION


def test_instruction_embeds_resume_content():
    assert "# Lucas Aran" in _INSTRUCTION
    assert "only answer questions" in _INSTRUCTION.lower()


def test_agent_static_instruction_embeds_resume_content():
    assert "# Lucas Aran" in main.resume_agent.static_instruction
    assert "only answer questions" in main.resume_agent.static_instruction.lower()


def test_app_exposes_agui_and_health_routes():
    paths = {route.path for route in main.app.routes}
    assert "/health" in paths
    assert any(p.startswith("/agui") for p in paths)


def test_health_endpoint_reports_database():
    client = TestClient(main.app)
    body = client.get("/health").json()
    assert body["status"] in {"ok", "degraded"}
