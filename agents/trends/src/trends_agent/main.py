"""Google Trends agent wiring."""

from agents_shared.app_factory import add_agent_routes, build_adk_agent
from agents_shared.dependencies import AgentServices
from agents_shared.state import make_extract_state
from dotenv import load_dotenv
from fastapi import FastAPI

from .agent import build_agent

load_dotenv()

_trends_agent = build_agent()


def register(app: FastAPI, services: AgentServices) -> None:
    add_agent_routes(
        app,
        prefix="/trends",
        adk_agent=build_adk_agent(
            _trends_agent,  # type: ignore[arg-type]
            services=services,
        ),
        services=services,
        extract_state_from_request=make_extract_state(),
    )
