"""A2UI Showcase Agent — wiring (see agent.py for domain logic)."""

from agents_shared.app_factory import (
    build_adk_agent,
    create_agent_app,
    get_agent_tracer,
    setup_agent_logging,
)
from agents_shared.session_service import SessionServiceContainer
from agents_shared.state import make_extract_state
from dotenv import load_dotenv

from .agent import build_agent

load_dotenv()

log = setup_agent_logging("a2ui_agent")

a2ui_agent = build_agent()
_session_container = SessionServiceContainer()

app = create_agent_app(
    title="A2UI Showcase Agent",
    adk_agent=build_adk_agent(a2ui_agent),
    extract_state_from_request=make_extract_state(),
    session_container=_session_container,
    tracer=get_agent_tracer("a2ui-agent"),
)
