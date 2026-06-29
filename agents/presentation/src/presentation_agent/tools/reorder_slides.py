from google.adk.tools import FunctionTool, ToolContext

from ._types import Slide, normalize_slides


def _state_slides(tool_context: ToolContext) -> list[Slide]:
    slides = normalize_slides(tool_context.state.get("slides") or [])
    tool_context.state["slides"] = slides
    return slides


def reorder_slides(
    tool_context: ToolContext, slide_ids: list[str]
) -> dict[str, object]:
    """Reorder slides according to the given list of slide ids."""
    slides = _state_slides(tool_context)
    slide_map = {s["id"]: s for s in slides}
    new_slides = [slide_map[sid] for sid in slide_ids if sid in slide_map]
    tool_context.state["slides"] = new_slides
    tool_context.state["active_slide_index"] = 0
    return {"ok": True}


tool = FunctionTool(reorder_slides)
