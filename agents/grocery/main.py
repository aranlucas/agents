"""Grocery Planning Agent — Meal Planner MCP + ADK + AG-UI shared-state pattern."""

import datetime
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
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource

from utils import meal_planner_toolset

from a2a.server.apps.jsonrpc import A2AFastAPIApplication
from a2a.server.request_handlers import DefaultRequestHandler
from agent_common.task_store import create_task_store
from a2a.types import AgentCapabilities, AgentCard, AgentSkill

from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.auth.credential_service.in_memory_credential_service import (
    InMemoryCredentialService,
)
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.runners import Runner

from agent_common.a2a import (
    apply_a2a_auth_metadata_to_state,
    create_a2a_agent_executor,
)
from agent_common.session_service import create_session_service
from agent_common.tools import shared_after_tool_callback

load_dotenv()

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logging.getLogger("google.adk").setLevel(logging.DEBUG)
logging.getLogger("litellm").setLevel(logging.DEBUG)
logging.getLogger("ag_ui_adk").setLevel(logging.DEBUG)

log = logging.getLogger("grocery_agent")

_railway_domain = os.getenv("RAILWAY_PUBLIC_DOMAIN")
AGENT_PUBLIC_URL = os.getenv("AGENT_PUBLIC_URL") or (
    f"https://{_railway_domain}" if _railway_domain else "http://localhost:8001"
)
KROGER_TOKEN_HEADER = "x-kroger-access-token"
KROGER_TOKEN_STATE_KEY = "temp:kroger_token"
CLERK_USER_ID_HEADER = "x-clerk-user-id"


def extract_identity_state(request) -> dict:
    return {"user_id": request.headers.get(CLERK_USER_ID_HEADER) or "anonymous"}


# ---------------------------------------------------------------------------
# OTEL
# ---------------------------------------------------------------------------
def _setup_otel() -> None:
    if not os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return

    from google.adk.telemetry.setup import maybe_set_otel_providers

    resource = Resource.create(
        {
            "service.name": os.getenv("RAILWAY_SERVICE_NAME", "grocery-agent"),
            "service.version": os.getenv("RAILWAY_GIT_COMMIT_SHA", "dev"),
            "deployment.environment": os.getenv("RAILWAY_ENVIRONMENT_NAME", "local"),
            "railway.project.id": os.getenv("RAILWAY_PROJECT_ID", ""),
            "railway.service.id": os.getenv("RAILWAY_SERVICE_ID", ""),
        }
    )
    maybe_set_otel_providers(otel_resource=resource)
    SQLAlchemyInstrumentor().instrument()


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


def get_current_date() -> dict:
    """Return today's date for meal-plan scheduling and deal timing."""
    today = datetime.date.today()
    return {
        "date": today.isoformat(),
        "weekday": today.strftime("%A"),
        "month": today.strftime("%B %Y"),
    }


# ---------------------------------------------------------------------------
# Callbacks — shared-state pattern
# ---------------------------------------------------------------------------
def on_before_agent(callback_context: CallbackContext):
    """Initialize missing state keys with defaults on every turn."""
    apply_a2a_auth_metadata_to_state(callback_context)
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
If `kroger_connected` is False in the current state, stop immediately and tell the user
to click the 'Connect Kroger' button in the UI before you can help. Never call MCP tools
when not connected.

## Workflow
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

GROCERY_PREDICT_STATE = [
    PredictStateMapping(
        state_key="meal_plan",
        tool="set_meal_plan",
        tool_argument="plan",
        emit_confirm_tool=False,
        stream_tool_call=True,
    ),
]

# Shared SQLite session service — used by both AG-UI and A2A paths.
_shared_session_svc = create_session_service()
_artifact_svc = InMemoryArtifactService()
_memory_svc = InMemoryMemoryService()
_credential_svc = InMemoryCredentialService()

_a2a_runner = Runner(
    app_name=grocery_agent.name,
    agent=grocery_agent,
    artifact_service=_artifact_svc,
    session_service=_shared_session_svc,
    memory_service=_memory_svc,
    credential_service=_credential_svc,
)


def _a2a_agent_card() -> AgentCard:
    return AgentCard(
        name="Grocery Planning Agent",
        description=(
            "Plans meals and shopping lists with live Kroger product data, "
            "pantry tracking, and weekly deals."
        ),
        version="1.0.0",
        url=AGENT_PUBLIC_URL,
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain"],
        capabilities=AgentCapabilities(streaming=True),
        skills=[
            AgentSkill(
                id="grocery_planning",
                name="Grocery Planning",
                description="Creates meal plans and shopping lists from live Kroger data.",
                tags=["grocery", "meal-planning"],
                input_modes=["text/plain"],
                output_modes=["text/plain"],
            )
        ],
    )


adk_grocery_agent = ADKAgent(
    adk_agent=grocery_agent,
    session_service=_shared_session_svc,
    artifact_service=_artifact_svc,
    memory_service=_memory_svc,
    credential_service=_credential_svc,
    session_timeout_seconds=3600,
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

# A2A — JSON-RPC at POST / and agent card at GET /.well-known/agent-card.json
_a2a_card = _a2a_agent_card()
_a2a_handler = DefaultRequestHandler(
    agent_executor=create_a2a_agent_executor(_a2a_runner),
    task_store=create_task_store(),
)
A2AFastAPIApplication(
    agent_card=_a2a_card,
    http_handler=_a2a_handler,
).add_routes_to_app(app)

add_adk_fastapi_endpoint(
    app,
    adk_grocery_agent,
    path="/agui",
    extract_state_from_request=extract_kroger_auth_state,
)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)
