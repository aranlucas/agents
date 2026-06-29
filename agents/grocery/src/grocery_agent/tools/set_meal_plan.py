from google.adk.tools import ToolContext


def set_meal_plan(tool_context: ToolContext, plan: str) -> dict[str, object]:
    r"""Write or overwrite the meal plan (token-streams into the UI).

    Use markdown day headings: ## Day 1: Theme\\n- Breakfast: ...
    """
    tool_context.state["meal_plan"] = plan
    tool_context.state["status"] = "planning"
    return {"ok": True, "length": len(plan)}
