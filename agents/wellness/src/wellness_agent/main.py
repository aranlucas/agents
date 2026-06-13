"""Wellness Planning Agent — wiring (see agent.py for domain logic)."""

from ag_ui_adk.request_state_service import RequestStateSessionService
from agents_shared.app_factory import (
    build_adk_agent,
    create_agent_app,
    get_agent_tracer,
    setup_agent_logging,
    streaming_state_mapping,
)
from agents_shared.session_service import (
    SessionServiceContainer,
    create_session_service,
)
from agents_shared.state import KROGER_AUTH, STRAVA_AUTH, make_extract_state
from dotenv import load_dotenv

from .agent import build_agent

load_dotenv()

log = setup_agent_logging("wellness_agent")

WELLNESS_PREDICT_STATE = [
    streaming_state_mapping(
        state_key="weekly_plan", tool="set_weekly_wellness_plan", tool_argument="plan"
    ),
]

wellness_agent = build_agent()
_session_container = SessionServiceContainer()

app = create_agent_app(
    title="Wellness Planning Agent",
    adk_agent=build_adk_agent(
        wellness_agent,
        predict_state=WELLNESS_PREDICT_STATE,
        session_service=RequestStateSessionService(create_session_service()),
    ),
    extract_state_from_request=make_extract_state(KROGER_AUTH, STRAVA_AUTH),
    session_container=_session_container,
    tracer=get_agent_tracer("wellness-agent"),
)
