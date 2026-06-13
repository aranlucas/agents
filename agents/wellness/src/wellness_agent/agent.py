"""Wellness agent domain: state, tools, instruction, orchestration."""

from typing import Any

from ag_ui_adk import AGUIToolset
from agents_shared.state import (
    make_state_initializer,
    make_state_instruction_provider,
)
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    build_model,
    get_current_date,
    on_model_error_callback,
    shared_after_tool_callback,
)
from fitness_agent.agent import build_agent as build_fitness_agent
from google.adk.agents import LlmAgent
from google.adk.tools import ToolContext
from grocery_agent.agent import build_agent as build_grocery_agent
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# State model
# ---------------------------------------------------------------------------
class WellnessState(BaseModel):
    """Combined shared-state shape used by wellness and its task sub-agents."""

    status: str = "idle"
    meal_plan: str = ""
    weekly_plan: str = ""
    review_summary: str = ""
    user_id: str = ""
    kroger_connected: bool = False
    strava_connected: bool = False
    shopping_list: list[str] = []
    cart: list[dict[str, Any]] = []
    pantry: list[dict[str, Any]] = []
    weekly_deals: str = ""
    notes: str = ""
    activities: list[dict[str, Any]] = []
    activities_synced_at: str = ""
    objective_research: str = ""
    training_plan: str = ""


# ---------------------------------------------------------------------------
# State tools — UI canvas writes
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# Static instruction
# ---------------------------------------------------------------------------
_INSTRUCTION = """\
You are a wellness planning orchestrator.

Your job is to create a practical one-week plan that combines meals and workouts.
The source of truth is shared state, not chat output.

You have two task-mode specialist agents available as tools: fitness_agent and
grocery_agent. Call them with a plain-English request string. The framework
runs each task agent to completion and then returns control to you.

Workflow — follow these steps strictly in sequence:

Step 1. Call get_current_date. Note the date.

Step 2. Call fitness_agent first with a request to: (a) summarise recent Strava
        activities, (b) build a DETAILED day-by-day training schedule for this week
        starting on that date — each day with session type, duration/distance or
        sets x reps, and target intensity — and (c) recommend ONE specific named hike
        for the week, including its distance, elevation gain, difficulty, why it
        suits this athlete, and the scheduled hike day. The fitness agent writes
        the completed plan to shared state as training_plan.

Step 3. After fitness_agent completes and training_plan exists in shared state,
        call grocery_agent. Do not paste the training plan into the request.
        Ask grocery_agent to read training_plan from shared state and tailor meals
        to match it: protein on strength days, lighter meals before hard sessions,
        extra fuel/hydration on the hike day, and recovery nutrition on rest days.

Step 4. Reconcile the two plans: heavy training days and the hike day get simpler
        meals, adequate protein, hydration, recovery, and realistic prep.

Step 5. Call set_weekly_wellness_plan with the final combined report. Structure:
        ## Recent Activity
        <summarise the recent Strava activities from the fitness response>

        ## Recommended Hike
        <the specific hike from Step 2: name, distance, elevation gain, difficulty,
         which day it is scheduled, and why it fits this athlete>

        ## This Week's Plan
        <day-by-day sections with markdown headings, each day showing the DETAILED
         workout (type, duration/distance or sets x reps, intensity) and the meals
         side by side; mark the hike on its scheduled day>

Step 6. Call mark_plan_ready only after Steps 2-5 all completed successfully.

If either agent tool returns an empty response or error, explain which step
failed and do not mark the plan ready.
"""


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------
def build_agent() -> LlmAgent:
    return LlmAgent(
        name="wellness_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        state_schema=WellnessState,
        static_instruction=_INSTRUCTION,
        instruction=make_state_instruction_provider("wellness", WellnessState),
        sub_agents=[build_fitness_agent(mode="task"), build_grocery_agent(mode="task")],
        before_agent_callback=make_state_initializer(WellnessState),
        after_tool_callback=shared_after_tool_callback,
        tools=[
            get_current_date,
            set_weekly_wellness_plan,
            mark_plan_ready,
            AGUIToolset(),
        ],
    )
