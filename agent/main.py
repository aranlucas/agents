"""Collab Studio — Trip Planning agent backend.

A single ADK agent that co-plans a trip with the operator:

  * streams the day-by-day itinerary into shared state token-by-token
    (PredictStateMapping → live UI rendering),
  * reads operator preferences (home airport, budget tier, vibe, pace,
    dietary, mobility) and respects them via a before-model callback
    that injects a TRAVELER_BRIEF block into the system instruction
    every turn,
  * requests human approval before "locking" the trip via a frontend
    tool (request_user_approval) registered with useFrontendTool.

Backed by Mistral via LiteLLM. The FastAPI app mounts the agent at "/"
via ag-ui-adk, plus a /health endpoint for the dev script.
"""

from __future__ import annotations

import os
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ag_ui_adk import ADKAgent, AGUIToolset, add_adk_fastapi_endpoint
from ag_ui_adk.config import PredictStateMapping

from google.adk.agents import LlmAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.models import LlmRequest
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import ToolContext
from google.genai import types as genai_types
from opentelemetry import trace
from opentelemetry.instrumentation.sqlite3 import SQLite3Instrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.semconv.resource import ResourceAttributes

from utils import trvl_toolset, shared_after_tool_callback

load_dotenv()


def _setup_otel() -> None:
    """Configure OTLP telemetry via ADK 1.33+ native setup when OTEL env vars are present."""
    if not (
        os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
        or os.getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
    ):
        return

    from google.adk.telemetry.setup import maybe_set_otel_providers

    resource = Resource.create(
        {
            ResourceAttributes.SERVICE_NAME: os.getenv("OTEL_SERVICE_NAME", "doctor-adk-agent"),
            ResourceAttributes.SERVICE_VERSION: os.getenv("RAILWAY_GIT_COMMIT_SHA", "dev"),
            "deployment.environment": os.getenv("RAILWAY_ENVIRONMENT_NAME", "local"),
            "railway.project.id": os.getenv("RAILWAY_PROJECT_ID", ""),
            "railway.service.id": os.getenv("RAILWAY_SERVICE_ID", ""),
        }
    )
    maybe_set_otel_providers(otel_resource=resource)
    SQLite3Instrumentor().instrument()


_setup_otel()
tracer = trace.get_tracer("doctor-adk-agent")


# ---------------------------------------------------------------------------
# Tools — all written against shared state. The UI re-renders on every
# state delta, and `write_itinerary.body` is streamed token-by-token via
# COLLAB_PREDICT_STATE below.
# ---------------------------------------------------------------------------
def set_trip_meta(
    tool_context: ToolContext,
    destination: str,
    start_date: str,
    end_date: str,
    travelers: int = 1,
    budget_usd: int = 0,
    headline: str = "",
) -> dict:
    """Set the high-level trip card (destination, dates, party size, budget).

    Call this FIRST whenever the operator names a new trip. Dates are
    ISO YYYY-MM-DD strings. `headline` is a one-line vibe summary the UI
    pins under the destination ("Snow + sushi + onsen", etc.).
    """
    tool_context.state["destination"] = destination
    tool_context.state["start_date"] = start_date
    tool_context.state["end_date"] = end_date
    tool_context.state["travelers"] = travelers
    tool_context.state["budget_usd"] = budget_usd
    tool_context.state["headline"] = headline
    tool_context.state["status"] = "drafting"
    return {"ok": True}


def write_itinerary(tool_context: ToolContext, summary: str, body: str) -> dict:
    """Replace the full multi-day itinerary in shared state.

    `summary` is a 1-2 sentence pitch shown above the day list. `body` is
    the structured plan in markdown — use `## Day 1: <theme>` headings
    followed by `- HH:MM — activity` bullets. Token-streams into the UI.
    """
    tool_context.state["itinerary"] = body
    tool_context.state["summary"] = summary
    tool_context.state["status"] = "drafting"
    return {"ok": True, "length": len(body)}


def add_day(tool_context: ToolContext, day_number: int, theme: str, plan: str) -> dict:
    """Append (or replace) a single day in the existing itinerary.

    `plan` should be a list of `- HH:MM — activity` bullets. Use this for
    incremental edits when the operator asks to add or rework one day
    rather than the whole trip.
    """
    current = tool_context.state.get("itinerary", "") or ""
    sep = "\n\n" if current.strip() else ""
    block = f"{sep}## Day {day_number}: {theme}\n\n{plan}"
    tool_context.state["itinerary"] = current + block
    tool_context.state["status"] = "drafting"
    return {"ok": True}


def mark_ready_to_book(tool_context: ToolContext, summary: str) -> dict:
    """Flag the trip as ready for the operator to lock in / book."""
    tool_context.state["status"] = "ready_to_book"
    tool_context.state["review_summary"] = summary
    return {"ok": True}


# ---------------------------------------------------------------------------
# Preferences injection — UI writes state["preferences"]; we read it back
# each turn and prepend a fresh TRAVELER_BRIEF block to the system
# instruction so the model adapts immediately.
# ---------------------------------------------------------------------------
_PREFS_MARK_START = "<<<TRAVELER_BRIEF>>>"
_PREFS_MARK_END = "<<<END_TRAVELER_BRIEF>>>"


def _build_prefs_block(prefs: dict) -> Optional[str]:
    if not prefs or not isinstance(prefs, dict):
        return None

    lines = [_PREFS_MARK_START]
    if name := prefs.get("travelerName"):
        lines.append(f"- Traveler: {name}")
    if airport := prefs.get("homeAirport"):
        lines.append(f"- Home airport: {airport}")
    if budget := prefs.get("budgetTier"):
        lines.append(f"- Budget tier: {budget}")
    if vibe := prefs.get("vibe"):
        lines.append(f"- Vibe: {vibe}")
    if pace := prefs.get("pace"):
        lines.append(f"- Pace: {pace}")
    if dietary := prefs.get("dietary"):
        lines.append(f"- Dietary: {dietary}")
    if mobility := prefs.get("mobility"):
        lines.append(f"- Mobility: {mobility}")
    if interests := prefs.get("interests"):
        if isinstance(interests, list) and interests:
            lines.append(f"- Interests: {', '.join(interests)}")
        elif isinstance(interests, str) and interests.strip():
            lines.append(f"- Interests: {interests}")
    lines.append(_PREFS_MARK_END)

    if len(lines) <= 2:
        return None
    return "\n".join(lines)


def _strip_old_prefs(text: str) -> str:
    if _PREFS_MARK_START not in text:
        return text
    before, _, rest = text.partition(_PREFS_MARK_START)
    _, _, after = rest.partition(_PREFS_MARK_END)
    return (before.rstrip() + "\n\n" + after.lstrip()).strip()


def _inject_preferences(
    callback_context: CallbackContext, llm_request: LlmRequest
) -> None:
    prefs = callback_context.state.to_dict().get("preferences") or {}
    block = _build_prefs_block(prefs)

    cfg = llm_request.config or genai_types.GenerateContentConfig()
    existing = cfg.system_instruction
    base = ""
    if isinstance(existing, str):
        base = existing
    elif isinstance(existing, genai_types.Content) and existing.parts:
        base = "\n".join(p.text or "" for p in existing.parts)

    base = _strip_old_prefs(base)
    new_instruction = f"{block}\n\n{base}" if block else base
    cfg.system_instruction = new_instruction
    llm_request.config = cfg


# ---------------------------------------------------------------------------
# Agent instruction — emphasizes collaboration patterns.
# ---------------------------------------------------------------------------
_INSTRUCTION = """You are a collaborative trip-planning partner with access to live travel data.

Your job is to co-design a trip with the operator. The trip lives in
shared state and the UI renders it live as you write.

## Search before you plan

Use the travel MCP tools to get real data BEFORE writing to state:
- Flights: `search_flights`, `plan_flight_bundle`, `search_awards`, `find_interactive`
- Hotels: `search_hotels`, `hotel_prices`, `hotel_rooms`, `hotel_reviews`
- Discovery: `explore_destinations`, `weekend_getaway`, `search_deals`, `destination_info`
- Costs: `calculate_trip_cost`, `detect_travel_hacks`, `optimize_booking`
- Logistics: `check_visa`, `get_baggage_rules`, `search_restaurants`, `get_weather`
- Profile: `get_preferences` to read saved traveler defaults; `update_preferences` to save changes
- Saved trips: `create_trip`, `update_trip`, `get_trip`, `list_trips`, `mark_trip_booked`

Search → summarize results in chat → then write the confirmed plan into state.

## Writing to state (UI canvas)

1. NEVER paste the itinerary into chat. The plan lives in
   state["itinerary"]. ALWAYS use the tools to write it:
   - `set_trip_meta` FIRST whenever a destination, dates, party size,
     or budget changes,
   - `write_itinerary` to (re)draft the full multi-day plan,
   - `add_day` for incremental edits to a single day.
2. Day headings MUST follow the format `## Day N: <theme>` and each
   activity MUST be a bullet `- HH:MM — activity` (24h time, em-dash).
   The UI parses this — drift breaks rendering.
3. Respect the TRAVELER_BRIEF when present. Budget tier, vibe, pace,
   dietary, and mobility all materially change recommendations.
4. After each tool call, reply with a SHORT (1–2 sentence) summary of
   what changed and propose one concrete next move.
5. Before doing anything that LOCKS IN the trip — booking flights,
   reserving hotels, sharing the plan, or charging the operator — call
   the frontend tool `request_user_approval` with a clear action +
   reason and wait for the operator's decision. Only proceed if
   approved.
6. When the draft looks complete, call `mark_ready_to_book` with a
   1-sentence wrap-up so the UI can highlight the trip is ready.

Be concise, warm, and proactive. Surface tradeoffs (budget vs. vibe,
pace vs. coverage, points vs. cash) instead of guessing silently.
"""


collab_trip_agent = LlmAgent(
    name="collab_trip_agent",
    model=LiteLlm(model="mistral/mistral-medium-latest"),
    instruction=_INSTRUCTION,
    before_model_callback=_inject_preferences,
    after_tool_callback=shared_after_tool_callback,
    tools=[
        set_trip_meta,
        write_itinerary,
        add_day,
        mark_ready_to_book,
        AGUIToolset(),
        trvl_toolset(),
    ],
)


# Token-level streaming for the itinerary body — the UI re-renders as
# each token arrives, mirroring the shared-state-streaming showcase.
COLLAB_PREDICT_STATE = [
    PredictStateMapping(
        state_key="itinerary",
        tool="write_itinerary",
        tool_argument="body",
        emit_confirm_tool=False,
        stream_tool_call=True,
    ),
]


# ---------------------------------------------------------------------------
# FastAPI wiring.
# ---------------------------------------------------------------------------
adk_collab_agent = ADKAgent(
    adk_agent=collab_trip_agent,
    user_id="demo_user",
    session_timeout_seconds=3600,
    use_in_memory_services=True,
    predict_state=COLLAB_PREDICT_STATE,
)

app = FastAPI(title="Collab Studio · Trip Planning")


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
            raise

        span.set_attribute("http.response.status_code", response.status_code)
        span.set_attribute("duration_ms", round((time.perf_counter() - start) * 1000, 2))
        return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

add_adk_fastapi_endpoint(app, adk_collab_agent, path="/")


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
