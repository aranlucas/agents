from google.adk.tools import ToolContext

from ._types import CartItem


def update_cart(tool_context: ToolContext, items: list[CartItem]) -> dict[str, object]:
    """Update the cart with Kroger items ready for checkout.

    Each item: {"name": str, "quantity": int, "price": float, "upc": str}.
    """
    tool_context.state["cart"] = items
    return {"ok": True, "count": len(items)}
