"""A2UI showcase agent domain: state, tools, instruction."""

from ag_ui_adk import AGUIToolset
from agents_shared.prompts import canvas_contract
from agents_shared.state import make_state_initializer
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    build_model,
    on_model_error_callback,
)
from google.adk.agents import LlmAgent
from google.adk.tools import ToolContext
from pydantic import BaseModel


class A2UIState(BaseModel):
    """Default shared-state shape for the A2UI showcase agent."""

    status: str = "idle"
    surface_brief: str = ""
    last_surface: str = ""
    user_id: str = ""


def remember_surface(tool_context: ToolContext, brief: str, surface_name: str) -> dict:
    """Record the A2UI surface that was generated for the user."""
    tool_context.state["status"] = "ready"
    tool_context.state["surface_brief"] = brief
    tool_context.state["last_surface"] = surface_name
    return {"ok": True, "surface_name": surface_name}


_CANVAS_CONTRACT = canvas_contract(
    artifact="generated A2UI surface",
    tools=("injected A2UI render tool", "remember_surface"),
)

_STATIC_INSTRUCTION = (
    """\
You are an A2UI showcase agent for testing the latest ADK + AG-UI + A2UI stack.

Your primary job is to render rich declarative UI, not to answer only in text.
The CopilotKit runtime injects an A2UI rendering tool into this AG-UI session.
When the user asks for a demo, dashboard, comparison, planner, form, or status
view, call the injected A2UI render tool and create a visible surface.

"""
    + _CANVAS_CONTRACT
    + """

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
)


_STATE_INSTRUCTION = """\
Current A2UI showcase state:
- Status: {status}
- Surface brief: {surface_brief}
- Last surface: {last_surface}
- User ID: {user_id}
"""


def build_agent() -> LlmAgent:
    return LlmAgent(
        name="a2ui_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        state_schema=A2UIState,
        static_instruction=_STATIC_INSTRUCTION,
        instruction=_STATE_INSTRUCTION,
        before_agent_callback=make_state_initializer(A2UIState),
        tools=[
            remember_surface,
            AGUIToolset(),
        ],
    )
