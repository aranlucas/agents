"""Fitness Training Agent — wiring (see agent.py for domain logic)."""

from agents_shared.app_factory import (
    add_agent_routes,
    build_adk_agent,
    streaming_state_mapping,
)
from agents_shared.dependencies import AgentServices
from agents_shared.plugins import SlimMcpPlugin, WebSearchThrottlePlugin
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
    add_agent_routes(
        app,
        prefix="/fitness",
        adk_agent=build_adk_agent(
            _fitness_agent,
            services=services,
            predict_state=FITNESS_PREDICT_STATE,
            plugins=[SlimMcpPlugin(), WebSearchThrottlePlugin()],
        ),
        services=services,
        extract_state_from_request=make_extract_state(STRAVA_AUTH),
    )
