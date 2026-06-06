"""A2UI Showcase Agent - ADK agent that renders A2UI through AG-UI."""

import json
import logging
import os
import time
from typing import TYPE_CHECKING, Any

from a2a.server.apps.jsonrpc import A2AFastAPIApplication
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.types import AgentCapabilities, AgentCard, AgentSkill
from ag_ui_adk import ADKAgent, AGUIToolset, add_adk_fastapi_endpoint
from agent_common.a2a import (
    apply_a2a_auth_metadata_to_state,
    create_a2a_agent_executor,
)
from agent_common.session_service import create_session_service
from agent_common.task_store import create_task_store
from agent_common.tools import shared_after_tool_callback
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from google.adk.agents import LlmAgent
from google.adk.artifacts.in_memory_artifact_service import InMemoryArtifactService
from google.adk.auth.credential_service.in_memory_credential_service import (
    InMemoryCredentialService,
)
from google.adk.memory.in_memory_memory_service import InMemoryMemoryService
from google.adk.models.lite_llm import LiteLlm
from google.adk.runners import Runner
from opentelemetry import trace
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import Resource

if TYPE_CHECKING:
    from google.adk.agents.callback_context import CallbackContext
    from google.adk.models import LlmRequest, LlmResponse
    from google.adk.tools import ToolContext

load_dotenv()

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logging.getLogger("google.adk").setLevel(logging.DEBUG)
logging.getLogger("litellm").setLevel(logging.DEBUG)
logging.getLogger("ag_ui_adk").setLevel(logging.DEBUG)

log = logging.getLogger("a2ui_agent")

_railway_domain = os.getenv("RAILWAY_PUBLIC_DOMAIN")
AGENT_PUBLIC_URL = os.getenv("AGENT_PUBLIC_URL") or (
    f"https://{_railway_domain}" if _railway_domain else "http://localhost:8004"
)
CLERK_USER_ID_HEADER = "x-clerk-user-id"

_DEFAULT_STATE: dict[str, Any] = {
    "status": "idle",
    "surface_brief": "",
    "last_surface": "",
    "user_id": "",
}


def _setup_otel() -> None:
    if not os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return

    from google.adk.telemetry.setup import maybe_set_otel_providers

    resource = Resource.create(
        {
            "service.name": os.getenv("RAILWAY_SERVICE_NAME", "a2ui-agent"),
            "service.version": os.getenv("RAILWAY_GIT_COMMIT_SHA", "dev"),
            "deployment.environment": os.getenv("RAILWAY_ENVIRONMENT_NAME", "local"),
            "railway.project.id": os.getenv("RAILWAY_PROJECT_ID", ""),
            "railway.service.id": os.getenv("RAILWAY_SERVICE_ID", ""),
        },
    )
    maybe_set_otel_providers(otel_resource=resource)
    SQLAlchemyInstrumentor().instrument()


_setup_otel()
tracer = trace.get_tracer("a2ui-agent")


async def extract_demo_state(request, _input_data) -> dict[str, Any]:
    return {"user_id": request.headers.get(CLERK_USER_ID_HEADER) or "anonymous"}


def on_before_agent(callback_context: CallbackContext) -> None:
    apply_a2a_auth_metadata_to_state(callback_context)
    for key, default in _DEFAULT_STATE.items():
        if key not in callback_context.state:
            callback_context.state[key] = default


def before_model_modifier(
    callback_context: CallbackContext,
    llm_request: LlmRequest,
) -> LlmResponse | None:
    state = {
        key: callback_context.state.get(key, default)
        for key, default in _DEFAULT_STATE.items()
    }
    llm_request.config.system_instruction = (
        "Current A2UI showcase state:\n"
        + json.dumps(state, indent=2, default=str)
        + "\n\n"
        + str(llm_request.config.system_instruction or "")
    )
    return None


def remember_surface(tool_context: ToolContext, brief: str, surface_name: str) -> dict:
    """Record the A2UI surface that was generated for the user."""
    tool_context.state["status"] = "ready"
    tool_context.state["surface_brief"] = brief
    tool_context.state["last_surface"] = surface_name
    return {"ok": True, "surface_name": surface_name}


_INSTRUCTION = """\
You are an A2UI showcase agent for testing the latest ADK + AG-UI + A2UI stack.

Your primary job is to render rich declarative UI, not to answer only in text.
The CopilotKit runtime injects an A2UI rendering tool into this AG-UI session.
When the user asks for a demo, dashboard, comparison, planner, form, or status
view, call the injected A2UI render tool and create a visible surface.

Use this catalog id exactly when calling the A2UI render tool:
`https://a2ui.org/specification/v0_9/basic_catalog.json`.
Do not use `default` as a catalog id.
Do not use `type` fields, lowercase component names, `box`, `metric`,
`checklist`, or `title`. Every component object must use a `component` field.

Use this exact v0.9 shape as the template:
{
  "surfaceId": "launch-readiness",
  "catalogId": "https://a2ui.org/specification/v0_9/basic_catalog.json",
  "components": [
    { "id": "root", "component": "Column", "children": ["hero", "metrics", "checklist-card", "compare", "action"] },
    { "id": "hero", "component": "Card", "child": "hero-content" },
    { "id": "hero-content", "component": "Column", "children": ["title", "summary"] },
    { "id": "title", "component": "Text", "variant": "h2", "text": "Launch Readiness" },
    { "id": "summary", "component": "Text", "text": "ADK is connected over AG-UI and rendering A2UI surfaces." },
    { "id": "metrics", "component": "Row", "children": ["metric-adk", "metric-agui", "metric-a2ui"] },
    { "id": "metric-adk", "component": "Card", "child": "metric-adk-text" },
    { "id": "metric-adk-text", "component": "Text", "text": "ADK agent: active" },
    { "id": "metric-agui", "component": "Card", "child": "metric-agui-text" },
    { "id": "metric-agui-text", "component": "Text", "text": "AG-UI stream: connected" },
    { "id": "metric-a2ui", "component": "Card", "child": "metric-a2ui-text" },
    { "id": "metric-a2ui-text", "component": "Text", "text": "A2UI renderer: visible" },
    { "id": "checklist-card", "component": "Card", "child": "checklist" },
    { "id": "checklist", "component": "Column", "children": ["c1", "c2", "c3"] },
    { "id": "c1", "component": "Text", "text": "Done: runtime injects render_a2ui" },
    { "id": "c2", "component": "Text", "text": "Done: agent calls the A2UI tool" },
    { "id": "c3", "component": "Text", "text": "Done: UI renders a declarative surface" },
    { "id": "compare", "component": "Row", "children": ["agui-card", "a2ui-card"] },
    { "id": "agui-card", "component": "Card", "child": "agui-text" },
    { "id": "agui-text", "component": "Text", "text": "AG-UI moves agent events and tool calls." },
    { "id": "a2ui-card", "component": "Card", "child": "a2ui-text" },
    { "id": "a2ui-text", "component": "Text", "text": "A2UI turns those events into a rendered surface." },
    { "id": "action", "component": "Button", "variant": "primary", "child": "action-text", "action": { "event": { "name": "surface_verified", "context": { "surface": "launch-readiness" } } } },
    { "id": "action-text", "component": "Text", "text": "Surface verified" }
  ]
}

For the default demo, render a compact "Launch Readiness" surface with:
- a title and short status summary,
- three metric cards,
- a checklist of setup steps,
- a two-column section comparing AG-UI transport and A2UI surfaces,
- one clear next-action button or callout.

After the A2UI render tool succeeds, call remember_surface with a concise brief
and the surface name. Keep chat text short; the generated UI is the product.
"""


a2ui_agent = LlmAgent(
    name="a2ui_agent",
    model=LiteLlm(
        model="openrouter/poolside/laguna-m.1:free",
        fallbacks=[
            "mistral/mistral-small-latest",
            "openrouter/owl-alpha",
            "nvidia_nim/deepseek-ai/deepseek-v4-flash",
        ],
    ),
    instruction=_INSTRUCTION,
    before_agent_callback=on_before_agent,
    before_model_callback=before_model_modifier,
    after_tool_callback=shared_after_tool_callback,
    tools=[
        remember_surface,
        AGUIToolset(),
    ],
)

_shared_session_svc = create_session_service()
_artifact_svc = InMemoryArtifactService()
_memory_svc = InMemoryMemoryService()
_credential_svc = InMemoryCredentialService()

_a2a_runner = Runner(
    app_name=a2ui_agent.name,
    agent=a2ui_agent,
    artifact_service=_artifact_svc,
    session_service=_shared_session_svc,
    memory_service=_memory_svc,
    credential_service=_credential_svc,
)


def _a2a_agent_card() -> AgentCard:
    return AgentCard(
        name="A2UI Showcase Agent",
        description=(
            "Renders declarative A2UI surfaces over AG-UI from a Google ADK agent."
        ),
        version="1.0.0",
        url=AGENT_PUBLIC_URL,
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain"],
        capabilities=AgentCapabilities(streaming=True),
        skills=[
            AgentSkill(
                id="a2ui_showcase",
                name="A2UI Showcase",
                description="Creates rich A2UI demo surfaces through CopilotKit AG-UI.",
                tags=["a2ui", "ag-ui", "adk", "generative-ui"],
                input_modes=["text/plain"],
                output_modes=["text/plain"],
            ),
        ],
    )


adk_a2ui_agent = ADKAgent(
    adk_agent=a2ui_agent,
    session_service=_shared_session_svc,
    artifact_service=_artifact_svc,
    memory_service=_memory_svc,
    credential_service=_credential_svc,
    session_timeout_seconds=3600,
)

app = FastAPI(title="A2UI Showcase Agent")


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
            "duration_ms",
            round((time.perf_counter() - start) * 1000, 2),
        )
        return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    adk_a2ui_agent,
    path="/agui",
    extract_state_from_request=extract_demo_state,
)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8004"))
    uvicorn.run(app, host="0.0.0.0", port=port)
