"""Fitness agent domain: state, tools, instructions."""

import asyncio
import datetime
import logging
import time
from typing import TypedDict

import httpx
from ag_ui_adk import AGUIToolset
from agents_shared.prompts import canvas_contract
from agents_shared.state import (
    STRAVA_AUTH,
    make_state_initializer,
    make_state_instruction,
)
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    build_model,
    get_current_date,
    make_mark_ready,
    on_model_error_callback,
)
from google.adk.agents import LlmAgent
from google.adk.tools import ToolContext
from pydantic import BaseModel

from .toolsets import web_search_toolset

log = logging.getLogger("fitness_agent")

STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities"


# ---------------------------------------------------------------------------
# State model
# ---------------------------------------------------------------------------
class StravaActivity(TypedDict):
    id: str
    name: str
    sport_type: str | None
    start_date: str | None
    distance_m: float | None
    moving_time_s: int | None
    elapsed_time_s: int | None
    total_elevation_gain_m: float | None
    average_heartrate: float | None
    perceived_effort: int | None


class FitnessState(BaseModel):
    """Default shared-state shape for the fitness agent."""

    strava_connected: bool = False
    activities: list[StravaActivity] = []
    activities_synced_at: str = ""
    objective_research: str = ""
    training_plan: str = ""
    status: str = "idle"
    review_summary: str = ""
    user_id: str = ""


# ---------------------------------------------------------------------------
# Activity helpers
# ---------------------------------------------------------------------------
def normalize_strava_activity(activity: dict[str, object]) -> StravaActivity:
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


def summarize_activities(activities: list[StravaActivity]) -> dict[str, object]:
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
    token = str(tool_context.state.get(STRAVA_AUTH.state_key) or "")
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
    params: dict[str, str | int] = {"per_page": 200, "page": page}
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
        log.exception("fetch_activities: network error")
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


# ---------------------------------------------------------------------------
# State tools — UI canvas writes
# ---------------------------------------------------------------------------
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


mark_plan_ready = make_mark_ready(
    "mark_plan_ready",
    "ready",
    doc="Mark the training plan as ready for review.",
)


# Brave's free search tier allows ~1 request/second and returns 429s when bursted,
# which is the most common failure mode for this agent. Enforce a minimum spacing
# between web-search tool calls across the whole process as a hard floor; the
# instruction also asks the model to keep its total number of searches small.
_WEB_SEARCH_MIN_INTERVAL_S = 1.2
_web_search_lock = asyncio.Lock()
_web_search_state: dict[str, float] = {"last_at": 0.0}


async def throttle_web_search(tool, args, tool_context) -> None:
    """Space out Brave web-search calls to respect the free-tier rate limit."""
    if not str(getattr(tool, "name", "")).startswith("brave_"):
        return
    async with _web_search_lock:
        elapsed = time.monotonic() - _web_search_state["last_at"]
        if elapsed < _WEB_SEARCH_MIN_INTERVAL_S:
            wait = _WEB_SEARCH_MIN_INTERVAL_S - elapsed
            log.debug("throttle_web_search: sleeping %.2fs before %s", wait, tool.name)
            await asyncio.sleep(wait)
        _web_search_state["last_at"] = time.monotonic()
    return


_STATE_INSTRUCTION = make_state_instruction(
    FitnessState, header="Current fitness state"
)


# ---------------------------------------------------------------------------
# Static instruction
# ---------------------------------------------------------------------------
_CANVAS_CONTRACT = canvas_contract(
    artifact="training plan and objective research",
    tools=(
        "fetch_activities",
        "set_objective_research",
        "set_training_plan",
        "mark_plan_ready",
    ),
)

_INSTRUCTION = (
    """\
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

"""
    + _CANVAS_CONTRACT
    + """

## Workflow (only when strava_connected is True)
Plan weekly training from the user's recent Strava history.
Support endurance workouts, gym strength, stretching, recovery, and preparation
for hiking or mountaineering objectives.

1. Call get_current_date and fetch_activities in parallel when the activity
   snapshot is missing or stale — they are independent and can share one turn.
   Only call get_current_date alone when activities are already fresh in state.
3. Recommend ONE specific named hike suited to the athlete's recent fitness and
   the season. For that hike (and any mountaineering objective), make at most one
   batched web search for current route, access, permit, seasonal, and weather
   context, then call set_objective_research with a concise sourced summary that
   names the hike, its distance, elevation gain, and why it fits this athlete.
4. Write plans to state with set_training_plan.
5. Make the plan DETAILED and day-by-day: for each day give the session type,
   duration/distance or sets x reps, target intensity (easy/tempo/threshold or RPE),
   plus weekly goals, gym sessions, mobility, stretching, recovery guidance, and
   prep for the recommended hike. Schedule the recommended hike on a specific day.
6. When the plan is complete, call mark_plan_ready.

Be conservative with progression, specific about recovery, and clear about
assumptions when Strava or objective context is unavailable.
"""
)


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------
def build_agent(
    *, mode: str | None = None, include_contents: str = "default"
) -> LlmAgent:
    """Fresh LlmAgent instance — the gateway's wellness orchestrator builds its own."""
    return LlmAgent(
        name="fitness_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        mode=mode,
        include_contents=include_contents,
        state_schema=FitnessState,
        static_instruction=_INSTRUCTION,
        instruction=_STATE_INSTRUCTION,
        before_agent_callback=make_state_initializer(
            FitnessState,
            token_flags={STRAVA_AUTH.state_key: STRAVA_AUTH.connected_flag},
        ),
        before_tool_callback=throttle_web_search,
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
