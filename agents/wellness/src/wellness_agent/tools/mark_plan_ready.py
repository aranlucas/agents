from google.adk.tools import ToolContext


def mark_plan_ready(tool_context: ToolContext, summary: str) -> dict[str, bool]:
    """Mark the combined weekly wellness plan as ready."""
    tool_context.state["status"] = "ready"
    tool_context.state["review_summary"] = summary
    return {"ok": True}
