from google.adk.tools import FunctionTool, ToolContext


def mark_presentation_ready(tool_context: ToolContext, summary: str) -> dict:
    """Mark the presentation as ready and record a review summary."""
    tool_context.state["status"] = "ready"
    tool_context.state["review_summary"] = summary
    return {"ok": True}


tool = FunctionTool(mark_presentation_ready)
