from google.adk.tools import FunctionTool, ToolContext

from ._types import Slide, normalize_slides


def _state_slides(tool_context: ToolContext) -> list[Slide]:
    slides = normalize_slides(tool_context.state.get("slides") or [])
    tool_context.state["slides"] = slides
    return slides


def delete_slide(tool_context: ToolContext, slide_id: str) -> dict[str, object]:
    """Remove a slide from the presentation by id."""
    slides = _state_slides(tool_context)
    new_slides = [s for s in slides if s.get("id") != slide_id]
    if len(new_slides) == len(slides):
        return {"ok": False, "error": "slide_not_found"}
    tool_context.state["slides"] = new_slides
    current_index = int(tool_context.state.get("active_slide_index", 0))
    if new_slides:
        tool_context.state["active_slide_index"] = min(
            current_index, len(new_slides) - 1
        )
    else:
        tool_context.state["active_slide_index"] = 0
    return {"ok": True}


tool = FunctionTool(delete_slide)
