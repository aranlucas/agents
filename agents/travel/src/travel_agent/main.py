"""Collab Studio · Trip Planning agent — wiring (see agent.py for domain logic)."""

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

load_dotenv()

log = setup_agent_logging("travel_agent")

COLLAB_PREDICT_STATE = [
    streaming_state_mapping(state_key="itinerary", tool="write_itinerary", tool_argument="body"),
    streaming_state_mapping(state_key="flights", tool="write_itinerary", tool_argument="flights"),
]

collab_trip_agent = build_agent()
_session_container = SessionServiceContainer()

app = create_agent_app(
    title="Collab Studio · Trip Planning",
    adk_agent=build_adk_agent(collab_trip_agent, predict_state=COLLAB_PREDICT_STATE),
    extract_state_from_request=make_extract_state(),
    session_container=_session_container,
    tracer=get_agent_tracer("travel-agent"),
)
