"""Grocery Planning Agent — wiring (see agent.py for domain logic)."""

from agents_shared.app_factory import (
    add_agent_routes,
    build_adk_agent,
    streaming_state_mapping,
)
from agents_shared.dependencies import AgentServices
from agents_shared.state import KROGER_AUTH, make_extract_state
from dotenv import load_dotenv
from fastapi import FastAPI

from .agent import build_agent

load_dotenv()

GROCERY_PREDICT_STATE = [
    streaming_state_mapping(
        state_key="meal_plan", tool="set_meal_plan", tool_argument="plan"
    ),
]

_grocery_agent = build_agent()


def register(app: FastAPI, services: AgentServices):
    add_agent_routes(
        app,
        prefix="/grocery",
        adk_agent=build_adk_agent(
            _grocery_agent, services=services, predict_state=GROCERY_PREDICT_STATE
        ),
        services=services,
        extract_state_from_request=make_extract_state(KROGER_AUTH),
    )
