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

Backed by the shared free LiteLLM model pool.
The FastAPI app mounts the agent at "/"
via ag-ui-adk, plus a /health endpoint for the dev script.
"""

from ag_ui_adk import AGUIToolset
from agents_shared.prompts import canvas_contract
from agents_shared.state import make_state_initializer
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    build_model,
    get_current_date,
    on_model_error_callback,
    stop_on_terminal_text,
)
from google.adk.agents import LlmAgent
from google.adk.tools import ToolContext
from pydantic import BaseModel

from .toolsets import trvl_toolset


# ---------------------------------------------------------------------------
# State model
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# Tools — all written against shared state. The UI re-renders on every
# state delta, and `write_itinerary.body` is streamed token-by-token via
# COLLAB_PREDICT_STATE below.
# ---------------------------------------------------------------------------
def set_trip_meta(  # noqa: PLR0913
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


def mark_ready_to_book(tool_context: ToolContext, summary: str) -> dict[str, bool]:
    """Flag the trip as ready for the operator to lock in / book."""
    tool_context.state["status"] = "ready_to_book"
    tool_context.state["review_summary"] = summary
    return {"ok": True}


# ---------------------------------------------------------------------------
# Agent instruction — emphasizes collaboration patterns.
# ---------------------------------------------------------------------------
_CANVAS_CONTRACT = canvas_contract(
    artifact="trip itinerary",
    tools=("set_trip_meta", "write_itinerary", "add_day", "mark_ready_to_book"),
)

_INSTRUCTION = (
    """You are a collaborative trip-planning partner with access to live travel data.

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

When multiple independent lookups are needed for the same planning phase (e.g.
`search_flights` + `get_weather` + `check_visa` for a known destination, or
`get_current_date` + `get_preferences` at the start of a session), call those
tools in parallel in a single turn rather than one at a time.

Search → summarize results in chat → then write the confirmed plan into state.

"""
    + _CANVAS_CONTRACT
    + """

## Writing to state (UI canvas)

1. The plan lives in state["itinerary"]. ALWAYS use the tools to write it:
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
)


# NOTE: Intentionally hand-rolled rather than using make_state_instruction() because
# the TRAVELER_BRIEF section groups camelCase preference fields under a named header.
# make_state_instruction()'s .title() transform mangles camelCase (e.g. travelerName →
# "Travelername"). Update both this string AND TravelState when adding new fields.
_STATE_INSTRUCTION = """\
Current travel state:
- Destination: {destination}
- Start date: {start_date}
- End date: {end_date}
- Travelers: {travelers}
- Budget USD: {budget_usd}
- Headline: {headline}
- Flights: {flights}
- Itinerary: {itinerary}
- Summary: {summary}
- Status: {status}
- Review summary: {review_summary}
- User ID: {user_id}

TRAVELER_BRIEF
- Traveler: {travelerName}
- Home airport: {homeAirport}
- Transport mode: {transportMode}
- Budget tier: {budgetTier}
- Vibe: {vibe}
- Pace: {pace}
- Interests: {interests}
- Dietary: {dietary}
- Mobility: {mobility}
"""


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------
def build_agent() -> LlmAgent:
    """Fresh LlmAgent instance for the trip-planning agent."""
    return LlmAgent(
        name="collab_trip_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        state_schema=TravelState,
        static_instruction=_INSTRUCTION,
        instruction=_STATE_INSTRUCTION,
        before_agent_callback=make_state_initializer(TravelState),
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


def build_eval_agent() -> LlmAgent:
    """Eval-compatible agent: plain function tools only (no ADK Toolsets).

    AGUIToolset and McpToolset are replaced with stubs because the Vertex AI
    eval SDK requires plain callables when building AgentConfig tool declarations.
    """
    from .eval_stubs import (
        check_visa,
        destination_info,
        get_preferences,
        get_weather,
        search_flights,
        search_hotels,
        search_restaurants,
    )

    return LlmAgent(
        name="collab_trip_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        state_schema=TravelState,
        static_instruction=_INSTRUCTION,
        instruction=_STATE_INSTRUCTION,
        before_agent_callback=make_state_initializer(TravelState),
        tools=[
            get_current_date,
            set_trip_meta,
            write_itinerary,
            add_day,
            mark_ready_to_book,
            search_flights,
            search_hotels,
            get_weather,
            check_visa,
            destination_info,
            get_preferences,
            search_restaurants,
        ],
    )


root_agent = build_eval_agent()
