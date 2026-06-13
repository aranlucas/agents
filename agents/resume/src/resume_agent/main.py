"""Resume Q&A Agent — public, unauthenticated demo. Wiring only."""

from ag_ui_adk import add_adk_fastapi_endpoint
from agents_shared.app_factory import build_adk_agent
from agents_shared.dependencies import AgentServices
from agents_shared.session_service import check_database_connection
from agents_shared.state import make_extract_state
from dotenv import load_dotenv
from fastapi import FastAPI

from .agent import build_agent

load_dotenv()

_resume_agent = build_agent()


def register(app: FastAPI, services: AgentServices):
    add_adk_fastapi_endpoint(
        app,
        build_adk_agent(_resume_agent, services=services),
        path="/resume/agui",
        extract_state_from_request=make_extract_state(),
    )

    @app.get("/resume/health")
    async def health():
        return await check_database_connection()
