from agents_shared.dependencies import create_agent_services
from fastapi import FastAPI
from fastapi.testclient import TestClient
from resume_agent import main
from resume_agent.agent import _INSTRUCTION, build_agent


def _registered_app() -> FastAPI:
    app = FastAPI()
    main.register(app, create_agent_services())
    return app


def test_instruction_embeds_resume_content():
    assert "# Lucas Aran" in _INSTRUCTION
    assert "only answer questions" in _INSTRUCTION.lower()


def test_agent_static_instruction_embeds_resume_content():
    resume_agent = build_agent()
    assert "# Lucas Aran" in resume_agent.static_instruction
    assert "only answer questions" in resume_agent.static_instruction.lower()


def test_app_exposes_agui_and_health_routes():
    paths = {route.path for route in _registered_app().routes}
    assert "/resume/health" in paths
    assert any(p.startswith("/resume/agui") for p in paths)


def test_health_endpoint_reports_database():
    client = TestClient(_registered_app())
    body = client.get("/resume/health").json()
    assert body["status"] in {"ok", "degraded"}
