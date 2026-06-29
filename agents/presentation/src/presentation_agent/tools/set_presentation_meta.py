from google.adk.tools import ToolContext


def set_presentation_meta(
    tool_context: ToolContext, title: str, theme: str
) -> dict[str, object]:
    """Set the presentation title and theme. Sets status to 'drafting'."""
    tool_context.state["title"] = title
    tool_context.state["theme"] = theme
    tool_context.state["status"] = "drafting"
    return {"ok": True}
