"""Grocery agent domain: state, tools, instructions."""

from typing import TypedDict

from ag_ui_adk import AGUIToolset
from agents_shared.prompts import canvas_contract
from agents_shared.state import (
    KROGER_AUTH,
    make_state_initializer,
    make_state_instruction,
)
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    build_model,
    get_current_date,
    on_model_error_callback,
)
from google.adk.agents import LlmAgent
from google.adk.tools import ToolContext
from pydantic import BaseModel

from .toolsets import meal_planner_toolset


# ---------------------------------------------------------------------------
# State model
# ---------------------------------------------------------------------------
class CartItem(TypedDict):
    name: str
    quantity: int
    price: float
    upc: str


class PantryItem(TypedDict):
    name: str
    quantity: str
    expires: str | None


class GroceryState(BaseModel):
    """Default shared-state shape for the grocery agent."""

    shopping_list: list[str] = []
    meal_plan: str = ""
    cart: list[CartItem] = []
    pantry: list[PantryItem] = []
    weekly_deals: str = ""
    status: str = "idle"
    notes: str = ""
    review_summary: str = ""
    kroger_connected: bool = False
    training_plan: str = ""
    user_id: str = ""


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


def update_cart(tool_context: ToolContext, items: list[CartItem]) -> dict:
    """Update the cart with Kroger items ready for checkout.

    Each item: {"name": str, "quantity": int, "price": float, "upc": str}.
    """
    tool_context.state["cart"] = items
    return {"ok": True, "count": len(items)}


def update_pantry(tool_context: ToolContext, items: list[PantryItem]) -> dict:
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


def mark_list_ready(tool_context: ToolContext, summary: str) -> dict[str, bool]:
    """Mark the shopping list as ready to shop."""
    tool_context.state["status"] = "ready"
    tool_context.state["review_summary"] = summary
    return {"ok": True}


# ---------------------------------------------------------------------------
# Static instruction
# ---------------------------------------------------------------------------
_CANVAS_CONTRACT = canvas_contract(
    artifact="meal plan, shopping list, pantry, deals, and cart",
    tools=(
        "set_shopping_list",
        "set_meal_plan",
        "update_cart",
        "update_pantry",
        "set_weekly_deals",
        "mark_list_ready",
    ),
)

_INSTRUCTION = (
    """\
You are a collaborative grocery and meal-planning partner with live access to Kroger data.

## Auth gate
If `kroger_connected` is False in the current state, stop immediately. Tell the user
their Kroger account isn't connected and they need to click 'Connect Kroger' in the UI.
Do not call any MCP tools and do not generate a meal plan.

## Training-plan context
If `training_plan` is present in the current state, tailor meals and shopping to it:
protein around strength days, lighter prep before hard sessions, extra fuel and
hydration for the hike or long-endurance day, and recovery nutrition after heavy days.

"""
    + _CANVAS_CONTRACT
    + """

## Workflow (only when kroger_connected is True)
1. Use MCP tools to fetch real data BEFORE writing to state:
   - Date + deals: call get_current_date and get_weekly_deals in parallel at the
     start of a session — they are independent and can share one turn
   - Products: search_products, get_product_details
   - Shopping list: manage_shopping_list
   - Cart mutation: add_to_cart only after user approval; checkout_shopping_list only after an explicit checkout request and approval
   - Pantry: manage_pantry (check what the user already has first)
   - Meals: plan_meals, search_recipes_from_web
   - Store: search_locations, get_location_details, set_preferred_location

2. Write to state (renders live in the UI canvas) — NEVER paste lists into chat:
   - set_shopping_list — update the full list after any change
   - set_meal_plan — write/update the meal plan (streams token-by-token)
   - update_cart — reflect the Kroger cart contents in the UI
   - update_pantry — when the user tells you what they have at home
   - set_weekly_deals — surface current Kroger specials

3. ALWAYS build a proposed cart in the UI — do not wait to be asked. Once the
   shopping list is settled, look up each item with the Kroger MCP tools.
   Call search_products for ALL items in parallel (one call per item, all in a single
   turn) rather than sequentially. Then call update_cart with the matched items
   (name, quantity, price, upc) so the proposed cart renders in the UI.
   Skip pantry items the user already has, and suggest a substitution for anything
   out of stock rather than dropping it silently.

4. Before mutating the user's Kroger account, call the frontend tool
   `request_user_approval` with a clear action and reason. Only call `add_to_cart` after approval.
   Do not call `checkout_shopping_list` unless the user explicitly asks to check
   out and approves that checkout action. If approval is denied, keep the proposed
   cart in state and ask what to change.

5. When the proposed cart is complete, call mark_list_ready with a 1-sentence
   wrap-up. Do not mark the list ready until the proposed cart has been built.

Be practical, budget-aware, and proactive. Suggest substitutions for out-of-stock items.
"""
)


_STATE_INSTRUCTION = make_state_instruction(
    GroceryState, header="Current grocery state"
)


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------
def build_agent(
    *, mode: str | None = None, include_contents: str = "default"
) -> LlmAgent:
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
        instruction=_STATE_INSTRUCTION,
        before_agent_callback=make_state_initializer(
            GroceryState,
            token_flags={KROGER_AUTH.state_key: KROGER_AUTH.connected_flag},
        ),
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
