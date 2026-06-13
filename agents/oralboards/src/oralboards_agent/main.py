"""Oral Boards Examiner Agent — wiring (see agent.py / db.py for domain logic)."""

from agents_shared.app_factory import (
    add_agent_routes,
    build_adk_agent,
    streaming_state_mapping,
)
from agents_shared.dependencies import AgentServices
from agents_shared.session_service import check_database_connection
from agents_shared.state import make_extract_state
from dotenv import load_dotenv
from fastapi import FastAPI

from .agent import build_agent
from .db import DB_STARTUP_ERROR

load_dotenv()

ORALBOARDS_PREDICT_STATE = [
    streaming_state_mapping(state_key="case", tool="set_case", tool_argument="case"),
]

_oralboards_agent = build_agent()


async def _health() -> dict:
    if DB_STARTUP_ERROR:
        return {"status": "unhealthy", "database": "error", "error": DB_STARTUP_ERROR}
    return await check_database_connection()


def register(app: FastAPI, services: AgentServices):
    add_agent_routes(
        app,
        prefix="/oralboards",
        adk_agent=build_adk_agent(
            _oralboards_agent, services=services, predict_state=ORALBOARDS_PREDICT_STATE
        ),
        extract_state_from_request=make_extract_state(),
        health_check=_health,
    )
