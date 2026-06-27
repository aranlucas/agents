from google.adk.tools import FunctionTool, ToolContext


def _state_slides(tool_context: ToolContext) -> list[dict]:
    existing = tool_context.state.get("slides")
    if isinstance(existing, list):
        return existing
    tool_context.state["slides"] = []
    return tool_context.state["slides"]


def reorder_slides(tool_context: ToolContext, slide_ids: list[str]) -> dict:
    """Reorder slides according to the given list of slide ids."""
    slides = _state_slides(tool_context)
    slide_map = {s["id"]: s for s in slides}
    new_slides = [slide_map[sid] for sid in slide_ids if sid in slide_map]
    tool_context.state["slides"] = new_slides
    tool_context.state["active_slide_index"] = 0
    return {"ok": True}


tool = FunctionTool(reorder_slides)
