from google.adk.tools import FunctionTool, ToolContext


def write_report(tool_context: ToolContext, report: str) -> dict:
    """Write the full markdown report directly to state; set status to 'drafting'."""
    tool_context.state["report"] = report
    tool_context.state["status"] = "drafting"
    return {"ok": True, "length": len(report)}


tool = FunctionTool(write_report)
