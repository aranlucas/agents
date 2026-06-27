from uuid import uuid4

from google.adk.tools import FunctionTool, ToolContext

REVIEW_THRESHOLD_USD = 100.0


def _state_expenses(tool_context: ToolContext) -> list[dict]:
    existing = tool_context.state.get("expenses")
    if isinstance(existing, list):
        return existing
    tool_context.state["expenses"] = []
    return tool_context.state["expenses"]


def submit_expense(
    tool_context: ToolContext,
    amount: float,
    submitter: str,
    category: str,
    description: str,
    date: str,
) -> dict:
    """Create an expense and route it by amount.

    Amounts below the review threshold are auto-approved. Amounts at or above
    the threshold require an AI risk review and human decision.
    """
    if amount <= 0:
        return {"ok": False, "error": "amount_must_be_positive"}
    if not submitter.strip():
        return {"ok": False, "error": "submitter_required"}
    if not date.strip():
        return {"ok": False, "error": "date_required"}

    threshold = float(
        tool_context.state.get("review_threshold_usd", REVIEW_THRESHOLD_USD)
    )
    status = "needs_review" if amount >= threshold else "auto_approved"
    expense = {
        "id": f"exp_{uuid4().hex[:8]}",
        "amount": amount,
        "submitter": submitter,
        "category": category,
        "description": description,
        "date": date,
        "status": status,
        "risk_level": None,
        "risk_summary": "",
        "recommendation": "",
        "decision_note": "",
    }
    expenses = _state_expenses(tool_context)
    expenses.append(expense)
    tool_context.state["expenses"] = expenses
    tool_context.state["selected_expense_id"] = expense["id"]
    tool_context.state["review_threshold_usd"] = threshold
    tool_context.state["status"] = "reviewing" if status == "needs_review" else "ready"
    return {"ok": True, "expense_id": expense["id"], "status": status}


tool = FunctionTool(submit_expense)
