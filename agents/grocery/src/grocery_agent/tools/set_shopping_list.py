from google.adk.tools import FunctionTool, ToolContext


def set_shopping_list(
    tool_context: ToolContext,
    items: list[str],
    notes: str = "",
) -> dict:
    """Replace the full shopping list in shared state.

    `items` is a list of item strings (e.g. ["2x milk", "eggs", "bread"]).
    `notes` is an optional markdown block with shopping notes or substitutions.
    """
    tool_context.state["shopping_list"] = items
    tool_context.state["status"] = "planning"
    if notes:
        tool_context.state["notes"] = notes
    return {"ok": True, "count": len(items)}


tool = FunctionTool(set_shopping_list)
