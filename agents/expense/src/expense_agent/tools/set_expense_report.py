from google.adk.tools import FunctionTool, ToolContext


def set_expense_report(
    tool_context: ToolContext, report: str, summary: str
) -> dict[str, object]:
    """Write the markdown expense review report shown in the desk."""
    tool_context.state["expense_report"] = report
    tool_context.state["review_summary"] = summary
    tool_context.state["status"] = "ready"
    return {"ok": True, "length": len(report)}


tool = FunctionTool(set_expense_report)
