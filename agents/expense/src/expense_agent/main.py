"""Expense Desk agent wiring."""

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

EXPENSE_PREDICT_STATE = [
    streaming_state_mapping(
        state_key="expense_report",
        tool="set_expense_report",
        tool_argument="report",
    ),
]

_expense_agent = build_agent()


def register(app: FastAPI, services: AgentServices):
    add_agent_routes(
        app,
        prefix="/expense",
        adk_agent=build_adk_agent(
            _expense_agent,
            services=services,
            predict_state=EXPENSE_PREDICT_STATE,
        ),
        services=services,
        extract_state_from_request=make_extract_state(),
    )
