"""Fitness Training Agent — Strava + objective research + AG-UI shared state."""

import asyncio
import datetime
import logging
import os
import time
from typing import Any

import httpx
from ag_ui_adk import ADKAgent, AGUIToolset, add_adk_fastapi_endpoint
from ag_ui_adk.config import PredictStateMapping
from agent_common.invocation_state import get_invocation_temp
from agent_common.session_service import SessionServiceContainer, create_session_service
from agent_common.tools import shared_after_tool_callback
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
from opentelemetry import trace
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource

from .utils import web_search_toolset

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
        },
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
    after: int | None = None,
    next_page_token: int | None = None,
) -> dict:
    """Fetch one page of Strava activities (200 per page).

    Pass `after` as a Unix timestamp to limit to activities after that date.
    Pass `next_page_token` from a previous response to fetch the next page —
    omit it (or pass 1) to start from the most recent activities.
    Activities are appended to state across calls so the full history builds up.
    """
    token = get_invocation_temp(STRAVA_TOKEN_STATE_KEY, tool_context.state)
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


async def extract_strava_auth_state(request, _input_data) -> dict[str, Any]:
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
            "No Strava token in request headers — agent will run without Strava access",
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
    today = datetime.datetime.now(datetime.UTC).date()
    return {
        "date": today.isoformat(),
        "weekday": today.strftime("%A"),
        "month": today.strftime("%B %Y"),
    }


def on_before_agent(callback_context: CallbackContext) -> None:
    token = get_invocation_temp(STRAVA_TOKEN_STATE_KEY, callback_context.state)
    if token:
        callback_context.state["strava_connected"] = True
    for key, default in _DEFAULT_STATE.items():
        if key not in callback_context.state:
            callback_context.state[key] = default


# Brave's free search tier allows ~1 request/second and returns 429s when bursted,
# which is the most common failure mode for this agent. Enforce a minimum spacing
# between web-search tool calls across the whole process as a hard floor; the
# instruction also asks the model to keep its total number of searches small.
_WEB_SEARCH_MIN_INTERVAL_S = 1.2
_web_search_lock = asyncio.Lock()
_last_web_search_at = 0.0


async def throttle_web_search(tool, args, tool_context) -> None:
    """Space out Brave web-search calls to respect the free-tier rate limit."""
    if not str(getattr(tool, "name", "")).startswith("brave_"):
        return
    global _last_web_search_at
    async with _web_search_lock:
        elapsed = time.monotonic() - _last_web_search_at
        if elapsed < _WEB_SEARCH_MIN_INTERVAL_S:
            wait = _WEB_SEARCH_MIN_INTERVAL_S - elapsed
            log.debug("throttle_web_search: sleeping %.2fs before %s", wait, tool.name)
            await asyncio.sleep(wait)
        _last_web_search_at = time.monotonic()
    return


def before_model_modifier(
    callback_context: CallbackContext,
    llm_request: LlmRequest,
) -> LlmResponse | None:
    state = callback_context.state
    connected = bool(
        state.get("strava_connected")
        and get_invocation_temp(STRAVA_TOKEN_STATE_KEY, state),
    )
    activity_count = len(state.get("activities") or [])
    synced_at = state.get("activities_synced_at") or ""

    strava_notice = (
        "If Strava is connected and you are about to create or revise a training plan,\n"
        "call fetch_activities first when activities are missing or stale."
        if connected
        else "Strava is not connected. Do NOT call fetch_activities. Tell the user their\n"
        "Strava account isn't connected and they need to connect it in the UI.\n"
        "Do not generate a training plan until Strava is connected."
    )
    prefix = f"""Current fitness state:
- Strava connected: {connected}
- Synced activities: {activity_count}
- Activities synced at: {synced_at or "never"}

{strava_notice}

"""
    original = llm_request.config.system_instruction or ""
    llm_request.config.system_instruction = prefix + str(original)
    return None


_INSTRUCTION = """\
You are a practical fitness training partner.

## Auth gate
If `strava_connected` is False in the current state, stop immediately. Tell the user
their Strava account isn't connected and they need to connect it in the UI before you
can plan training. Do not call fetch_activities and do not generate a training plan.

## Web search budget (IMPORTANT — throttle to avoid rate limits)
Web search runs against a shared, rate-limited free tier and frequently returns
429 / "too many requests" errors when called rapidly. Treat it as a scarce resource:
- Make AT MOST 2 web searches for an entire plan. Prefer a single, well-formed query.
- Batch your questions into one broad query (e.g. route + permits + season + weather
  in one search) instead of many narrow back-to-back searches.
- Only search when you genuinely need current external facts (trail conditions,
  permits, seasonal access, weather). Do NOT search for general training knowledge
  you already have.
- If a search returns a rate-limit / 429 / error, do NOT retry in a loop. Proceed
  with what you already know and note the assumption in the plan.

## Workflow (only when strava_connected is True)
Plan weekly training from the user's recent Strava history.
Support endurance workouts, gym strength, stretching, recovery, and preparation
for hiking or mountaineering objectives.

1. Call get_current_date before creating or revising a weekly plan so the week
   is anchored to today's actual date.
2. Call fetch_activities first when the activity snapshot is missing or stale.
3. Recommend ONE specific named hike suited to the athlete's recent fitness and
   the season. For that hike (and any mountaineering objective), make at most one
   batched web search for current route, access, permit, seasonal, and weather
   context, then call set_objective_research with a concise sourced summary that
   names the hike, its distance, elevation gain, and why it fits this athlete.
4. Write plans to state with set_training_plan. Do not paste the full plan into
   chat as the source of truth.
5. Make the plan DETAILED and day-by-day: for each day give the session type,
   duration/distance or sets x reps, target intensity (easy/tempo/threshold or RPE),
   plus weekly goals, gym sessions, mobility, stretching, recovery guidance, and
   prep for the recommended hike. Schedule the recommended hike on a specific day.
6. When the plan is complete, call mark_plan_ready.

Be conservative with progression, specific about recovery, and clear about
assumptions when Strava or objective context is unavailable.
"""


def build_agent() -> LlmAgent:
    """Fresh LlmAgent instance — the gateway's wellness orchestrator builds its own."""
    return LlmAgent(
        name="fitness_agent",
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
        before_tool_callback=throttle_web_search,
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


fitness_agent = build_agent()

FITNESS_PREDICT_STATE = [
    PredictStateMapping(
        state_key="training_plan",
        tool="set_training_plan",
        tool_argument="plan",
        emit_confirm_tool=False,
        stream_tool_call=True,
    ),
]

# Shared SQLite session service.
_shared_session_svc = create_session_service()
_session_container = SessionServiceContainer()
_artifact_svc = InMemoryArtifactService()
_memory_svc = InMemoryMemoryService()
_credential_svc = InMemoryCredentialService()


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
    adk_fitness_agent,
    path="/agui",
    extract_state_from_request=extract_strava_auth_state,
)


@app.get("/health")
async def health():
    return await _session_container.check_database_connection()


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8002"))
    uvicorn.run(app, host="0.0.0.0", port=port)
