from google.adk.tools import ToolContext


def mark_presentation_ready(
    tool_context: ToolContext, summary: str
) -> dict[str, object]:
    """Mark the presentation as ready and record a review summary."""
    tool_context.state["status"] = "ready"
    tool_context.state["review_summary"] = summary
    return {"ok": True}
