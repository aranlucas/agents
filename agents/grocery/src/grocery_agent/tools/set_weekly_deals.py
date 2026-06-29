from google.adk.tools import FunctionTool, ToolContext


def set_weekly_deals(tool_context: ToolContext, deals: str) -> dict[str, object]:
    """Write the weekly deals summary (markdown) to shared state."""
    tool_context.state["weekly_deals"] = deals
    return {"ok": True}


tool = FunctionTool(set_weekly_deals)
