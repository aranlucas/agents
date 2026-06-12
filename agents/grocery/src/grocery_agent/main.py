"""Grocery Planning Agent — wiring (see agent.py for domain logic)."""

from agents_shared.app_factory import (
    build_adk_agent,
    create_agent_app,
    get_agent_tracer,
    setup_agent_logging,
    streaming_state_mapping,
)
from agents_shared.session_service import SessionServiceContainer
from agents_shared.state import KROGER_AUTH, make_extract_state
from dotenv import load_dotenv

from .agent import build_agent

load_dotenv()

log = setup_agent_logging("grocery_agent")

GROCERY_PREDICT_STATE = [
    streaming_state_mapping(state_key="meal_plan", tool="set_meal_plan", tool_argument="plan"),
]

grocery_agent = build_agent()
_session_container = SessionServiceContainer()

app = create_agent_app(
    title="Grocery Planning Agent",
    adk_agent=build_adk_agent(grocery_agent, predict_state=GROCERY_PREDICT_STATE),
    extract_state_from_request=make_extract_state(KROGER_AUTH),
    session_container=_session_container,
    tracer=get_agent_tracer("grocery-agent"),
)
