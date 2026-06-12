"""Resume Q&A Agent — public, unauthenticated demo."""

import logging
import time
from pathlib import Path

from ag_ui_adk import ADKAgent, AGUIToolset, add_adk_fastapi_endpoint
from agents_shared.session_service import (
    SessionServiceContainer,
    create_session_service,
)
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from opentelemetry import trace

load_dotenv()

log = logging.getLogger("resume_agent")
tracer = trace.get_tracer("resume-agent")

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

=== RESUME ===
{_RESUME}
=== END RESUME ===
"""


async def extract_visitor_state(request, _input_data) -> dict:
    return {"user_id": request.headers.get("x-clerk-user-id") or "anonymous"}


def build_agent() -> LlmAgent:
    return LlmAgent(
        name="resume_agent",
        model=LiteLlm(
            model="openrouter/poolside/laguna-m.1:free",
            fallbacks=[
                "mistral/mistral-small-latest",
                "openrouter/owl-alpha",
                "nvidia_nim/deepseek-ai/deepseek-v4-flash",
            ],
        ),
        instruction=_INSTRUCTION,
        tools=[AGUIToolset()],
    )


resume_agent = build_agent()

_session_container = SessionServiceContainer()

adk_resume_agent = ADKAgent(
    adk_agent=resume_agent,
    session_service=create_session_service(),
    session_timeout_seconds=3600,
)

app = FastAPI(title="Resume Q&A Agent")


@app.middleware("http")
async def trace_requests(request, call_next):
    if request.url.path.endswith("/health"):
        return await call_next(request)

    start = time.perf_counter()
    with tracer.start_as_current_span(
        f"{request.method} {request.url.path}",
        attributes={
            "http.request.method": request.method,
            "url.path": request.url.path,
            "url.scheme": request.url.scheme,
        },
    ) as span:
        try:
            response = await call_next(request)
        except Exception as exc:
            span.record_exception(exc)
            span.set_attribute("error.type", type(exc).__name__)
            log.exception("Unhandled error in %s %s", request.method, request.url.path)
            raise

        span.set_attribute("http.response.status_code", response.status_code)
        span.set_attribute(
            "duration_ms",
            round((time.perf_counter() - start) * 1000, 2),
        )
        return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

add_adk_fastapi_endpoint(
    app,
    adk_resume_agent,
    path="/agui",
    extract_state_from_request=extract_visitor_state,
)


@app.get("/health")
async def health():
    return await _session_container.check_database_connection()
