from google.adk.tools import ToolContext

from ._types import Slide, normalize_slides


def _state_slides(tool_context: ToolContext) -> list[Slide]:
    slides = normalize_slides(tool_context.state.get("slides") or [])
    tool_context.state["slides"] = slides
    return slides


def update_slide(
    tool_context: ToolContext,
    slide_id: str,
    heading: str,
    body: str,
    notes: str,
) -> dict[str, object]:
    """Update an existing slide by id."""
    slides = _state_slides(tool_context)
    slide = next((s for s in slides if s.get("id") == slide_id), None)
    if slide is None:
        return {"ok": False, "error": "slide_not_found"}
    slide["heading"] = heading
    slide["body"] = body
    slide["notes"] = notes
    tool_context.state["slides"] = slides
    tool_context.state["status"] = "drafting"
    return {"ok": True, "slide_id": slide_id}
