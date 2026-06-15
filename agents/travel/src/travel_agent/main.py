"""Collab Studio · Trip Planning agent — wiring (see agent.py for domain logic)."""

from agents_shared.app_factory import (
    add_agent_routes,
    build_adk_agent,
    streaming_state_mapping,
)
from agents_shared.dependencies import AgentServices
from agents_shared.state import make_extract_state
from dotenv import load_dotenv
from fastapi import FastAPI

from .agent import build_agent

load_dotenv()

COLLAB_PREDICT_STATE = [
    streaming_state_mapping(
        state_key="itinerary", tool="write_itinerary", tool_argument="body"
    ),
    streaming_state_mapping(
        state_key="flights", tool="write_itinerary", tool_argument="flights"
    ),
]

_trip_agent = build_agent()


def register(app: FastAPI, services: AgentServices):
    add_agent_routes(
        app,
        prefix="/travel",
        adk_agent=build_adk_agent(
            _trip_agent, services=services, predict_state=COLLAB_PREDICT_STATE
        ),
        extract_state_from_request=make_extract_state(),
    )
