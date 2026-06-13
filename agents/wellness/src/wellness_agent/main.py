"""Wellness Planning Agent — wiring (see agent.py for domain logic)."""

from ag_ui_adk import add_adk_fastapi_endpoint
from ag_ui_adk.request_state_service import RequestStateSessionService
from agents_shared.app_factory import build_adk_agent, streaming_state_mapping
from agents_shared.dependencies import AgentServices
from agents_shared.session_service import check_database_connection
from agents_shared.state import KROGER_AUTH, STRAVA_AUTH, make_extract_state
from dotenv import load_dotenv
from fastapi import FastAPI

from .agent import build_agent

load_dotenv()

WELLNESS_PREDICT_STATE = [
    streaming_state_mapping(
        state_key="weekly_plan", tool="set_weekly_wellness_plan", tool_argument="plan"
    ),
]

_wellness_agent = build_agent()


def register(app: FastAPI, services: AgentServices):
    add_adk_fastapi_endpoint(
        app,
        build_adk_agent(
            _wellness_agent,
            services=services,
            predict_state=WELLNESS_PREDICT_STATE,
            session_service=RequestStateSessionService(services.session_service),
        ),
        path="/wellness/agui",
        extract_state_from_request=make_extract_state(KROGER_AUTH, STRAVA_AUTH),
    )

    @app.get("/wellness/health")
    async def health():
        return await check_database_connection()
