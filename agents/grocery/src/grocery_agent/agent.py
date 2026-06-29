"""Grocery agent domain: state, tools, instructions."""

from pathlib import Path

from ag_ui_adk import AGUIToolset
from agents_shared.state import (
    KROGER_AUTH,
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
from google.adk.tools import FunctionTool
from pydantic import BaseModel

from .tools._types import CartItem, PantryItem
from .tools.kroger import KrogerToolset
from .tools.mark_list_ready import mark_list_ready
from .tools.set_meal_plan import set_meal_plan
from .tools.set_shopping_list import set_shopping_list
from .tools.set_weekly_deals import set_weekly_deals
from .tools.update_cart import update_cart
from .tools.update_pantry import update_pantry

_INSTRUCTION = (Path(__file__).parent / "instructions.md").read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# State model
# ---------------------------------------------------------------------------
class GroceryState(BaseModel):
    """Default shared-state shape for the grocery agent."""

    shopping_list: list[str] = []
    meal_plan: str = ""
    cart: list[CartItem] = []
    pantry: list[PantryItem] = []
    weekly_deals: str = ""
    weekly_plan: str = ""
    status: str = "idle"
    notes: str = ""
    review_summary: str = ""
    kroger_connected: bool = False
    training_plan: str = ""
    user_id: str = ""


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------
def build_agent(
    *,
    mode: str | None = None,
    include_contents: str = "default",
    include_agui: bool = True,
) -> LlmAgent:
    """Fresh LlmAgent instance — the gateway's wellness orchestrator builds its own."""
    tools: list[object] = [
        FunctionTool(set_shopping_list),
        FunctionTool(update_cart),
        FunctionTool(update_pantry),
        FunctionTool(set_meal_plan),
        FunctionTool(set_weekly_deals),
        FunctionTool(mark_list_ready),
        get_current_date,
    ]
    if include_agui:
        tools.append(AGUIToolset())
    tools.append(KrogerToolset())

    return LlmAgent(
        name="grocery_agent",
        description="Meal planning, pantry, shopping list, and cart support.",
        model=LiteLlm(model="nvidia_nim/deepseek-ai/deepseek-v4-flash"),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        mode=mode,
        include_contents=include_contents,
        state_schema=GroceryState,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(
            GroceryState,
            token_flags={KROGER_AUTH.state_key: KROGER_AUTH.connected_flag},
        ),
        tools=tools,
    )


def build_telegram_agent(
    *, mode: str | None = None, include_contents: str = "default"
) -> LlmAgent:
    return build_agent(
        mode=mode,
        include_contents=include_contents,
        include_agui=False,
    )


def build_eval_agent(
    *, mode: str | None = None, include_contents: str = "default"
) -> LlmAgent:
    """Eval-compatible agent: no AGUIToolset or McpToolset.

    The eval case tests the auth-gate path (kroger_connected=False by default),
    so no Kroger MCP stubs are needed — the agent should refuse before calling them.
    """
    return LlmAgent(
        name="grocery_agent",
        description="Meal planning, pantry, shopping list, and cart support.",
        model=LiteLlm(model="mistral/mistral-small-latest"),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        mode=mode,
        include_contents=include_contents,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(
            GroceryState,
            token_flags={KROGER_AUTH.state_key: KROGER_AUTH.connected_flag},
        ),
        tools=[
            FunctionTool(set_shopping_list),
            FunctionTool(update_cart),
            FunctionTool(update_pantry),
            FunctionTool(set_meal_plan),
            FunctionTool(set_weekly_deals),
            FunctionTool(mark_list_ready),
            get_current_date,
        ],
    )


root_agent = build_eval_agent()
