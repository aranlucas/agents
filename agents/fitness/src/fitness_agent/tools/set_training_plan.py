from google.adk.tools import FunctionTool, ToolContext


def set_training_plan(tool_context: ToolContext, plan: str) -> dict:
    """Write the complete weekly training plan to shared state."""
    tool_context.state["training_plan"] = plan
    tool_context.state["status"] = "planning"
    return {"ok": True, "length": len(plan)}


tool = FunctionTool(set_training_plan)
