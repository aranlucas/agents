from google.adk.tools import FunctionTool, ToolContext


def set_objective_research(
    tool_context: ToolContext, research: str
) -> dict[str, bool | int]:
    """Write curated outdoor objective research to shared state."""
    tool_context.state["objective_research"] = research
    tool_context.state["status"] = "planning"
    return {"ok": True, "length": len(research)}


tool = FunctionTool(set_objective_research)
