"""Presentation Builder ADK agent.

Helps users create PowerPoint-style slide decks from chat interactions,
writing all content to shared state so the UI can render slides live.
"""

import uuid

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
from pydantic import BaseModel, Field


class PresentationState(BaseModel):
    title: str = ""
    theme: str = "light"  # "light" | "dark" | "minimal"
    slides: list = Field(default_factory=list)  # [{id, type, heading, body, notes}]
    active_slide_index: int = 0
    status: str = "idle"  # idle | drafting | ready
    review_summary: str = ""
    user_id: str = ""


def _state_slides(tool_context: ToolContext) -> list[dict]:
    existing = tool_context.state.get("slides")
    if isinstance(existing, list):
        return existing
    tool_context.state["slides"] = []
    return tool_context.state["slides"]


def _find_slide(slides: list[dict], slide_id: str) -> dict | None:
    return next(
        (slide for slide in slides if slide.get("id") == slide_id),
        None,
    )


def set_presentation_meta(
    tool_context: ToolContext,
    title: str,
    theme: str,
) -> dict:
    """Set the presentation title and theme.

    Both title and theme are required; pass the current value if unchanged.
    Sets status to 'drafting'.
    """
    tool_context.state["title"] = title
    tool_context.state["theme"] = theme
    tool_context.state["status"] = "drafting"
    return {"ok": True}


def create_slide(
    tool_context: ToolContext,
    heading: str,
    body: str,
    slide_type: str,
    notes: str,
) -> dict:
    """Add a new slide to the presentation.

    All params are required. slide_type must be one of: title, content,
    bullets, two-column. Appends the slide and sets active_slide_index to the
    new slide's position. Sets status to 'drafting'.
    """
    slide_id = f"slide_{uuid.uuid4().hex[:8]}"
    slide = {
        "id": slide_id,
        "type": slide_type,
        "heading": heading,
        "body": body,
        "notes": notes,
    }
    slides = _state_slides(tool_context)
    slides.append(slide)
    new_index = len(slides) - 1
    tool_context.state["slides"] = slides
    tool_context.state["active_slide_index"] = new_index
    tool_context.state["status"] = "drafting"
    return {"ok": True, "slide_id": slide_id}


def update_slide(
    tool_context: ToolContext,
    slide_id: str,
    heading: str,
    body: str,
    notes: str,
) -> dict:
    """Update an existing slide by id.

    heading, body, and notes are all required; pass the current values if
    unchanged. Sets status to 'drafting'.
    """
    slides = _state_slides(tool_context)
    slide = _find_slide(slides, slide_id)
    if slide is None:
        return {"ok": False, "error": "slide_not_found"}
    slide["heading"] = heading
    slide["body"] = body
    slide["notes"] = notes
    tool_context.state["slides"] = slides
    tool_context.state["status"] = "drafting"
    return {"ok": True, "slide_id": slide_id}


def delete_slide(tool_context: ToolContext, slide_id: str) -> dict:
    """Remove a slide from the presentation by id."""
    slides = _state_slides(tool_context)
    new_slides = [s for s in slides if s.get("id") != slide_id]
    if len(new_slides) == len(slides):
        return {"ok": False, "error": "slide_not_found"}
    tool_context.state["slides"] = new_slides
    # Clamp active_slide_index to valid range
    current_index = int(tool_context.state.get("active_slide_index", 0))
    if new_slides:
        tool_context.state["active_slide_index"] = min(
            current_index, len(new_slides) - 1
        )
    else:
        tool_context.state["active_slide_index"] = 0
    return {"ok": True}


def reorder_slides(tool_context: ToolContext, slide_ids: list[str]) -> dict:
    """Reorder slides according to the given list of slide ids.

    slide_ids is the desired order; unknown ids are ignored.
    """
    slides = _state_slides(tool_context)
    slide_map = {s["id"]: s for s in slides}
    new_slides = [slide_map[sid] for sid in slide_ids if sid in slide_map]
    tool_context.state["slides"] = new_slides
    tool_context.state["active_slide_index"] = 0
    return {"ok": True}


def mark_presentation_ready(tool_context: ToolContext, summary: str) -> dict:
    """Mark the presentation as ready and record a review summary."""
    tool_context.state["status"] = "ready"
    tool_context.state["review_summary"] = summary
    return {"ok": True}


_CANVAS_CONTRACT = canvas_contract(
    artifact="presentation",
    tools=(
        "set_presentation_meta",
        "create_slide",
        "update_slide",
        "delete_slide",
        "reorder_slides",
        "mark_presentation_ready",
    ),
)

_INSTRUCTION = (
    """\
You are a presentation builder assistant. You help users create professional
slide decks. When a user asks to create a presentation on a topic:

1. Call `set_presentation_meta` with an appropriate title
2. Create slides one by one with `create_slide`
3. The first slide should always be type="title"
4. Use type="bullets" for list content, type="content" for prose,
   type="two-column" for comparisons
5. For body text in "bullets" type, use markdown bullet points (- item)
6. Keep slides focused: 1 main idea per slide, 3-6 bullet points max
7. Add speaker notes for context the audience won't see
8. Call `mark_presentation_ready` when done

"""
    + _CANVAS_CONTRACT
    + """
When the user provides a topic, call `set_presentation_meta` then create the
slides. Use `update_slide` to revise existing content and `delete_slide` to
remove unwanted slides. Use `reorder_slides` when the user wants to rearrange
the deck.

Keep chat concise. The UI renders slide state live.
"""
)

_STATE_INSTRUCTION = """\
Current presentation state:
- Title: {title}
- Theme: {theme}
- Slides: {slides}
- Active slide index: {active_slide_index}
- Status: {status}
- Review summary: {review_summary}
- User ID: {user_id}
"""


def build_agent() -> LlmAgent:
    return LlmAgent(
        name="presentation_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        state_schema=PresentationState,
        static_instruction=_INSTRUCTION,
        instruction=_STATE_INSTRUCTION,
        before_agent_callback=make_state_initializer(PresentationState),
        tools=[
            set_presentation_meta,
            create_slide,
            update_slide,
            delete_slide,
            reorder_slides,
            mark_presentation_ready,
            AGUIToolset(),
        ],
    )
