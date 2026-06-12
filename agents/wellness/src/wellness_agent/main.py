"""Wellness Planning Agent - orchestrates meal and workout plans in-process."""

import datetime
import json
import logging
import os
import time

from ag_ui_adk import ADKAgent, AGUIToolset, add_adk_fastapi_endpoint
from ag_ui_adk.config import PredictStateMapping
from ag_ui_adk.request_state_service import RequestStateSessionService
from agents_shared.invocation_state import set_invocation_temp_state
from agents_shared.session_service import (
    SessionServiceContainer,
    create_session_service,
)
from agents_shared.tools import shared_after_tool_callback
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fitness_agent.main import build_agent as build_fitness_agent
from google.adk.agents import LlmAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.auth.credential_service.in_memory_credential_service import (
    InMemoryCredentialService,
)
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.models import LlmRequest, LlmResponse
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import ToolContext
from google.adk.tools.agent_tool import AgentTool
from grocery_agent.main import build_agent as build_grocery_agent
from opentelemetry import trace
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource

load_dotenv()

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logging.getLogger("google.adk").setLevel(logging.DEBUG)
logging.getLogger("litellm").setLevel(logging.DEBUG)
logging.getLogger("ag_ui_adk").setLevel(logging.DEBUG)

log = logging.getLogger("wellness_agent")

_railway_domain = os.getenv("RAILWAY_PUBLIC_DOMAIN")
AGENT_PUBLIC_URL = os.getenv("AGENT_PUBLIC_URL") or (
    f"https://{_railway_domain}" if _railway_domain else "http://localhost:8003"
)
CLERK_USER_ID_HEADER = "x-clerk-user-id"
KROGER_TOKEN_HEADER = "x-kroger-access-token"
KROGER_TOKEN_STATE_KEY = "temp:kroger_token"
STRAVA_TOKEN_HEADER = "x-strava-access-token"
STRAVA_TOKEN_STATE_KEY = "temp:strava_token"

_DEFAULT_STATE = {
    "status": "idle",
    "meal_plan": "",
    "weekly_plan": "",
    "review_summary": "",
    "user_id": "",
}


def _setup_otel() -> None:
    if not os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return

    from google.adk.telemetry.setup import maybe_set_otel_providers

    resource = Resource.create(
        {
            "service.name": os.getenv("RAILWAY_SERVICE_NAME", "wellness-agent"),
            "service.version": os.getenv("RAILWAY_GIT_COMMIT_SHA", "dev"),
            "deployment.environment": os.getenv("RAILWAY_ENVIRONMENT_NAME", "local"),
            "railway.project.id": os.getenv("RAILWAY_PROJECT_ID", ""),
            "railway.service.id": os.getenv("RAILWAY_SERVICE_ID", ""),
        },
    )
    maybe_set_otel_providers(otel_resource=resource)
    SQLAlchemyInstrumentor().instrument()


_setup_otel()
tracer = trace.get_tracer("wellness-agent")


def extract_identity_state(request) -> dict:
    state = {"user_id": request.headers.get(CLERK_USER_ID_HEADER) or "anonymous"}
    kroger_token = request.headers.get(KROGER_TOKEN_HEADER)
    if kroger_token:
        state[KROGER_TOKEN_STATE_KEY] = kroger_token
        state["kroger_connected"] = True
    strava_token = request.headers.get(STRAVA_TOKEN_HEADER)
    if strava_token:
        state[STRAVA_TOKEN_STATE_KEY] = strava_token
        state["strava_connected"] = True
    return state


async def extract_wellness_state(request, _input_data) -> dict:
    return extract_identity_state(request)


def on_before_agent(callback_context: CallbackContext) -> None:
    for key, default in _DEFAULT_STATE.items():
        if key not in callback_context.state:
            callback_context.state[key] = default


def before_model_modifier(
    callback_context: CallbackContext,
    llm_request: LlmRequest,
) -> LlmResponse | None:
    state = {
        key: callback_context.state.get(key, default)
        for key, default in _DEFAULT_STATE.items()
    }
    llm_request.config.system_instruction = (
        "Current wellness state:\n"
        + json.dumps(state, indent=2, default=str)
        + "\n\n"
        + str(llm_request.config.system_instruction or "")
    )
    return None


class _TempStateSessionService(RequestStateSessionService):
    """Sets invocation temp state when temp: keys are injected into a session."""

    def _inject(self, session, key):
        session = super()._inject(session, key)
        if session is not None:
            state = session.state
            state_dict = state.to_dict() if hasattr(state, "to_dict") else state
            temp = {
                k: v
                for k, v in state_dict.items()
                if isinstance(k, str) and k.startswith("temp:")
            }
            if temp:
                set_invocation_temp_state(temp)
        return session


grocery_subagent = build_grocery_agent()
fitness_subagent = build_fitness_agent()


def set_weekly_wellness_plan(tool_context: ToolContext, plan: str) -> dict:
    """Write the complete weekly meal and workout plan to shared state."""
    tool_context.state["weekly_plan"] = plan
    tool_context.state["status"] = "planning"
    return {"ok": True, "length": len(plan)}


def mark_plan_ready(tool_context: ToolContext, summary: str) -> dict:
    """Mark the combined weekly wellness plan as ready."""
    tool_context.state["status"] = "ready"
    tool_context.state["review_summary"] = summary
    return {"ok": True}


def get_current_date() -> dict:
    """Return today's date for anchoring the combined weekly plan."""
    today = datetime.datetime.now(datetime.UTC).date()
    return {
        "date": today.isoformat(),
        "weekday": today.strftime("%A"),
        "month": today.strftime("%B %Y"),
    }


_INSTRUCTION = """\
You are a wellness planning orchestrator.

Your job is to create a practical one-week plan that combines meals and workouts.
The source of truth is shared state, not chat output.

You have two agent tools: fitness_agent and grocery_agent.
Call them with a plain-English request string. They return their result as text.

IMPORTANT: Call these tools one at a time, in order. Do NOT call both in the
same turn. Do NOT call grocery_agent until you have received and read the
full response from fitness_agent.

Workflow — follow these steps strictly in sequence:

Step 1. Call get_current_date. Note the date.

Step 2. Call fitness_agent with a request to: (a) summarise recent Strava
        activities, (b) build a DETAILED day-by-day training schedule for this week
        starting on that date — each day with session type, duration/distance or
        sets x reps, and target intensity — and (c) recommend ONE specific named hike
        for the week, including its distance, elevation gain, difficulty, and why it
        suits this athlete. STOP and wait for the full response before continuing.

Step 3. Once you have the fitness response, call grocery_agent.
        Your request MUST paste the full training schedule (and the recommended
        hike) from Step 2 so grocery can tailor meals to match (protein on strength
        days, lighter meals before hard sessions, extra fuel/hydration on the hike
        day, recovery nutrition on rest days).
        STOP and wait for the full response before continuing.

Step 4. Reconcile the two plans: heavy training days and the hike day get simpler
        meals, adequate protein, hydration, recovery, and realistic prep.

Step 5. Call set_weekly_wellness_plan with the final combined report. Structure:
        ## Recent Activity
        <summarise the recent Strava activities from the fitness response>

        ## Recommended Hike
        <the specific hike from Step 2: name, distance, elevation gain, difficulty,
         which day it is scheduled, and why it fits this athlete>

        ## This Week's Plan
        <day-by-day sections with markdown headings, each day showing the DETAILED
         workout (type, duration/distance or sets x reps, intensity) and the meals
         side by side; mark the hike on its scheduled day>

Step 6. Call mark_plan_ready only after Steps 2-5 all completed successfully.

If either agent tool returns an empty response or error, explain which step
failed and do not mark the plan ready.
"""

wellness_agent = LlmAgent(
    name="wellness_agent",
    model=LiteLlm(
        model="openrouter/poolside/laguna-m.1:free",
        fallbacks=[
            "mistral/mistral-small-latest",
            "openrouter/owl-alpha",
            "nvidia_nim/deepseek-ai/deepseek-v4-flash",
        ],
    ),
    instruction=_INSTRUCTION,
    before_agent_callback=on_before_agent,
    before_model_callback=before_model_modifier,
    after_tool_callback=shared_after_tool_callback,
    tools=[
        get_current_date,
        set_weekly_wellness_plan,
        mark_plan_ready,
        AGUIToolset(),
        AgentTool(agent=fitness_subagent),
        AgentTool(agent=grocery_subagent),
    ],
)

WELLNESS_PREDICT_STATE = [
    PredictStateMapping(
        state_key="weekly_plan",
        tool="set_weekly_wellness_plan",
        tool_argument="plan",
        emit_confirm_tool=False,
        stream_tool_call=True,
    ),
]

_shared_session_svc = _TempStateSessionService(create_session_service())
_session_container = SessionServiceContainer()
_artifact_svc = InMemoryArtifactService()
_memory_svc = InMemoryMemoryService()
_credential_svc = InMemoryCredentialService()


adk_wellness_agent = ADKAgent(
    adk_agent=wellness_agent,
    session_service=_shared_session_svc,
    artifact_service=_artifact_svc,
    memory_service=_memory_svc,
    credential_service=_credential_svc,
    session_timeout_seconds=3600,
    predict_state=WELLNESS_PREDICT_STATE,
)

app = FastAPI(title="Wellness Planning Agent")


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
    adk_wellness_agent,
    path="/agui",
    extract_state_from_request=extract_wellness_state,
)


@app.get("/health")
async def health():
    return await _session_container.check_database_connection()
