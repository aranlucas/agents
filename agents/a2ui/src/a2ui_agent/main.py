"""A2UI Showcase Agent — wiring (see agent.py for domain logic)."""

from ag_ui_adk import add_adk_fastapi_endpoint
from agents_shared.app_factory import build_adk_agent
from agents_shared.dependencies import AgentServices
from agents_shared.session_service import check_database_connection
from agents_shared.state import make_extract_state
from dotenv import load_dotenv
from fastapi import FastAPI

from .agent import build_agent

load_dotenv()

_a2ui_agent = build_agent()


def register(app: FastAPI, services: AgentServices):
    add_adk_fastapi_endpoint(
        app,
        build_adk_agent(_a2ui_agent, services=services),
        path="/a2ui/agui",
        extract_state_from_request=make_extract_state(),
    )

    @app.get("/a2ui/health")
    async def health():
        return await check_database_connection()
