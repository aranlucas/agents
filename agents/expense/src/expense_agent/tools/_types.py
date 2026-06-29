from typing import Literal, TypedDict

from pydantic import TypeAdapter, ValidationError

RiskLevel = Literal["low", "medium", "high"]
ExpenseStatus = Literal[
    "submitted",
    "auto_approved",
    "needs_review",
    "approved",
    "rejected",
]


class ExpenseItem(TypedDict):
    id: str
    amount: float
    submitter: str
    category: str
    description: str
    date: str
    status: ExpenseStatus
    risk_level: RiskLevel | None
    risk_summary: str
    recommendation: str
    decision_note: str


_EXPENSES = TypeAdapter(list[ExpenseItem])


def normalize_expenses(value: object) -> list[ExpenseItem]:
    try:
        return _EXPENSES.validate_python(value)
    except ValidationError:
        return []
