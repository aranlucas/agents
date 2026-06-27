from typing import Literal

from google.adk.tools import FunctionTool, ToolContext


def _state_expenses(tool_context: ToolContext) -> list[dict]:
    existing = tool_context.state.get("expenses")
    if isinstance(existing, list):
        return existing
    tool_context.state["expenses"] = []
    return tool_context.state["expenses"]


def decide_expense(
    tool_context: ToolContext,
    expense_id: str,
    decision: Literal["approved", "rejected"],
    note: str,
) -> dict:
    """Record a human approval or rejection for an expense."""
    expenses = _state_expenses(tool_context)
    expense = next((e for e in expenses if e.get("id") == expense_id), None)
    if expense is None:
        return {"ok": False, "error": "expense_not_found"}
    expense["status"] = decision
    expense["decision_note"] = note
    tool_context.state["expenses"] = expenses
    tool_context.state["selected_expense_id"] = expense_id
    tool_context.state["status"] = "ready"
    tool_context.state["review_summary"] = note
    return {"ok": True, "expense_id": expense_id, "status": decision}


tool = FunctionTool(decide_expense)
