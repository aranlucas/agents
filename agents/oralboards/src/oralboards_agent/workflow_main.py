"""Oral Boards Workflow Agent — graph-based AG-UI endpoint at /oralboards-v2.

Uses SequentialAgent + LoopAgent for deterministic flow control instead of
prompt-based instructions. See workflow_agent.py for the agent definition.
"""

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
from sqlalchemy.ext.asyncio import AsyncEngine

from .db import DB_STARTUP_ERROR
from .workflow_agent import build_workflow_agent

load_dotenv()

ORALBOARDS_V2_PREDICT_STATE = [
    streaming_state_mapping(state_key="case", tool="set_case", tool_argument="case"),
    streaming_state_mapping(
        state_key="score_card", tool="set_score_card", tool_argument="markdown"
    ),
    streaming_state_mapping(
        state_key="active_feedback", tool="append_exchange", tool_argument="feedback"
    ),
    streaming_state_mapping(
        state_key="active_ideal_response",
        tool="append_exchange",
        tool_argument="ideal_response",
    ),
]

_workflow_agent = build_workflow_agent()


async def _health(engine: AsyncEngine) -> dict:
    if DB_STARTUP_ERROR:
        return {"status": "unhealthy", "database": "error", "error": DB_STARTUP_ERROR}
    return await check_database_connection(engine)


def register(app: FastAPI, services: AgentServices):
    add_agent_routes(
        app,
        prefix="/oralboards-v2",
        adk_agent=build_adk_agent(
            _workflow_agent,  # type: ignore[arg-type]
            services=services,
            predict_state=ORALBOARDS_V2_PREDICT_STATE,
        ),
        services=services,
        extract_state_from_request=make_extract_state(),
        health_check=_health,
    )
