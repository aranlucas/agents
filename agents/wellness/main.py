"""Wellness Planning Agent - orchestrates meal and workout plans over A2A."""

import contextvars
import datetime
import json
import logging
import os
import time
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ag_ui_adk import ADKAgent, AGUIToolset, add_adk_fastapi_endpoint
from ag_ui_adk.config import PredictStateMapping
from ag_ui_adk.request_state_service import RequestStateSessionService
from a2a.server.apps.jsonrpc import A2AFastAPIApplication
from a2a.server.request_handlers import DefaultRequestHandler
from agent_common.task_store import create_task_store
from a2a.types import AgentCapabilities, AgentCard, AgentSkill
from google.adk.agents import LlmAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.agents.remote_a2a_agent import (
    AGENT_CARD_WELL_KNOWN_PATH,
    RemoteA2aAgent,
)
from google.adk.tools.agent_tool import AgentTool
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.auth.credential_service.in_memory_credential_service import (
    InMemoryCredentialService,
)
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.models import LlmRequest, LlmResponse
from google.adk.models.lite_llm import LiteLlm
from google.adk.runners import Runner
from google.adk.tools import ToolContext
from opentelemetry import trace
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource

from utils import FITNESS_AGENT_A2A_URL, GROCERY_AGENT_A2A_URL
from agent_common.a2a import (
    apply_a2a_auth_metadata_to_state,
    create_a2a_agent_executor,
)
from agent_common.session_service import create_session_service
from agent_common.tools import shared_after_tool_callback

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

_DEFAULT_STATE: dict[str, Any] = {
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
        }
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
    strava_token = request.headers.get(STRAVA_TOKEN_HEADER)
    if strava_token:
        state[STRAVA_TOKEN_STATE_KEY] = strava_token
    return state


async def extract_wellness_state(request, input_data) -> dict:
    return extract_identity_state(request)


def on_before_agent(callback_context: CallbackContext):
    apply_a2a_auth_metadata_to_state(callback_context)
    for key, default in _DEFAULT_STATE.items():
        if key not in callback_context.state:
            callback_context.state[key] = default
    return None


def before_model_modifier(
    callback_context: CallbackContext, llm_request: LlmRequest
) -> Optional[LlmResponse]:
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


def _agent_card_url(base_url: str) -> str:
    return base_url.rstrip("/") + AGENT_CARD_WELL_KNOWN_PATH


# Set once per invocation by _TempStateSessionService._inject when the ADK
# runner fetches the session. AgentTool's child runner (InMemorySessionService)
# strips temp: keys, but inherits this async context, so the metadata provider
# can read credentials here without needing before_tool_callback.
_invocation_temp_state: contextvars.ContextVar[dict] = contextvars.ContextVar(
    "_invocation_temp_state", default={}
)


class _TempStateSessionService(RequestStateSessionService):
    """Sets _invocation_temp_state when temp: keys are injected into a session."""

    def _inject(self, session, key):
        session = super()._inject(session, key)
        if session is not None:
            temp = {
                k: v
                for k, v in session.state.to_dict().items()
                if isinstance(k, str) and k.startswith("temp:")
            }
            if temp:
                _invocation_temp_state.set(temp)
        return session


def _remote_a2a_metadata_provider(invocation_context, _message) -> dict[str, str]:
    state = invocation_context.session.state
    fallback = _invocation_temp_state.get({})
    kroger_token = state.get(KROGER_TOKEN_STATE_KEY) or fallback.get(KROGER_TOKEN_STATE_KEY)
    strava_token = state.get(STRAVA_TOKEN_STATE_KEY) or fallback.get(STRAVA_TOKEN_STATE_KEY)
    user_id = state.get("user_id") or fallback.get("user_id") or "anonymous"
    log.info(
        "[metadata_provider] kroger_token present: %s | strava_token present: %s | source: %s",
        bool(kroger_token),
        bool(strava_token),
        "session" if state.get(KROGER_TOKEN_STATE_KEY) else "contextvar",
    )
    return {
        "user_id": str(user_id),
        "kroger_access_token": str(kroger_token or ""),
        "strava_access_token": str(strava_token or ""),
    }


grocery_remote_agent = RemoteA2aAgent(
    name="grocery_remote_agent",
    description="Plans one-week meal plans and shopping notes.",
    agent_card=_agent_card_url(GROCERY_AGENT_A2A_URL),
    a2a_request_meta_provider=_remote_a2a_metadata_provider,
    use_legacy=False,
    timeout=300.0,
)

fitness_remote_agent = RemoteA2aAgent(
    name="fitness_remote_agent",
    description="Plans one-week workout, recovery, strength, and mobility schedules.",
    agent_card=_agent_card_url(FITNESS_AGENT_A2A_URL),
    a2a_request_meta_provider=_remote_a2a_metadata_provider,
    use_legacy=False,
    timeout=300.0,
)


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
    today = datetime.date.today()
    return {
        "date": today.isoformat(),
        "weekday": today.strftime("%A"),
        "month": today.strftime("%B %Y"),
    }


_INSTRUCTION = """\
You are a wellness planning orchestrator.

Your job is to create a practical one-week plan that combines meals and workouts.
The source of truth is shared state, not chat output.

You have two agent tools: fitness_remote_agent and grocery_remote_agent.
Call them with a plain-English request string. They return their result as text.

Workflow:
1. Call get_current_date so the week is anchored to today's actual date.
2. Call fitness_remote_agent with request="Plan this week's training schedule
   starting <date>." and wait for the response. The response is the fitness plan.
3. Call grocery_remote_agent with a request that includes the key details from
   the fitness plan (training load, high-intensity days, rest days) so it can
   tailor meals: more protein on strength days, lighter meals before hard
   sessions, recovery nutrition on rest days.
4. Reconcile the two plans: heavy training days need simpler meals, adequate
   protein, hydration, recovery, and realistic prep.
5. Write the final plan with set_weekly_wellness_plan. Use markdown day headings.
6. Call mark_plan_ready only after both agent tools returned successfully and
   the final combined plan is written.

If either agent tool returns an empty response or error, explain which dependency
failed and do not mark the plan ready. Be concrete, conservative, and useful.
"""

wellness_agent = LlmAgent(
    name="wellness_agent",
    model=LiteLlm(
        model="openrouter/moonshotai/kimi-k2.6:free",
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
        AgentTool(agent=fitness_remote_agent),
        AgentTool(agent=grocery_remote_agent),
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
_artifact_svc = InMemoryArtifactService()
_memory_svc = InMemoryMemoryService()
_credential_svc = InMemoryCredentialService()

_a2a_runner = Runner(
    app_name=wellness_agent.name,
    agent=wellness_agent,
    artifact_service=_artifact_svc,
    session_service=_shared_session_svc,
    memory_service=_memory_svc,
    credential_service=_credential_svc,
)


def _a2a_agent_card() -> AgentCard:
    return AgentCard(
        name="Wellness Planning Agent",
        description=(
            "Creates a one-week wellness plan by coordinating meal planning "
            "with grocery and workout planning with fitness over A2A."
        ),
        version="1.0.0",
        url=AGENT_PUBLIC_URL,
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain"],
        capabilities=AgentCapabilities(streaming=True),
        skills=[
            AgentSkill(
                id="wellness_planning",
                name="Wellness Planning",
                description="Plans next week's meals and workouts by delegating over A2A.",
                tags=["wellness", "meal-planning", "training-planning"],
                input_modes=["text/plain"],
                output_modes=["text/plain"],
            )
        ],
    )


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
    if request.url.path == "/health":
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
            "duration_ms", round((time.perf_counter() - start) * 1000, 2)
        )
        return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_a2a_card = _a2a_agent_card()
_a2a_handler = DefaultRequestHandler(
    agent_executor=create_a2a_agent_executor(_a2a_runner),
    task_store=create_task_store(),
)
A2AFastAPIApplication(
    agent_card=_a2a_card,
    http_handler=_a2a_handler,
).add_routes_to_app(app)

add_adk_fastapi_endpoint(
    app,
    adk_wellness_agent,
    path="/agui",
    extract_state_from_request=extract_wellness_state,
)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8003"))
    uvicorn.run(app, host="0.0.0.0", port=port)
