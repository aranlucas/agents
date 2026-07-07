"""Stub implementations of Kroger MCP tools for eval runs.

These replace the remote MCP toolset so connected grocery eval cases can
exercise the workflow without a live Kroger account.
"""

from google.adk.tools import FunctionTool

from ._types import CartItem, PantryItem


def get_weekly_deals() -> dict[str, object]:
    return {
        "deals": [
            "Simple Truth organic milk",
            "large brown eggs",
            "Private Selection sliced cheddar",
        ],
        "note": "[eval stub]",
    }


def search_products(query: str, limit: int = 5) -> dict[str, object]:
    catalog = {
        "milk": {
            "name": "Simple Truth Organic Vitamin D Whole Milk Gallon",
            "quantity": 1,
            "price": 4.29,
            "upc": "00011110042908",
        },
        "eggs": {
            "name": "Simple Truth Organic Cage Free Large Brown Eggs 18 ct",
            "quantity": 1,
            "price": 5.49,
            "upc": "00011110005971",
        },
        "cheese": {
            "name": "Private Selection Medium Cheddar Sliced Cheese",
            "quantity": 1,
            "price": 3.99,
            "upc": "00011110009524",
        },
    }
    matches = [item for key, item in catalog.items() if key in query.lower()] or list(
        catalog.values()
    )[:limit]
    return {"products": matches[:limit], "note": "[eval stub]"}


def get_product_details(upc: str) -> dict[str, object]:
    return {
        "upc": upc,
        "in_stock": True,
        "aisle": "Dairy",
        "note": "[eval stub]",
    }


def manage_shopping_list(items: list[str]) -> dict[str, object]:
    return {"items": items, "count": len(items), "note": "[eval stub]"}


def manage_pantry(items: list[PantryItem] | None = None) -> dict[str, object]:
    return {"items": items or [], "note": "[eval stub]"}


def plan_meals(days: int = 5, preferences: str = "") -> dict[str, object]:
    return {
        "days": days,
        "preferences": preferences,
        "meals": [
            "Turkey taco bowls",
            "Salmon rice plates",
            "Chicken vegetable stir-fry",
            "Lentil pasta",
            "Egg and veggie breakfast-for-dinner",
        ][:days],
        "note": "[eval stub]",
    }


def add_to_cart(items: list[CartItem]) -> dict[str, object]:
    return {"ok": True, "cart": items, "count": len(items), "note": "[eval stub]"}


get_weekly_deals_tool = FunctionTool(get_weekly_deals)
search_products_tool = FunctionTool(search_products)
get_product_details_tool = FunctionTool(get_product_details)
manage_shopping_list_tool = FunctionTool(manage_shopping_list)
manage_pantry_tool = FunctionTool(manage_pantry)
plan_meals_tool = FunctionTool(plan_meals)
add_to_cart_tool = FunctionTool(add_to_cart)
