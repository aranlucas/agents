from google.adk.tools import ToolContext

from ._types import CartItem


def update_cart(tool_context: ToolContext, items: list[CartItem]) -> dict[str, object]:
    """Update shared state with the live Kroger cart.

    Call only after `add_to_cart` succeeds or a Kroger tool returns the user's
    live Kroger cart contents. Do not use this for shopping-list drafts.

    Each item: {"name": str, "quantity": int, "price": float, "upc": str}.
    """
    tool_context.state["cart"] = items
    return {"ok": True, "count": len(items)}
