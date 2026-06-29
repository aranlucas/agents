from google.adk.tools import ToolContext


def write_report(tool_context: ToolContext, report: str) -> dict[str, object]:
    """Write the full markdown report directly to state; set status to 'drafting'."""
    tool_context.state["report"] = report
    tool_context.state["status"] = "drafting"
    return {"ok": True, "length": len(report)}
