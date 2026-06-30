"""Collab Studio — Trip Planning agent backend."""

from pathlib import Path

from ag_ui_adk import AGUIToolset
from agents_shared.state import make_state_initializer
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    get_current_date,
    on_model_error_callback,
    stop_on_terminal_text,
)
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import FunctionTool
from pydantic import BaseModel

from .tools.add_day import add_day
from .tools.mark_ready_to_book import mark_ready_to_book
from .tools.set_trip_meta import set_trip_meta
from .tools.trvl import trvl_toolset
from .tools.write_itinerary import write_itinerary

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
def _build_agent(*, include_agui: bool) -> LlmAgent:
    """Fresh LlmAgent instance for the trip-planning agent."""
    tools: list[object] = [
        get_current_date,
        FunctionTool(set_trip_meta),
        FunctionTool(write_itinerary),
        FunctionTool(add_day),
        FunctionTool(mark_ready_to_book),
    ]
    if include_agui:
        tools.append(AGUIToolset())
    tools.append(trvl_toolset())

    return LlmAgent(
        name="collab_trip_agent",
        description="Trip planning, itinerary drafting, and booking readiness.",
        model=LiteLlm(model="cerebras/gpt-oss-120b"),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        state_schema=TravelState,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(TravelState),
        tools=tools,
    )


def build_agent() -> LlmAgent:
    return _build_agent(include_agui=True)


def build_telegram_agent() -> LlmAgent:
    return _build_agent(include_agui=False)


def build_eval_agent() -> LlmAgent:
    """Eval-compatible agent: plain function tools only (no ADK Toolsets).

    AGUIToolset and McpToolset are replaced with stubs because the Vertex AI
    eval SDK requires plain callables when building AgentConfig tool declarations.
    """
    from .tools.stubs import (
        check_visa,
        destination_info,
        get_preferences,
        get_weather,
        search_flights,
        search_hotels,
        search_restaurants,
    )
    from .tools.write_itinerary import write_itinerary

    return LlmAgent(
        name="collab_trip_agent",
        description="Trip planning, itinerary drafting, and booking readiness.",
        model=LiteLlm(model="mistral/mistral-small-latest"),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(TravelState),
        tools=[
            get_current_date,
            FunctionTool(set_trip_meta),
            FunctionTool(write_itinerary),
            FunctionTool(add_day),
            FunctionTool(mark_ready_to_book),
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
