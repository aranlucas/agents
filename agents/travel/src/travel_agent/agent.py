"""Collab Studio — Trip Planning agent backend."""

from pathlib import Path

from ag_ui_adk import AGUIToolset
from agents_shared.state import make_state_initializer
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    build_model,
    get_current_date,
    on_model_error_callback,
    stop_on_terminal_text,
)
from google.adk.agents import LlmAgent
from pydantic import BaseModel

from .tools import (
    add_day,
    mark_ready_to_book,
    set_trip_meta,
    trvl_toolset,
    write_itinerary,
)

_INSTRUCTION = (Path(__file__).parent / "instructions.md").read_text(encoding="utf-8")


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
        instruction=_INSTRUCTION,
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
        static_instruction=_INSTRUCTION,
        instruction=_STATE_INSTRUCTION,
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
