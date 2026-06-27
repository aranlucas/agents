from typing import Literal

from google.adk.tools import FunctionTool, ToolContext

RiskLevel = Literal["low", "medium", "high"]


def _state_expenses(tool_context: ToolContext) -> list[dict]:
    existing = tool_context.state.get("expenses")
    if isinstance(existing, list):
        return existing
    tool_context.state["expenses"] = []
    return tool_context.state["expenses"]


def write_expense_review(
    tool_context: ToolContext,
    expense_id: str,
    risk_level: RiskLevel,
    risk_summary: str,
    recommendation: str,
) -> dict:
    """Write the AI risk review for an expense that needs human approval."""
    expenses = _state_expenses(tool_context)
    expense = next((e for e in expenses if e.get("id") == expense_id), None)
    if expense is None:
        return {"ok": False, "error": "expense_not_found"}
    expense["risk_level"] = risk_level
    expense["risk_summary"] = risk_summary
    expense["recommendation"] = recommendation
    expense["status"] = "needs_review"
    tool_context.state["expenses"] = expenses
    tool_context.state["selected_expense_id"] = expense_id
    tool_context.state["status"] = "needs_approval"
    tool_context.state["review_summary"] = risk_summary
    return {"ok": True, "expense_id": expense_id}


tool = FunctionTool(write_expense_review)
