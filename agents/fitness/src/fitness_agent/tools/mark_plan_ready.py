from google.adk.tools import FunctionTool, ToolContext


def mark_plan_ready(tool_context: ToolContext, summary: str) -> dict[str, bool]:
    """Mark the training plan as ready for review."""
    tool_context.state["status"] = "ready"
    tool_context.state["review_summary"] = summary
    return {"ok": True}


tool = FunctionTool(mark_plan_ready)
