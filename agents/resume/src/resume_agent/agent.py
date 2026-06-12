"""Resume Q&A agent domain: instruction and state."""

from pathlib import Path

from ag_ui_adk import AGUIToolset
from agents_shared.state import make_state_initializer
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    build_model,
    on_model_error_callback,
)
from google.adk.agents import LlmAgent
from pydantic import BaseModel

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


def build_agent() -> LlmAgent:
    return LlmAgent(
        name="resume_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        state_schema=ResumeState,
        static_instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(ResumeState),
        tools=[AGUIToolset()],
    )
