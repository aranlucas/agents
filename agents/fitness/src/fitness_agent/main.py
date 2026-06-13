"""Fitness Training Agent — wiring (see agent.py for domain logic)."""

from agents_shared.app_factory import (
    build_adk_agent,
    create_agent_app,
    get_agent_tracer,
    setup_agent_logging,
    streaming_state_mapping,
)
from agents_shared.session_service import SessionServiceContainer
from agents_shared.state import STRAVA_AUTH, make_extract_state
from dotenv import load_dotenv

from .agent import build_agent

load_dotenv()

log = setup_agent_logging("fitness_agent")

FITNESS_PREDICT_STATE = [
    streaming_state_mapping(
        state_key="training_plan", tool="set_training_plan", tool_argument="plan"
    ),
]

fitness_agent = build_agent()
_session_container = SessionServiceContainer()

app = create_agent_app(
    title="Fitness Training Agent",
    adk_agent=build_adk_agent(fitness_agent, predict_state=FITNESS_PREDICT_STATE),
    extract_state_from_request=make_extract_state(STRAVA_AUTH),
    session_container=_session_container,
    tracer=get_agent_tracer("fitness-agent"),
)
