"""Wellness Planning Agent - orchestrates meal and workout plans over A2A."""

from __future__ import annotations

import datetime
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ag_ui_adk import ADKAgent, AGUIToolset, add_adk_fastapi_endpoint
from ag_ui_adk.config import PredictStateMapping
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes import create_agent_card_routes, create_jsonrpc_routes
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCapabilities, AgentCard, AgentSkill
from google.adk.agents import LlmAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.auth.credential_service.in_memory_credential_service import (
    InMemoryCredentialService,
)
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.models import LlmRequest, LlmResponse
from google.adk.models.lite_llm import LiteLlm
from google.adk.runners import Runner
from google.adk.sessions.sqlite_session_service import SqliteSessionService
from google.adk.tools import ToolContext
from opentelemetry import trace
from opentelemetry.instrumentation.sqlite3 import SQLite3Instrumentor
from opentelemetry.sdk.resources import Resource

from utils import (
    ADKAgentExecutor,
    FITNESS_AGENT_A2A_URL,
    GROCERY_AGENT_A2A_URL,
    call_a2a_agent,
    shared_after_tool_callback,
)

load_dotenv()

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logging.getLogger("google.adk").setLevel(logging.DEBUG)
logging.getLogger("litellm").setLevel(logging.DEBUG)
logging.getLogger("ag_ui_adk").setLevel(logging.DEBUG)

log = logging.getLogger("wellness_agent")

CLERK_USER_ID_HEADER = "x-clerk-user-id"

_DEFAULT_STATE: dict[str, Any] = {
    "status": "idle",
    "meal_plan": "",
    "workout_plan": "",
    "weekly_plan": "",
    "review_summary": "",
    "last_delegation": {},
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
    SQLite3Instrumentor().instrument()


_setup_otel()
tracer = trace.get_tracer("wellness-agent")


def _default_session_db_path() -> str:
    return str((Path(__file__).resolve().parents[2] / ".data" / "adk_sessions.sqlite"))


def _turso_db_url() -> Optional[str]:
    db_url = os.getenv("ADK_SESSION_DB_URL")
    if db_url:
        return db_url

    turso_url = os.getenv("TURSO_DATABASE_URL")
    if not turso_url:
        return None
    if turso_url.startswith("sqlite+"):
        return turso_url

    separator = "&" if "?" in turso_url else "?"
    return f"sqlite+{turso_url}{separator}secure=true"


def _database_session_kwargs() -> dict:
    connect_args = {}
    auth_token = os.getenv("ADK_SESSION_DB_AUTH_TOKEN") or os.getenv("TURSO_AUTH_TOKEN")
    sync_url = os.getenv("TURSO_SYNC_URL")
    if auth_token:
        connect_args["auth_token"] = auth_token
    if sync_url:
        connect_args["sync_url"] = sync_url
    return {"connect_args": connect_args} if connect_args else {}


def DatabaseSessionService(db_url: str, **kwargs):
    from google.adk.sessions.database_session_service import DatabaseSessionService as Service

    return Service(db_url, **kwargs)


def create_session_service():
    db_url = _turso_db_url()
    if db_url:
        return DatabaseSessionService(db_url, **_database_session_kwargs())

    db_path = Path(os.getenv("ADK_SESSION_DB_PATH", _default_session_db_path()))
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return SqliteSessionService(str(db_path))


def extract_identity_state(request) -> dict:
    return {"user_id": request.headers.get(CLERK_USER_ID_HEADER) or "anonymous"}


async def extract_wellness_state(request, input_data) -> dict:
    return extract_identity_state(request)


def on_before_agent(callback_context: CallbackContext):
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


def after_model_modifier(
    callback_context: CallbackContext, llm_response: LlmResponse
) -> Optional[LlmResponse]:
    if (
        llm_response.content
        and llm_response.content.parts
        and llm_response.content.role == "model"
        and llm_response.content.parts[0].text
    ):
        callback_context._invocation_context.end_invocation = True
    return None


async def request_meal_plan(tool_context: ToolContext, preferences: str = "") -> dict:
    """Delegate next-week meal planning to the grocery agent over A2A."""
    user_id = str(tool_context.state.get("user_id") or "anonymous")
    prompt = (
        "Plan next week's meals for this user. Return a concise but complete "
        "weekly meal plan with breakfast, lunch, dinner, and shopping notes."
    )
    if preferences:
        prompt += f"\n\nPreferences and constraints:\n{preferences}"

    tool_context.state["status"] = "delegating"
    try:
        text = await call_a2a_agent(
            url=GROCERY_AGENT_A2A_URL,
            prompt=prompt,
            user_id=user_id,
            context_id=f"wellness-grocery-{user_id}",
        )
    except Exception as exc:
        tool_context.state["status"] = "idle"
        tool_context.state["last_delegation"] = {"grocery": "error", "message": str(exc)}
        return {"ok": False, "dependency": "grocery", "message": str(exc)}

    tool_context.state["meal_plan"] = text
    tool_context.state["last_delegation"] = {"grocery": "ok"}
    return {"ok": True, "meal_plan": text}


async def request_workout_plan(tool_context: ToolContext, goal: str = "") -> dict:
    """Delegate next-week workout planning to the fitness agent over A2A."""
    user_id = str(tool_context.state.get("user_id") or "anonymous")
    prompt = (
        "Plan next week's workouts for this user. Return a concise but complete "
        "weekly workout plan with training, strength, mobility, and recovery."
    )
    if goal:
        prompt += f"\n\nTraining goal and constraints:\n{goal}"

    tool_context.state["status"] = "delegating"
    try:
        text = await call_a2a_agent(
            url=FITNESS_AGENT_A2A_URL,
            prompt=prompt,
            user_id=user_id,
            context_id=f"wellness-fitness-{user_id}",
        )
    except Exception as exc:
        tool_context.state["status"] = "idle"
        current = tool_context.state.get("last_delegation") or {}
        tool_context.state["last_delegation"] = {
            **current,
            "fitness": "error",
            "message": str(exc),
        }
        return {"ok": False, "dependency": "fitness", "message": str(exc)}

    tool_context.state["workout_plan"] = text
    current = tool_context.state.get("last_delegation") or {}
    tool_context.state["last_delegation"] = {**current, "fitness": "ok"}
    return {"ok": True, "workout_plan": text}


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

Workflow:
1. Call get_current_date before delegating or writing the final weekly plan so
   the week is anchored to today's actual date.
2. Call request_meal_plan before writing the final combined plan.
3. Call request_workout_plan before writing the final combined plan.
4. Reconcile meals and workouts: heavy training days need simpler meals, adequate
   protein, hydration, recovery, and realistic prep.
5. Write the final plan with set_weekly_wellness_plan. Use markdown day headings.
6. Call mark_plan_ready only after both delegation calls succeeded and the final
   combined plan is written.

If grocery or fitness delegation fails, explain which dependency failed and do
not mark the plan ready. Be concrete, conservative, and useful.
"""

wellness_agent = LlmAgent(
    name="wellness_agent",
    model=LiteLlm(
        model=os.getenv("AGENT_MODEL", "mistral/mistral-small-latest"),
        fallbacks=["openrouter/owl-alpha", "nvidia_nim/deepseek-ai/deepseek-v4-flash"],
    ),
    instruction=_INSTRUCTION,
    before_agent_callback=on_before_agent,
    before_model_callback=before_model_modifier,
    after_model_callback=after_model_modifier,
    after_tool_callback=shared_after_tool_callback,
    tools=[
        request_meal_plan,
        request_workout_plan,
        get_current_date,
        set_weekly_wellness_plan,
        mark_plan_ready,
        AGUIToolset(),
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

_shared_session_svc = create_session_service()

_a2a_runner = Runner(
    app_name=wellness_agent.name,
    agent=wellness_agent,
    artifact_service=InMemoryArtifactService(),
    session_service=_shared_session_svc,
    memory_service=InMemoryMemoryService(),
    credential_service=InMemoryCredentialService(),
)


def _a2a_agent_card() -> AgentCard:
    return AgentCard(
        name="Wellness Planning Agent",
        description=(
            "Creates a one-week wellness plan by coordinating meal planning "
            "with grocery and workout planning with fitness over A2A."
        ),
        version="1.0.0",
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain"],
        capabilities=AgentCapabilities(streaming=True),
        skills=[
            AgentSkill(
                id="wellness_planning",
                name="Wellness Planning",
                description="Plans next week's meals and workouts by delegating over A2A.",
                input_modes=["text/plain"],
                output_modes=["text/plain"],
            )
        ],
    )


adk_wellness_agent = ADKAgent(
    adk_agent=wellness_agent,
    session_service=_shared_session_svc,
    session_timeout_seconds=3600,
    use_in_memory_services=True,
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
    agent_executor=ADKAgentExecutor(_a2a_runner),
    task_store=InMemoryTaskStore(),
    agent_card=_a2a_card,
)
app.router.routes.extend(create_agent_card_routes(_a2a_card))
app.router.routes.extend(create_jsonrpc_routes(_a2a_handler, "/"))

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
