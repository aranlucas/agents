import uuid

from google.adk.tools import FunctionTool, ToolContext


def _state_slides(tool_context: ToolContext) -> list[dict]:
    existing = tool_context.state.get("slides")
    if isinstance(existing, list):
        return existing
    tool_context.state["slides"] = []
    return tool_context.state["slides"]


def create_slide(
    tool_context: ToolContext,
    heading: str,
    body: str,
    slide_type: str,
    notes: str,
) -> dict:
    """Add a new slide to the presentation.

    slide_type must be one of: title, content, bullets, two-column.
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


tool = FunctionTool(create_slide)
