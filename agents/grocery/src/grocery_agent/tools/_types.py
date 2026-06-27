from typing import TypedDict


class CartItem(TypedDict):
    name: str
    quantity: int
    price: float
    upc: str


class PantryItem(TypedDict):
    name: str
    quantity: str
    expires: str | None
