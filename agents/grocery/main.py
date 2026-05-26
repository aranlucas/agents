"""Grocery Planning Agent — Meal Planner MCP + ADK + AG-UI shared-state pattern."""

import json
import logging
import os
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ag_ui_adk import ADKAgent, AGUIToolset, add_adk_fastapi_endpoint
from ag_ui_adk.config import PredictStateMapping

from google.adk.agents import LlmAgent
from google.adk.agents.callback_context import CallbackContext
from google.adk.models import LlmResponse, LlmRequest
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import ToolContext
from opentelemetry import trace
from opentelemetry.instrumentation.sqlite3 import SQLite3Instrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.semconv.resource import ResourceAttributes

from utils import meal_planner_toolset, shared_after_tool_callback

load_dotenv()

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logging.getLogger("google.adk").setLevel(logging.DEBUG)
logging.getLogger("litellm").setLevel(logging.DEBUG)
logging.getLogger("ag_ui_adk").setLevel(logging.DEBUG)

log = logging.getLogger("grocery_agent")

KROGER_TOKEN_HEADER = "x-kroger-access-token"
KROGER_TOKEN_STATE_KEY = "temp:kroger_token"


# ---------------------------------------------------------------------------
# OTEL
# ---------------------------------------------------------------------------
def _setup_otel() -> None:
    if not (
        os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
        or os.getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT")
    ):
        return

    from google.adk.telemetry.setup import maybe_set_otel_providers

    service_name = (
        os.getenv("OTEL_SERVICE_NAME")
        or os.getenv("RAILWAY_SERVICE_NAME")
        or "grocery-agent"
    )
    resource = Resource.create(
        {
            ResourceAttributes.SERVICE_NAME: service_name,
            ResourceAttributes.SERVICE_VERSION: os.getenv(
                "RAILWAY_GIT_COMMIT_SHA", "dev"
            ),
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
# Default state
# ---------------------------------------------------------------------------
_DEFAULT_STATE: dict = {
    "shopping_list": [],
    "meal_plan": "",
    "cart": [],
    "pantry": [],
    "weekly_deals": "",
    "status": "idle",
    "notes": "",
    "review_summary": "",
    "kroger_connected": False,
}


# ---------------------------------------------------------------------------
# State tools — UI canvas writes
# ---------------------------------------------------------------------------
def set_shopping_list(
    tool_context: ToolContext, items: list[str], notes: str = ""
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
    """Write or overwrite the meal plan (token-streams into the UI).

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
def on_before_agent(callback_context: CallbackContext):
    """Initialize missing state keys with defaults on every turn."""
    for key, default in _DEFAULT_STATE.items():
        if key not in callback_context.state:
            callback_context.state[key] = default
    return None


def before_model_modifier(
    callback_context: CallbackContext, llm_request: LlmRequest
) -> Optional[LlmResponse]:
    """Inject current grocery state + auth notice into the system prompt."""
    state = {
        key: callback_context.state.get(key, default)
        for key, default in _DEFAULT_STATE.items()
    }
    kroger_connected: bool = bool(state.get("kroger_connected", False))

    auth_notice = (
        ""
        if kroger_connected
        else (
            "\n\n⚠️ KROGER NOT CONNECTED: The user has not connected their Kroger account. "
            "You MUST tell the user to connect Kroger via the 'Connect Kroger' button in the UI "
            "before you can help with shopping or meal planning. Do NOT attempt to use any MCP tools."
        )
    )

    try:
        state_json = json.dumps(state, indent=2, default=str)
    except Exception:
        state_json = "{}"

    prefix = f"Current grocery state:\n{state_json}{auth_notice}\n\n"

    original = llm_request.config.system_instruction or ""
    llm_request.config.system_instruction = prefix + str(original)
    return None


async def extract_kroger_auth_state(request, input_data) -> dict:
    """Inject Kroger auth as per-invocation temp state from request headers."""
    token = request.headers.get(KROGER_TOKEN_HEADER) or ""
    if not token:
        return {"kroger_connected": False}
    return {"kroger_connected": True, KROGER_TOKEN_STATE_KEY: token}


def after_model_modifier(
    callback_context: CallbackContext, llm_response: LlmResponse
) -> Optional[LlmResponse]:
    """Stop consecutive tool calling after a text reply."""
    if (
        llm_response.content
        and llm_response.content.parts
        and llm_response.content.role == "model"
        and llm_response.content.parts[0].text
    ):
        callback_context._invocation_context.end_invocation = True
    return None


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------
_INSTRUCTION = """\
You are a collaborative grocery and meal-planning partner with live access to Kroger data.

## Auth gate
If `kroger_connected` is False in the current state, stop immediately and tell the user
to click the 'Connect Kroger' button in the UI before you can help. Never call MCP tools
when not connected.

## Workflow
1. Use MCP tools to fetch real data BEFORE writing to state:
   - Products: search_products, get_product_details, get_weekly_deals
   - Shopping list: manage_shopping_list, checkout_shopping_list, add_to_cart
   - Pantry: manage_pantry (check what the user already has first)
   - Meals: plan_meals, search_recipes_from_web
   - Store: search_locations, get_location_details, set_preferred_location

2. Write to state (renders live in the UI canvas) — NEVER paste lists into chat:
   - set_shopping_list — update the full list after any change
   - set_meal_plan — write/update the meal plan (streams token-by-token)
   - update_cart — when the user is ready to check Kroger prices
   - update_pantry — when the user tells you what they have at home
   - set_weekly_deals — surface current Kroger specials

3. After each tool call give a SHORT (1–2 sentence) summary.
4. When the list is complete, call mark_list_ready with a 1-sentence wrap-up.

Be practical, budget-aware, and proactive. Suggest substitutions for out-of-stock items.
"""

grocery_agent = LlmAgent(
    name="grocery_agent",
    model=LiteLlm(
        model="mistral/mistral-small-latest",
        fallbacks=["openrouter/owl-alpha", "nvidia_nim/deepseek-ai/deepseek-v4-flash"],
    ),
    instruction=_INSTRUCTION,
    before_agent_callback=on_before_agent,
    before_model_callback=before_model_modifier,
    after_model_callback=after_model_modifier,
    after_tool_callback=shared_after_tool_callback,
    tools=[
        set_shopping_list,
        update_cart,
        update_pantry,
        set_meal_plan,
        set_weekly_deals,
        mark_list_ready,
        AGUIToolset(),
        meal_planner_toolset(),
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

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
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
            log.exception("Unhandled error in %s %s", request.method, request.url.path)
            raise

        span.set_attribute("http.response.status_code", response.status_code)
        span.set_attribute(
            "duration_ms", round((time.perf_counter() - start) * 1000, 2)
        )
        return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

add_adk_fastapi_endpoint(
    app,
    adk_grocery_agent,
    path="/",
    extract_state_from_request=extract_kroger_auth_state,
)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)
