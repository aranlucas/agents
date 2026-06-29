from google.adk.tools import ToolContext


def mark_expense_ready(tool_context: ToolContext, summary: str) -> dict[str, bool]:
    """Flag the expense desk as ready after reviews or decisions are up to date."""
    tool_context.state["status"] = "ready"
    tool_context.state["review_summary"] = summary
    return {"ok": True}
