"""Grocery Planning Agent — Meal Planner MCP + ADK + AG-UI shared-state pattern."""

import json
import os
from typing import Any

from ag_ui_adk import ADKAgent, AGUIToolset
from ag_ui_adk.config import PredictStateMapping
from agents_shared.app_factory import (
    create_agent_app,
    get_agent_tracer,
    setup_agent_logging,
)
from agents_shared.invocation_state import get_invocation_temp
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

from .utils import meal_planner_toolset

load_dotenv()

log = setup_agent_logging("grocery_agent")
tracer = get_agent_tracer("grocery-agent")

_railway_domain = os.getenv("RAILWAY_PUBLIC_DOMAIN")
AGENT_PUBLIC_URL = os.getenv("AGENT_PUBLIC_URL") or (
    f"https://{_railway_domain}" if _railway_domain else "http://localhost:8001"
)
KROGER_TOKEN_HEADER = "x-kroger-access-token"
KROGER_TOKEN_STATE_KEY = "temp:kroger_token"


# ---------------------------------------------------------------------------
# Default state
# ---------------------------------------------------------------------------
class GroceryState(BaseModel):
    """Default shared-state shape for the grocery agent."""

    shopping_list: list[str] = []
    meal_plan: str = ""
    cart: list[dict[str, Any]] = []
    pantry: list[dict[str, Any]] = []
    weekly_deals: str = ""
    status: str = "idle"
    notes: str = ""
    review_summary: str = ""
    kroger_connected: bool = False
    training_plan: str = ""
    user_id: str = ""


_DEFAULT_STATE: dict[str, Any] = GroceryState().model_dump()


# ---------------------------------------------------------------------------
# State tools — UI canvas writes
# ---------------------------------------------------------------------------
def set_shopping_list(
    tool_context: ToolContext,
    items: list[str],
    notes: str = "",
) -> dict:
    """Replace the full shopping list in shared state.

    `items` is a list of item strings (e.g. ["2x milk", "eggs", "bread"]).
    `notes` is an optional markdown block with shopping notes or substitutions.
    """
    tool_context.state["shopping_list"] = items
    tool_context.state["status"] = "planning"
    if notes:
        tool_context.state["notes"] = notes
    return {"ok": True, "count": len(items)}


def update_cart(tool_context: ToolContext, items: list[dict]) -> dict:
    """Update the cart with Kroger items ready for checkout.

    Each item: {"name": str, "quantity": int, "price": float, "upc": str}.
    """
    tool_context.state["cart"] = items
    return {"ok": True, "count": len(items)}


def update_pantry(tool_context: ToolContext, items: list[dict]) -> dict:
    """Sync pantry inventory to shared state.

    Each item: {"name": str, "quantity": str, "expires": str (optional)}.
    """
    tool_context.state["pantry"] = items
    return {"ok": True}


def set_meal_plan(tool_context: ToolContext, plan: str) -> dict:
    r"""Write or overwrite the meal plan (token-streams into the UI).

    Use markdown day headings: ## Day 1: Theme\\n- Breakfast: ...
    """
    tool_context.state["meal_plan"] = plan
    tool_context.state["status"] = "planning"
    return {"ok": True, "length": len(plan)}


def set_weekly_deals(tool_context: ToolContext, deals: str) -> dict:
    """Write the weekly deals summary (markdown) to shared state."""
    tool_context.state["weekly_deals"] = deals
    return {"ok": True}


def mark_list_ready(tool_context: ToolContext, summary: str) -> dict:
    """Mark the shopping list as ready to shop."""
    tool_context.state["status"] = "ready"
    tool_context.state["review_summary"] = summary
    return {"ok": True}


# ---------------------------------------------------------------------------
# Callbacks — shared-state pattern
# ---------------------------------------------------------------------------
def on_before_agent(callback_context: CallbackContext) -> None:
    """Initialize missing state keys with defaults on every turn."""
    token = get_invocation_temp(KROGER_TOKEN_STATE_KEY, callback_context.state)
    if token:
        callback_context.state["kroger_connected"] = True
    for key, default in _DEFAULT_STATE.items():
        if key not in callback_context.state:
            callback_context.state[key] = default


async def build_dynamic_instruction(context: ReadonlyContext) -> str:
    """Per-turn grocery state and auth notice appended after static prompt."""
    state = {
        key: context.state.get(key, default)
        for key, default in _DEFAULT_STATE.items()
    }
    kroger_connected: bool = bool(state.get("kroger_connected", False))

    auth_notice = (
        ""
        if kroger_connected
        else (
            "\n\nKROGER NOT CONNECTED: Do not call any MCP tools. "
            "Tell the user their Kroger account isn't connected and they need to "
            "click 'Connect Kroger' in the UI to continue. Do not plan meals or "
            "generate shopping lists."
        )
    )

    try:
        state_json = json.dumps(state, indent=2, default=str)
    except (TypeError, ValueError):
        state_json = "{}"

    return f"Current grocery state:\n{state_json}{auth_notice}"


async def extract_kroger_auth_state(request, _input_data) -> dict:
    """Inject Kroger auth as per-invocation temp state from request headers."""
    state = extract_identity_state(request)
    token = request.headers.get(KROGER_TOKEN_HEADER) or ""
    if not token:
        return {**state, "kroger_connected": False}
    return {**state, "kroger_connected": True, KROGER_TOKEN_STATE_KEY: token}


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------
_INSTRUCTION = """\
You are a collaborative grocery and meal-planning partner with live access to Kroger data.

## Auth gate
If `kroger_connected` is False in the current state, stop immediately. Tell the user
their Kroger account isn't connected and they need to click 'Connect Kroger' in the UI.
Do not call any MCP tools and do not generate a meal plan.

## Training-plan context
If `training_plan` is present in the current state, tailor meals and shopping to it:
protein around strength days, lighter prep before hard sessions, extra fuel and
hydration for the hike or long-endurance day, and recovery nutrition after heavy days.

## Workflow (only when kroger_connected is True)
1. Use MCP tools to fetch real data BEFORE writing to state:
   - Date: call get_current_date before planning a week, validating dates, or using weekly deals
   - Products: search_products, get_product_details, get_weekly_deals
   - Shopping list: manage_shopping_list, checkout_shopping_list, add_to_cart
   - Pantry: manage_pantry (check what the user already has first)
   - Meals: plan_meals, search_recipes_from_web
   - Store: search_locations, get_location_details, set_preferred_location

2. Write to state (renders live in the UI canvas) — NEVER paste lists into chat:
   - set_shopping_list — update the full list after any change
   - set_meal_plan — write/update the meal plan (streams token-by-token)
   - update_cart — reflect the Kroger cart contents in the UI
   - update_pantry — when the user tells you what they have at home
   - set_weekly_deals — surface current Kroger specials

3. ALWAYS build the cart — do not wait to be asked. Once the shopping list is
   settled, look up each item with the Kroger MCP tools (search_products /
   get_product_details), add them to the Kroger cart with add_to_cart, and then
   call update_cart with the matched items (name, quantity, price, upc) so the
   cart renders in the UI. Skip pantry items the user already has, and suggest a
   substitution for anything out of stock rather than dropping it silently.

4. After each tool call give a SHORT (1-2 sentence) summary.
5. When the list and cart are complete, call mark_list_ready with a 1-sentence
   wrap-up. Do not mark the list ready until the cart has been created.

Be practical, budget-aware, and proactive. Suggest substitutions for out-of-stock items.
"""


def build_agent(*, mode: str | None = None, include_contents: str = "default") -> LlmAgent:
    """Fresh LlmAgent instance — the gateway's wellness orchestrator builds its own."""
    return LlmAgent(
        name="grocery_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        mode=mode,
        include_contents=include_contents,
        state_schema=GroceryState,
        static_instruction=_INSTRUCTION,
        instruction=build_dynamic_instruction,
        before_agent_callback=on_before_agent,
        after_tool_callback=shared_after_tool_callback,
        tools=[
            set_shopping_list,
            update_cart,
            update_pantry,
            set_meal_plan,
            set_weekly_deals,
            mark_list_ready,
            get_current_date,
            AGUIToolset(),
            meal_planner_toolset(),
        ],
    )


grocery_agent = build_agent()

GROCERY_PREDICT_STATE = [
    PredictStateMapping(
        state_key="meal_plan",
        tool="set_meal_plan",
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


adk_grocery_agent = ADKAgent(
    adk_agent=grocery_agent,
    session_service=_shared_session_svc,
    artifact_service=_artifact_svc,
    memory_service=_memory_svc,
    credential_service=_credential_svc,
    session_timeout_seconds=3600,
    predict_state=GROCERY_PREDICT_STATE,
)

app = create_agent_app(
    title="Grocery Planning Agent",
    adk_agent=adk_grocery_agent,
    extract_state_from_request=extract_kroger_auth_state,
    session_container=_session_container,
    tracer=tracer,
)
