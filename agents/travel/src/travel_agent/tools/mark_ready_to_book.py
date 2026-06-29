from google.adk.tools import ToolContext


def mark_ready_to_book(tool_context: ToolContext, summary: str) -> dict[str, bool]:
    """Flag the trip as ready for the operator to lock in / book."""
    tool_context.state["status"] = "ready_to_book"
    tool_context.state["review_summary"] = summary
    return {"ok": True}
