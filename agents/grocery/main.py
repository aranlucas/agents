"""Grocery Planning Agent — Kroger MCP + ADK + CopilotKit AG-UI.

Helps users plan grocery shopping by:
  * managing a running shopping list in shared state,
  * searching Kroger products and weekly deals,
  * building meal plans and generating shopping lists from them,
  * tracking pantry inventory.
"""

from __future__ import annotations

import datetime
import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ag_ui_adk import ADKAgent, AGUIToolset, add_adk_fastapi_endpoint
from ag_ui_adk.config import PredictStateMapping

from google.adk.agents import LlmAgent
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import ToolContext
from google.adk.utils import instructions_utils
from opentelemetry import trace
from opentelemetry.instrumentation.sqlite3 import SQLite3Instrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.semconv.resource import ResourceAttributes

from utils import kroger_toolset, shared_after_tool_callback

load_dotenv()


def _setup_otel() -> None:
    if not (
        os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
        or os.getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
    ):
        return

    from google.adk.telemetry.setup import maybe_set_otel_providers

    resource = Resource.create(
        {
            ResourceAttributes.SERVICE_NAME: os.getenv("OTEL_SERVICE_NAME", "grocery-agent"),
            ResourceAttributes.SERVICE_VERSION: os.getenv("RAILWAY_GIT_COMMIT_SHA", "dev"),
            "deployment.environment": os.getenv("RAILWAY_ENVIRONMENT_NAME", "local"),
            "railway.project.id": os.getenv("RAILWAY_PROJECT_ID", ""),
            "railway.service.id": os.getenv("RAILWAY_SERVICE_ID", ""),
        }
    )
    maybe_set_otel_providers(otel_resource=resource)
    SQLite3Instrumentor().instrument()


_setup_otel()
tracer = trace.get_tracer("grocery-agent")


# ---------------------------------------------------------------------------
# State tools
# ---------------------------------------------------------------------------
def set_shopping_list(tool_context: ToolContext, items: list[str], notes: str = "") -> dict:
    """Replace the full shopping list in shared state.

    `items` is a list of item strings (e.g. ["2x milk", "eggs", "bread"]).
    `notes` is an optional markdown block with shopping notes or substitutions.
    Call this whenever the list changes materially.
    """
    tool_context.state["shopping_list"] = items
    tool_context.state["status"] = "planning"
    if notes:
        tool_context.state["notes"] = notes
    return {"ok": True, "count": len(items)}


def update_cart(tool_context: ToolContext, items: list[dict]) -> dict:
    """Update the cart with items found on Kroger.

    Each item dict: {"name": str, "quantity": int, "price": float, "upc": str}.
    """
    tool_context.state["cart"] = items
    return {"ok": True, "count": len(items)}


def update_pantry(tool_context: ToolContext, items: list[dict]) -> dict:
    """Update pantry inventory.

    Each item dict: {"name": str, "quantity": str, "expires": str (optional)}.
    """
    tool_context.state["pantry"] = items
    return {"ok": True}


def set_meal_plan(tool_context: ToolContext, plan: str) -> dict:
    """Write a meal plan in shared state. `plan` is markdown — use day headings.

    Format: ## Day 1: Theme\\n- Breakfast: ...\\n- Lunch: ...\\n- Dinner: ...
    Token-streams into the UI.
    """
    tool_context.state["meal_plan"] = plan
    tool_context.state["status"] = "planning"
    return {"ok": True, "length": len(plan)}


def set_weekly_deals(tool_context: ToolContext, deals: str) -> dict:
    """Write the weekly deals summary in shared state. `deals` is markdown."""
    tool_context.state["weekly_deals"] = deals
    return {"ok": True}


def mark_list_ready(tool_context: ToolContext, summary: str) -> dict:
    """Mark the shopping list as ready to shop."""
    tool_context.state["status"] = "ready"
    tool_context.state["review_summary"] = summary
    return {"ok": True}


# ---------------------------------------------------------------------------
# InstructionProvider
# ---------------------------------------------------------------------------
async def _build_instruction(context: ReadonlyContext) -> str:
    s = context.state or {}
    today = datetime.date.today()

    interests = s.get("interests") or ""
    if isinstance(interests, list):
        interests = ", ".join(interests)

    header = f"""\
Current date: {today.strftime("%A, %B %d, %Y")}

USER_BRIEF
- Name: {s.get("travelerName") or ""}
- Budget tier: {s.get("budgetTier") or ""}
- Interests: {interests}"""

    return await instructions_utils.inject_session_state(
        f"{header}\n\n{_INSTRUCTION}", context
    )


_INSTRUCTION = """You are a collaborative grocery and meal-planning partner with access to live Kroger data.

Your job is to help the user plan their grocery shopping efficiently. The shopping list and meal plan
live in shared state and the UI renders them live as you write.

## Search before you plan

Use the Kroger MCP tools to get real data BEFORE writing to state:
- Products: search_products, get_product_details, get_weekly_deals
- Shopping list: manage_shopping_list, add_to_cart, checkout_shopping_list
- Pantry: manage_pantry (read what user already has before suggesting purchases)
- Meals: plan_meals, search_recipes_from_web
- Store: search_locations, get_location_details, set_preferred_location

## Writing to state (UI canvas)

1. NEVER paste the list into chat. The plan lives in state. ALWAYS use tools:
   - `set_shopping_list` to update the full list after changes
   - `set_meal_plan` to write or update the meal plan (streams token-by-token)
   - `update_cart` when the user is ready to check Kroger prices
   - `update_pantry` when the user tells you what they have at home
   - `set_weekly_deals` to surface current Kroger specials
2. Check pantry FIRST — avoid suggesting items the user already has.
3. Cross-reference weekly deals — highlight when a needed item is on sale.
4. After each tool call, reply with a SHORT (1–2 sentence) summary.
5. When the list looks complete, call `mark_list_ready` with a 1-sentence wrap-up.

Be practical, budget-aware, and proactive. Suggest substitutions when items are out of stock or overpriced.
"""


grocery_agent = LlmAgent(
    name="grocery_agent",
    model=LiteLlm(model="mistral/mistral-medium-3-5"),
    instruction=_build_instruction,
    after_tool_callback=shared_after_tool_callback,
    tools=[
        set_shopping_list,
        update_cart,
        update_pantry,
        set_meal_plan,
        set_weekly_deals,
        mark_list_ready,
        AGUIToolset(),
        kroger_toolset(),
    ],
)


GROCERY_PREDICT_STATE = [
    PredictStateMapping(
        state_key="meal_plan",
        tool="set_meal_plan",
        tool_argument="plan",
        emit_confirm_tool=False,
        stream_tool_call=True,
    ),
]


adk_grocery_agent = ADKAgent(
    adk_agent=grocery_agent,
    user_id="demo_user",
    session_timeout_seconds=3600,
    use_in_memory_services=True,
    predict_state=GROCERY_PREDICT_STATE,
)

app = FastAPI(title="Grocery Planning Agent")


@app.middleware("http")
async def trace_requests(request, call_next):
    if request.url.path == "/health":
        return await call_next(request)

    start = time.perf_counter()
    with tracer.start_as_current_span(
        f"{request.method} {request.url.path}",
        attributes={
            "http.request.method": request.method,
            "url.path": request.url.path,
            "url.scheme": request.url.scheme,
        },
    ) as span:
        try:
            response = await call_next(request)
        except Exception as exc:
            span.record_exception(exc)
            span.set_attribute("error.type", type(exc).__name__)
            raise

        span.set_attribute("http.response.status_code", response.status_code)
        span.set_attribute("duration_ms", round((time.perf_counter() - start) * 1000, 2))
        return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

add_adk_fastapi_endpoint(app, adk_grocery_agent, path="/")


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)
