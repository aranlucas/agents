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

import datetime
from typing import Any

from ag_ui_adk import ADKAgent, AGUIToolset
from ag_ui_adk.config import PredictStateMapping
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
    get_current_date,
    on_model_error_callback,
    shared_after_tool_callback,
)
from dotenv import load_dotenv
from google.adk.agents import LlmAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.auth.credential_service.in_memory_credential_service import (
    InMemoryCredentialService,
)
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.tools import ToolContext
from pydantic import BaseModel

from .utils import trvl_toolset

load_dotenv()

log = setup_agent_logging("travel_agent")
tracer = get_agent_tracer("travel-agent")


async def extract_travel_identity_state(request, _input_data) -> dict:
    return extract_identity_state(request)


class TravelState(BaseModel):
    """Default shared-state shape for the travel agent and traveler brief."""

    destination: str = ""
    start_date: str = ""
    end_date: str = ""
    travelers: int = 1
    budget_usd: int = 0
    headline: str = ""
    flights: str = ""
    itinerary: str = ""
    summary: str = ""
    status: str = "idle"
    review_summary: str = ""
    user_id: str = ""
    travelerName: str = ""
    homeAirport: str = ""
    transportMode: str = "flight"
    budgetTier: str = ""
    vibe: str = ""
    pace: str = ""
    interests: list[str] | str = ""
    dietary: str = ""
    mobility: str = ""


_DEFAULT_STATE: dict[str, Any] = TravelState().model_dump()


def on_before_agent(callback_context: CallbackContext) -> None:
    for key, default in _DEFAULT_STATE.items():
        if key not in callback_context.state:
            callback_context.state[key] = default


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
    tool_context.state.setdefault("flights", "")
    return {"ok": True}


def write_itinerary(
    tool_context: ToolContext,
    summary: str,
    body: str,
    flights: str = "",
) -> dict:
    """Replace the full multi-day itinerary in shared state.

    `summary` is a 1-2 sentence pitch shown above the day list. `body` is
    the structured plan in markdown — use `## Day 1: <theme>` headings
    followed by `- HH:MM — activity` bullets. Token-streams into the UI.

    `flights` is an optional markdown block with flight details (airline,
    flight numbers, times, prices) that will be rendered in the canvas.
    """
    tool_context.state["itinerary"] = body
    tool_context.state["summary"] = summary
    tool_context.state["status"] = "drafting"
    if flights:
        tool_context.state["flights"] = flights
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
# InstructionProvider — reads flat session-state keys written by the UI,
# embeds them via f-string (safe for missing/empty values), and ADK appends
# it after the cache-stable static instruction.
# ---------------------------------------------------------------------------
async def _build_instruction(context: ReadonlyContext) -> str:
    s = context.state or {}
    today = datetime.datetime.now(datetime.UTC).date()

    interests = s.get("interests") or ""
    if isinstance(interests, list):
        interests = ", ".join(interests)

    header = f"""\
Current month: {today.strftime("%B %Y")}

TRAVELER_BRIEF
- Traveler: {s.get("travelerName") or ""}
- Home airport: {s.get("homeAirport") or ""}
- Transport mode: {s.get("transportMode") or "flight"}
- Budget tier: {s.get("budgetTier") or ""}
- Vibe: {s.get("vibe") or ""}
- Pace: {s.get("pace") or ""}
- Interests: {interests}"""

    return header


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
- Date: `get_current_date` — call this whenever you need today's date (trip duration, future-date validation, departure windows)
- Profile: `get_preferences` to read saved traveler defaults; `update_preferences` to save changes
- Saved trips: `create_trip`, `update_trip`, `get_trip`, `list_trips`, `mark_trip_booked`

Search → summarize results in chat → then write the confirmed plan into state.

## Writing to state (UI canvas)

1. NEVER paste the itinerary into chat. The plan lives in
   state["itinerary"]. ALWAYS use the tools to write it:
   - `set_trip_meta` FIRST whenever a destination, dates, party size,
     or budget changes,
   - `write_itinerary` to (re)draft the full multi-day plan. Include
     a `flights` markdown block with airline, flight numbers, times,
     and prices when transport mode is "flight".
   - `add_day` for incremental edits to a single day.
2. Day headings MUST follow the format `## Day N: <theme>` and each
   activity MUST be a bullet `- HH:MM — activity` (24h time, em-dash).
   The UI parses this — drift breaks rendering.
3. Respect the TRAVELER_BRIEF when present. Transport mode (flight vs
   road trip), budget tier, vibe, pace, dietary, and mobility all
   materially change recommendations.
4. After each tool call, reply with a SHORT (1-2 sentence) summary of
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
    model=build_model(),
    retry_config=DEFAULT_RETRY_CONFIG,
    on_model_error_callback=on_model_error_callback,
    state_schema=TravelState,
    static_instruction=_INSTRUCTION,
    instruction=_build_instruction,
    before_agent_callback=on_before_agent,
    after_tool_callback=shared_after_tool_callback,
    tools=[
        get_current_date,
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
    PredictStateMapping(
        state_key="flights",
        tool="write_itinerary",
        tool_argument="flights",
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


adk_collab_agent = ADKAgent(
    adk_agent=collab_trip_agent,
    session_service=_shared_session_svc,
    artifact_service=_artifact_svc,
    memory_service=_memory_svc,
    credential_service=_credential_svc,
    session_timeout_seconds=3600,
    predict_state=COLLAB_PREDICT_STATE,
)

app = create_agent_app(
    title="Collab Studio · Trip Planning",
    adk_agent=adk_collab_agent,
    extract_state_from_request=extract_travel_identity_state,
    session_container=_session_container,
    tracer=tracer,
)
