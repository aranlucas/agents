"""Fitness Training Agent — Strava + objective research + AG-UI shared state."""

import datetime
import logging
import os
import time
from typing import Any, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ag_ui_adk import ADKAgent, AGUIToolset, add_adk_fastapi_endpoint
from ag_ui_adk.config import PredictStateMapping
from google.adk.agents import LlmAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.models import LlmRequest, LlmResponse
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import ToolContext
from opentelemetry import trace
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource
from utils import web_search_toolset

from a2a.server.apps.jsonrpc import A2AFastAPIApplication
from a2a.server.request_handlers import DefaultRequestHandler
from agent_common.task_store import create_task_store
from a2a.types import AgentCapabilities, AgentCard, AgentSkill

from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.auth.credential_service.in_memory_credential_service import (
    InMemoryCredentialService,
)
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.runners import Runner

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
# Surface ADK and LiteLLM internals at DEBUG so auth/model errors are visible.
logging.getLogger("google.adk").setLevel(logging.DEBUG)
logging.getLogger("litellm").setLevel(logging.DEBUG)
logging.getLogger("ag_ui_adk").setLevel(logging.DEBUG)

log = logging.getLogger("fitness_agent")

_railway_domain = os.getenv("RAILWAY_PUBLIC_DOMAIN")
AGENT_PUBLIC_URL = os.getenv("AGENT_PUBLIC_URL") or (
    f"https://{_railway_domain}" if _railway_domain else "http://localhost:8002"
)
STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities"
STRAVA_TOKEN_HEADER = "x-strava-access-token"
STRAVA_TOKEN_STATE_KEY = "temp:strava_token"
CLERK_USER_ID_HEADER = "x-clerk-user-id"


def extract_identity_state(request) -> dict[str, Any]:
    return {"user_id": request.headers.get(CLERK_USER_ID_HEADER) or "anonymous"}


_DEFAULT_STATE: dict[str, Any] = {
    "strava_connected": False,
    "activities": [],
    "activities_synced_at": "",
    "objective_research": "",
    "training_plan": "",
    "status": "idle",
    "review_summary": "",
}


def _setup_otel() -> None:
    if not os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return

    from google.adk.telemetry.setup import maybe_set_otel_providers

    resource = Resource.create(
        {
            "service.name": os.getenv("RAILWAY_SERVICE_NAME", "fitness-agent"),
            "service.version": os.getenv("RAILWAY_GIT_COMMIT_SHA", "dev"),
            "deployment.environment": os.getenv("RAILWAY_ENVIRONMENT_NAME", "local"),
            "railway.project.id": os.getenv("RAILWAY_PROJECT_ID", ""),
            "railway.service.id": os.getenv("RAILWAY_SERVICE_ID", ""),
        }
    )
    maybe_set_otel_providers(otel_resource=resource)
    SQLAlchemyInstrumentor().instrument()


_setup_otel()
tracer = trace.get_tracer("fitness-agent")


def normalize_strava_activity(activity: dict[str, Any]) -> dict[str, Any]:
    mapping = {
        "id": str(activity.get("id", "")),
        "name": activity.get("name") or "Untitled activity",
        "sport_type": activity.get("sport_type") or activity.get("type"),
        "start_date": activity.get("start_date"),
        "distance_m": activity.get("distance"),
        "moving_time_s": activity.get("moving_time"),
        "elapsed_time_s": activity.get("elapsed_time"),
        "total_elevation_gain_m": activity.get("total_elevation_gain"),
        "average_heartrate": activity.get("average_heartrate"),
        "perceived_effort": activity.get("perceived_exertion"),
    }
    return {key: value for key, value in mapping.items() if value not in (None, "")}


def summarize_activities(activities: list[dict[str, Any]]) -> dict[str, Any]:
    distance_m = sum(float(a.get("distance_m") or 0) for a in activities)
    moving_time_s = sum(int(a.get("moving_time_s") or 0) for a in activities)
    elevation_m = sum(float(a.get("total_elevation_gain_m") or 0) for a in activities)
    sport_counts: dict[str, int] = {}
    for activity in activities:
        sport = str(activity.get("sport_type") or "Activity")
        sport_counts[sport] = sport_counts.get(sport, 0) + 1

    return {
        "activity_count": len(activities),
        "distance_km": round(distance_m / 1000, 1),
        "moving_hours": round(moving_time_s / 3600, 1),
        "elevation_m": round(elevation_m),
        "sport_counts": sport_counts,
    }


async def fetch_activities(
    tool_context: ToolContext,
    after: Optional[int] = None,
    next_page_token: Optional[int] = None,
) -> dict:
    """Fetch one page of Strava activities (200 per page).

    Pass `after` as a Unix timestamp to limit to activities after that date.
    Pass `next_page_token` from a previous response to fetch the next page —
    omit it (or pass 1) to start from the most recent activities.
    Activities are appended to state across calls so the full history builds up.
    """
    token = tool_context.state.get(STRAVA_TOKEN_STATE_KEY) or ""
    connected = bool(tool_context.state.get("strava_connected")) and bool(token)
    log.debug(
        "fetch_activities: strava_connected=%s token_present=%s page=%s",
        tool_context.state.get("strava_connected"),
        bool(token),
        next_page_token or 1,
    )
    if not connected:
        log.warning(
            "fetch_activities: aborting — strava_connected=%s token_present=%s",
            tool_context.state.get("strava_connected"),
            bool(token),
        )
        tool_context.state["status"] = "idle"
        return {
            "ok": False,
            "reason": "strava_not_connected",
            "message": "Connect Strava before syncing activities.",
        }

    tool_context.state["status"] = "syncing"
    page = next_page_token or 1
    params: dict[str, Any] = {"per_page": 200, "page": page}
    if after is not None:
        params["after"] = after

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                STRAVA_ACTIVITIES_URL,
                headers={"Authorization": f"Bearer {token}"},
                params=params,
            )
            response.raise_for_status()
            batch = response.json()
    except httpx.HTTPStatusError as exc:
        tool_context.state["status"] = "idle"
        status_code = exc.response.status_code
        reason = (
            "strava_unauthorized" if status_code in (401, 403) else "strava_api_error"
        )
        log.exception(
            "fetch_activities: Strava HTTP error status=%s reason=%s body=%s",
            status_code,
            reason,
            exc.response.text[:500],
        )
        return {"ok": False, "reason": reason, "status_code": status_code}
    except httpx.HTTPError as exc:
        tool_context.state["status"] = "idle"
        log.exception("fetch_activities: network error: %s", exc)
        return {"ok": False, "reason": "strava_network_error", "message": str(exc)}

    normalized_batch = [normalize_strava_activity(activity) for activity in batch]
    existing = tool_context.state.get("activities") or []
    all_activities = existing + normalized_batch if page > 1 else normalized_batch
    synced_at = datetime.datetime.now(datetime.UTC).isoformat()

    tool_context.state["activities"] = all_activities
    tool_context.state["activities_synced_at"] = synced_at
    tool_context.state["status"] = "planning"

    has_more = len(batch) == 200
    log.debug(
        "fetch_activities: page=%s batch=%s total=%s has_more=%s",
        page,
        len(batch),
        len(all_activities),
        has_more,
    )

    return {
        "ok": True,
        "count": len(all_activities),
        "synced_at": synced_at,
        "activities": normalized_batch,
        **({"next_page_token": page + 1} if has_more else {}),
    }


async def extract_strava_auth_state(request, input_data) -> dict[str, Any]:
    """Inject Strava auth as per-invocation temp state from request headers."""
    state = extract_identity_state(request)
    token = request.headers.get(STRAVA_TOKEN_HEADER) or ""
    log.debug(
        "extract_strava_auth_state: header=%s token_present=%s",
        STRAVA_TOKEN_HEADER,
        bool(token),
    )
    if not token:
        log.warning(
            "No Strava token in request headers — agent will run without Strava access"
        )
        return {**state, "strava_connected": False}
    return {**state, "strava_connected": True, STRAVA_TOKEN_STATE_KEY: token}


def set_objective_research(tool_context: ToolContext, research: str) -> dict:
    """Write curated outdoor objective research to shared state."""
    tool_context.state["objective_research"] = research
    tool_context.state["status"] = "planning"
    return {"ok": True, "length": len(research)}


def set_training_plan(tool_context: ToolContext, plan: str) -> dict:
    """Write the complete weekly training plan to shared state."""
    tool_context.state["training_plan"] = plan
    tool_context.state["status"] = "planning"
    return {"ok": True, "length": len(plan)}


def mark_plan_ready(tool_context: ToolContext, summary: str) -> dict:
    """Mark the weekly training plan as ready."""
    tool_context.state["status"] = "ready"
    tool_context.state["review_summary"] = summary
    return {"ok": True}


def get_current_date() -> dict:
    """Return today's date for weekly training-plan scheduling."""
    today = datetime.date.today()
    return {
        "date": today.isoformat(),
        "weekday": today.strftime("%A"),
        "month": today.strftime("%B %Y"),
    }


def on_before_agent(callback_context: CallbackContext):
    apply_a2a_auth_metadata_to_state(callback_context)
    for key, default in _DEFAULT_STATE.items():
        if key not in callback_context.state:
            callback_context.state[key] = default
    return None


def before_model_modifier(
    callback_context: CallbackContext, llm_request: LlmRequest
) -> Optional[LlmResponse]:
    state = callback_context.state
    connected = bool(
        state.get("strava_connected") and state.get(STRAVA_TOKEN_STATE_KEY)
    )
    activity_count = len(state.get("activities") or [])
    synced_at = state.get("activities_synced_at") or ""

    prefix = f"""Current fitness state:
- Strava connected: {connected}
- Synced activities: {activity_count}
- Activities synced at: {synced_at or "never"}

If Strava is connected and you are about to create or revise a training plan,
call fetch_activities first when activities are missing or stale.

"""
    original = llm_request.config.system_instruction or ""
    llm_request.config.system_instruction = prefix + str(original)
    return None


_INSTRUCTION = """\
You are a practical fitness training partner.

Plan weekly training from the user's recent Strava history when available.
Support endurance workouts, gym strength, stretching, recovery, and preparation
for hiking or mountaineering objectives.

Workflow:
1. Call get_current_date before creating or revising a weekly plan so the week
   is anchored to today's actual date.
2. If Strava is connected and you are creating or revising a plan, call
   fetch_activities first when the activity snapshot is missing or stale.
3. For hiking or mountaineering objectives, use web search tools to find current
   route, access, permit, seasonal, and weather context. Then call
   set_objective_research with a concise sourced summary.
4. Write plans to state with set_training_plan. Do not paste the full plan into
   chat as the source of truth.
5. Include weekly goals, workout days, gym sessions, mobility, stretching,
   recovery guidance, and objective-specific prep.
6. When the plan is complete, call mark_plan_ready.

Be conservative with progression, specific about recovery, and clear about
assumptions when Strava or objective context is unavailable.
"""


fitness_agent = LlmAgent(
    name="fitness_agent",
    model=LiteLlm(
        model="openrouter/moonshotai/kimi-k2.6:free",
        fallbacks=["mistral/mistral-small-latest", "openrouter/owl-alpha", "nvidia_nim/deepseek-ai/deepseek-v4-flash"],
    ),
    instruction=_INSTRUCTION,
    before_agent_callback=on_before_agent,
    before_model_callback=before_model_modifier,
    after_tool_callback=shared_after_tool_callback,
    tools=[
        fetch_activities,
        get_current_date,
        set_objective_research,
        set_training_plan,
        mark_plan_ready,
        AGUIToolset(),
        web_search_toolset(),
    ],
)

FITNESS_PREDICT_STATE = [
    PredictStateMapping(
        state_key="training_plan",
        tool="set_training_plan",
        tool_argument="plan",
        emit_confirm_tool=False,
        stream_tool_call=True,
    ),
]

# Shared SQLite session service — used by both AG-UI and A2A paths.
_shared_session_svc = create_session_service()
_artifact_svc = InMemoryArtifactService()
_memory_svc = InMemoryMemoryService()
_credential_svc = InMemoryCredentialService()

_a2a_runner = Runner(
    app_name=fitness_agent.name,
    agent=fitness_agent,
    artifact_service=_artifact_svc,
    session_service=_shared_session_svc,
    memory_service=_memory_svc,
    credential_service=_credential_svc,
)


def _a2a_agent_card() -> AgentCard:
    return AgentCard(
        name="Fitness Training Agent",
        description=(
            "Builds weekly training plans from Strava activity history and "
            "research on outdoor objectives like hiking and mountaineering."
        ),
        version="1.0.0",
        url=AGENT_PUBLIC_URL,
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain"],
        capabilities=AgentCapabilities(streaming=True),
        skills=[
            AgentSkill(
                id="training_planning",
                name="Training Planning",
                description="Creates weekly training plans from Strava data and objective research.",
                tags=["fitness", "training-planning"],
                input_modes=["text/plain"],
                output_modes=["text/plain"],
            )
        ],
    )


adk_fitness_agent = ADKAgent(
    adk_agent=fitness_agent,
    session_service=_shared_session_svc,
    artifact_service=_artifact_svc,
    memory_service=_memory_svc,
    credential_service=_credential_svc,
    session_timeout_seconds=3600,
    predict_state=FITNESS_PREDICT_STATE,
)

app = FastAPI(title="Fitness Training Agent")


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

# A2A — JSON-RPC at POST / and agent card at GET /.well-known/agent-card.json
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
    adk_fitness_agent,
    path="/agui",
    extract_state_from_request=extract_strava_auth_state,
)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8002"))
    uvicorn.run(app, host="0.0.0.0", port=port)
