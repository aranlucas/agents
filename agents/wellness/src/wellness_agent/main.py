"""Wellness Planning Agent - orchestrates meal and workout plans in-process."""

import json
import os
from typing import Any

from ag_ui_adk import ADKAgent, AGUIToolset
from ag_ui_adk.config import PredictStateMapping
from ag_ui_adk.request_state_service import RequestStateSessionService
from agents_shared.app_factory import (
    create_agent_app,
    get_agent_tracer,
    setup_agent_logging,
)
from agents_shared.invocation_state import set_invocation_temp_state
from agents_shared.session_service import (
    SessionServiceContainer,
    create_session_service,
)
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    build_model,
    get_current_date,
    on_model_error_callback,
    shared_after_tool_callback,
)
from dotenv import load_dotenv
from fitness_agent.agent import build_agent as build_fitness_agent
from google.adk.agents import LlmAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.auth.credential_service.in_memory_credential_service import (
    InMemoryCredentialService,
)
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.tools import ToolContext
from grocery_agent.agent import build_agent as build_grocery_agent
from pydantic import BaseModel

load_dotenv()

log = setup_agent_logging("wellness_agent")
tracer = get_agent_tracer("wellness-agent")

_railway_domain = os.getenv("RAILWAY_PUBLIC_DOMAIN")
AGENT_PUBLIC_URL = os.getenv("AGENT_PUBLIC_URL") or (
    f"https://{_railway_domain}" if _railway_domain else "http://localhost:8003"
)
CLERK_USER_ID_HEADER = "x-clerk-user-id"
KROGER_TOKEN_HEADER = "x-kroger-access-token"
KROGER_TOKEN_STATE_KEY = "temp:kroger_token"
STRAVA_TOKEN_HEADER = "x-strava-access-token"
STRAVA_TOKEN_STATE_KEY = "temp:strava_token"


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


_DEFAULT_STATE: dict[str, Any] = WellnessState().model_dump()


def extract_identity_state(request) -> dict:
    state = {"user_id": request.headers.get(CLERK_USER_ID_HEADER) or "anonymous"}
    kroger_token = request.headers.get(KROGER_TOKEN_HEADER)
    if kroger_token:
        state[KROGER_TOKEN_STATE_KEY] = kroger_token
        state["kroger_connected"] = True
    strava_token = request.headers.get(STRAVA_TOKEN_HEADER)
    if strava_token:
        state[STRAVA_TOKEN_STATE_KEY] = strava_token
        state["strava_connected"] = True
    return state


async def extract_wellness_state(request, _input_data) -> dict:
    return extract_identity_state(request)


def on_before_agent(callback_context: CallbackContext) -> None:
    for key, default in _DEFAULT_STATE.items():
        if key not in callback_context.state:
            callback_context.state[key] = default


async def build_dynamic_instruction(context: ReadonlyContext) -> str:
    state = {
        key: context.state.get(key, default)
        for key, default in _DEFAULT_STATE.items()
    }
    return "Current wellness state:\n" + json.dumps(state, indent=2, default=str)


class _TempStateSessionService(RequestStateSessionService):
    """Sets invocation temp state when temp: keys are injected into a session."""

    def _inject(self, session, key):
        session = super()._inject(session, key)
        if session is not None:
            state = session.state
            state_dict = state.to_dict() if hasattr(state, "to_dict") else state
            temp = {
                k: v
                for k, v in state_dict.items()
                if isinstance(k, str) and k.startswith("temp:")
            }
            if temp:
                set_invocation_temp_state(temp)
        return session


fitness_subagent = build_fitness_agent(mode="task")
grocery_subagent = build_grocery_agent(mode="task")


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

wellness_agent = LlmAgent(
    name="wellness_agent",
    model=build_model(),
    retry_config=DEFAULT_RETRY_CONFIG,
    on_model_error_callback=on_model_error_callback,
    state_schema=WellnessState,
    static_instruction=_INSTRUCTION,
    instruction=build_dynamic_instruction,
    sub_agents=[fitness_subagent, grocery_subagent],
    before_agent_callback=on_before_agent,
    after_tool_callback=shared_after_tool_callback,
    tools=[
        get_current_date,
        set_weekly_wellness_plan,
        mark_plan_ready,
        AGUIToolset(),
    ],
)

WELLNESS_PREDICT_STATE = [
    PredictStateMapping(
        state_key="weekly_plan",
        tool="set_weekly_wellness_plan",
        tool_argument="plan",
        emit_confirm_tool=False,
        stream_tool_call=True,
    ),
]

_shared_session_svc = _TempStateSessionService(create_session_service())
_session_container = SessionServiceContainer()
_artifact_svc = InMemoryArtifactService()
_memory_svc = InMemoryMemoryService()
_credential_svc = InMemoryCredentialService()


adk_wellness_agent = ADKAgent(
    adk_agent=wellness_agent,
    session_service=_shared_session_svc,
    artifact_service=_artifact_svc,
    memory_service=_memory_svc,
    credential_service=_credential_svc,
    session_timeout_seconds=3600,
    predict_state=WELLNESS_PREDICT_STATE,
)

app = create_agent_app(
    title="Wellness Planning Agent",
    adk_agent=adk_wellness_agent,
    extract_state_from_request=extract_wellness_state,
    session_container=_session_container,
    tracer=tracer,
)
