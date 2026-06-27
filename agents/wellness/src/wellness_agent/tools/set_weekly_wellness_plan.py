from google.adk.tools import FunctionTool, ToolContext


def set_weekly_wellness_plan(tool_context: ToolContext, plan: str) -> dict:
    """Write the complete weekly meal and workout plan to shared state."""
    tool_context.state["weekly_plan"] = plan
    tool_context.state["status"] = "planning"
    return {"ok": True, "length": len(plan)}


tool = FunctionTool(set_weekly_wellness_plan)
