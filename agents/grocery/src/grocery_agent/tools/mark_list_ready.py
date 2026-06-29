from google.adk.tools import ToolContext


def mark_list_ready(tool_context: ToolContext, summary: str) -> dict[str, bool]:
    """Mark the shopping list as ready to shop."""
    tool_context.state["status"] = "ready"
    tool_context.state["review_summary"] = summary
    return {"ok": True}
