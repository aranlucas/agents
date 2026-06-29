from google.adk.tools import ToolContext


def write_summary(tool_context: ToolContext, summary: str) -> dict[str, object]:
    """Write a markdown summary or analysis of the spreadsheet data to state."""
    tool_context.state["summary"] = summary
    tool_context.state["status"] = "ready"
    return {"ok": True, "length": len(summary)}
