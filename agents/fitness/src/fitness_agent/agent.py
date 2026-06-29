"""Fitness agent domain: state, tools, instructions."""

import asyncio
import logging
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any, Literal

from ag_ui_adk import AGUIToolset
from agents_shared.state import (
    STRAVA_AUTH,
    make_state_initializer,
)
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    get_current_date,
    on_model_error_callback,
    stop_on_terminal_text,
)
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import BaseTool, ToolContext
from google.adk.tools.base_toolset import BaseToolset
from pydantic import BaseModel

from .tools import (
    StravaActivity,
    StravaToolset,
    fetch_activities,
    mark_plan_ready,
    set_objective_research,
    set_training_plan,
    web_search_toolset,
)

log = logging.getLogger("fitness_agent")

_INSTRUCTION = (Path(__file__).parent / "instructions.md").read_text(encoding="utf-8")
AgentMode = Literal["chat", "task", "single_turn"]
IncludeContents = Literal["default", "none"]
FitnessTool = Callable[..., object] | BaseTool | BaseToolset


# ---------------------------------------------------------------------------
# State model
# ---------------------------------------------------------------------------
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
# Rate-limit throttle for Brave free-tier searches
# ---------------------------------------------------------------------------
_WEB_SEARCH_MIN_INTERVAL_S = 1.2
web_search_lock = asyncio.Lock()
web_search_state: dict[str, float] = {"last_at": 0.0}


async def throttle_web_search(
    tool: BaseTool, _args: dict[str, Any], _tool_context: ToolContext
) -> None:
    """Space out Brave web-search calls to respect the free-tier rate limit."""
    if not str(getattr(tool, "name", "")).startswith("brave_"):
        return
    async with web_search_lock:
        elapsed = time.monotonic() - web_search_state["last_at"]
        if elapsed < _WEB_SEARCH_MIN_INTERVAL_S:
            wait = _WEB_SEARCH_MIN_INTERVAL_S - elapsed
            log.debug("throttle_web_search: sleeping %.2fs before %s", wait, tool.name)
            await asyncio.sleep(wait)
        web_search_state["last_at"] = time.monotonic()


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------
def build_agent(
    *,
    mode: AgentMode | None = None,
    include_contents: IncludeContents = "default",
    include_agui: bool = True,
    model: str = "groq/llama-3.3-70b-versatile",
) -> LlmAgent:
    """Fresh LlmAgent instance — the gateway's wellness orchestrator builds its own."""
    tools: list[FitnessTool] = [
        StravaToolset(),
        get_current_date,
        set_objective_research,
        set_training_plan,
        mark_plan_ready,
    ]
    if include_agui:
        tools.append(AGUIToolset())
    tools.append(web_search_toolset())

    return LlmAgent(
        name="fitness_agent",
        description="Training plans and Strava-backed activity context.",
        model=LiteLlm(model=model),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        mode=mode,
        include_contents=include_contents,
        state_schema=FitnessState,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(
            FitnessState,
            token_flags={STRAVA_AUTH.state_key: STRAVA_AUTH.connected_flag},
        ),
        before_tool_callback=throttle_web_search,
        tools=tools,
    )


def build_telegram_agent(
    *, mode: AgentMode | None = None, include_contents: IncludeContents = "default"
) -> LlmAgent:
    return build_agent(
        mode=mode,
        include_contents=include_contents,
        include_agui=False,
        model="mistral/mistral-medium-latest",
    )


def build_eval_agent(
    *, mode: AgentMode | None = None, include_contents: IncludeContents = "default"
) -> LlmAgent:
    """Eval-compatible agent: no AGUIToolset or McpToolset.

    The eval case tests the auth-gate path (strava_connected=False by default).
    fetch_activities gracefully returns an error when disconnected, so no stub needed.
    """
    return LlmAgent(
        name="fitness_agent",
        description="Training plans and Strava-backed activity context.",
        model=LiteLlm(model="mistral/mistral-small-latest"),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        mode=mode,
        include_contents=include_contents,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(
            FitnessState,
            token_flags={STRAVA_AUTH.state_key: STRAVA_AUTH.connected_flag},
        ),
        tools=[
            fetch_activities,
            get_current_date,
            set_objective_research,
            set_training_plan,
            mark_plan_ready,
        ],
    )


root_agent = build_eval_agent()
