from google.adk.tools import ToolContext


def mark_research_ready(tool_context: ToolContext, summary: str) -> dict[str, bool]:
    """Mark the research report as ready and capture the review summary."""
    tool_context.state["status"] = "ready"
    tool_context.state["review_summary"] = summary
    return {"ok": True}
