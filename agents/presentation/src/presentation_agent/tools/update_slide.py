from google.adk.tools import FunctionTool, ToolContext


def _state_slides(tool_context: ToolContext) -> list[dict]:
    existing = tool_context.state.get("slides")
    if isinstance(existing, list):
        return existing
    tool_context.state["slides"] = []
    return tool_context.state["slides"]


def update_slide(
    tool_context: ToolContext,
    slide_id: str,
    heading: str,
    body: str,
    notes: str,
) -> dict:
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


tool = FunctionTool(update_slide)
