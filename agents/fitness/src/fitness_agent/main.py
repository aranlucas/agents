"""Fitness Training Agent — wiring (see agent.py for domain logic)."""

from ag_ui_adk import add_adk_fastapi_endpoint
from agents_shared.app_factory import build_adk_agent, streaming_state_mapping
from agents_shared.dependencies import AgentServices
from agents_shared.session_service import check_database_connection
from agents_shared.state import STRAVA_AUTH, make_extract_state
from dotenv import load_dotenv
from fastapi import FastAPI

from .agent import build_agent

load_dotenv()

FITNESS_PREDICT_STATE = [
    streaming_state_mapping(
        state_key="training_plan", tool="set_training_plan", tool_argument="plan"
    ),
]

_fitness_agent = build_agent()


def register(app: FastAPI, services: AgentServices):
    add_adk_fastapi_endpoint(
        app,
        build_adk_agent(_fitness_agent, services=services, predict_state=FITNESS_PREDICT_STATE),
        path="/fitness/agui",
        extract_state_from_request=make_extract_state(STRAVA_AUTH),
    )

    @app.get("/fitness/health")
    async def health():
        return await check_database_connection()
