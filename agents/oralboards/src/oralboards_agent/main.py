"""Oral Boards Examiner Agent — wiring (see agent.py / db.py for domain logic)."""

from agents_shared.app_factory import (
    build_adk_agent,
    create_agent_app,
    get_agent_tracer,
    setup_agent_logging,
    streaming_state_mapping,
)
from agents_shared.session_service import SessionServiceContainer
from agents_shared.state import make_extract_state
from dotenv import load_dotenv

from .agent import build_agent
from .db import DB_STARTUP_ERROR

load_dotenv()

log = setup_agent_logging("oralboards_agent")

ORALBOARDS_PREDICT_STATE = [
    streaming_state_mapping(state_key="case", tool="set_case", tool_argument="case"),
]

oralboards_agent = build_agent()
_session_container = SessionServiceContainer()


async def _health() -> dict:
    session_health = await _session_container.check_database_connection()
    if DB_STARTUP_ERROR:
        return {"status": "unhealthy", "database": "error", "error": DB_STARTUP_ERROR}
    return session_health


app = create_agent_app(
    title="Oral Boards Examiner Agent",
    adk_agent=build_adk_agent(oralboards_agent, predict_state=ORALBOARDS_PREDICT_STATE),
    extract_state_from_request=make_extract_state(),
    session_container=_session_container,
    tracer=get_agent_tracer("oralboards-agent"),
    health_handler=_health,
)
