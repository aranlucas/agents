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
    assert "DashMart" in _INSTRUCTION
    assert "MCP integration for ChatGPT" in _INSTRUCTION
    assert "only answer questions" in _INSTRUCTION.lower()


def test_agent_static_instruction_embeds_resume_content():
    resume_agent = build_agent()
    assert "# Lucas Aran" in resume_agent.static_instruction
    assert "DashMart" in resume_agent.static_instruction
    assert "MCP integration for ChatGPT" in resume_agent.static_instruction
    assert "only answer questions" in resume_agent.static_instruction.lower()


def _route_paths(app) -> set[str]:
    paths = set()
    for route in app.routes:
        if hasattr(route, "path"):
            paths.add(route.path)
        elif hasattr(route, "original_router") and hasattr(route, "include_context"):
            ic = route.include_context
            prefix = getattr(ic, "prefix", "") or ""
            for sub in route.original_router.routes:
                if hasattr(sub, "path"):
                    paths.add(prefix + sub.path)
    return paths


def test_app_exposes_agui_and_health_routes():
    paths = _route_paths(_registered_app())
    assert "/resume/health" in paths
    assert any(p.startswith("/resume/agui") for p in paths)


def test_health_endpoint_reports_database():
    client = TestClient(_registered_app())
    body = client.get("/resume/health").json()
    assert body["status"] in {"ok", "degraded"}
