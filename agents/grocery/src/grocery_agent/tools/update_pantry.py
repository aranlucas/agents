from google.adk.tools import ToolContext

from ._types import PantryItem


def update_pantry(
    tool_context: ToolContext, items: list[PantryItem]
) -> dict[str, object]:
    """Sync pantry inventory to shared state.

    Each item: {"name": str, "quantity": str, "expires": str (optional)}.
    """
    tool_context.state["pantry"] = items
    return {"ok": True}
