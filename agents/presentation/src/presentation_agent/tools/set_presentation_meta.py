from google.adk.tools import FunctionTool, ToolContext


def set_presentation_meta(tool_context: ToolContext, title: str, theme: str) -> dict:
    """Set the presentation title and theme. Sets status to 'drafting'."""
    tool_context.state["title"] = title
    tool_context.state["theme"] = theme
    tool_context.state["status"] = "drafting"
    return {"ok": True}


tool = FunctionTool(set_presentation_meta)
