"""Resume Q&A Agent — public, unauthenticated demo."""

from pathlib import Path

from ag_ui_adk import ADKAgent, AGUIToolset
from agents_shared.app_factory import (
    create_agent_app,
    get_agent_tracer,
    setup_agent_logging,
)
from agents_shared.session_service import (
    SessionServiceContainer,
    create_session_service,
)
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    build_model,
    extract_identity_state,
    on_model_error_callback,
)
from dotenv import load_dotenv
from google.adk.agents import LlmAgent
from google.adk.agents.callback_context import CallbackContext
from pydantic import BaseModel

load_dotenv()

log = setup_agent_logging("resume_agent")
tracer = get_agent_tracer("resume-agent")

_RESUME = (Path(__file__).parent / "resume.md").read_text(encoding="utf-8")

_INSTRUCTION = f"""\
You are a friendly assistant that answers questions about Lucas's professional
background on his behalf, for recruiters and curious visitors.

Ground every answer in the resume below. Only answer questions about Lucas's
experience, skills, projects, education, and working style. If asked about
anything else (or for information not in the resume), say you can only speak
to what's on the resume and suggest contacting Lucas directly.

Keep answers short, specific, and positive. Never invent employers, dates, or
accomplishments that are not in the resume.

Lucas is currently a Senior Software Engineer at DoorDash and is open to
senior/staff software engineer opportunities. When a recruiter asks about fit
for a senior or staff role, highlight his track record of envisioning and
shipping products end to end (e.g. Ask DoorDash) and his technical leadership.

When questions touch on AI, agents, or side projects, emphasize that building
agentic experiences is Lucas's main hobby — and point out that this very
resume Q&A is one of the agents on his personal platform.

<resume>
{_RESUME}
</resume>
"""


class ResumeState(BaseModel):
    """Default shared-state shape for the public resume agent."""

    user_id: str = ""


_DEFAULT_STATE = ResumeState().model_dump()


async def extract_visitor_state(request, _input_data) -> dict:
    return extract_identity_state(request)


def on_before_agent(callback_context: CallbackContext) -> None:
    for key, default in _DEFAULT_STATE.items():
        if key not in callback_context.state:
            callback_context.state[key] = default


def build_agent() -> LlmAgent:
    return LlmAgent(
        name="resume_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        state_schema=ResumeState,
        static_instruction=_INSTRUCTION,
        before_agent_callback=on_before_agent,
        tools=[AGUIToolset()],
    )


resume_agent = build_agent()

_session_container = SessionServiceContainer()

adk_resume_agent = ADKAgent(
    adk_agent=resume_agent,
    session_service=create_session_service(),
    session_timeout_seconds=3600,
)

app = create_agent_app(
    title="Resume Q&A Agent",
    adk_agent=adk_resume_agent,
    extract_state_from_request=extract_visitor_state,
    session_container=_session_container,
    tracer=tracer,
)
