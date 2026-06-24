"""Expense Desk ADK agent.

Adapts the ADK samples ambient expense pattern into this repo's state-first
AG-UI console architecture.
"""

from typing import Literal
from uuid import uuid4

from ag_ui_adk import AGUIToolset
from agents_shared.prompts import canvas_contract
from agents_shared.state import make_state_initializer
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    build_model,
    on_model_error_callback,
)
from google.adk.agents import LlmAgent
from google.adk.tools import ToolContext
from pydantic import BaseModel, Field

ExpenseStatus = Literal[
    "submitted",
    "auto_approved",
    "needs_review",
    "approved",
    "rejected",
]
RiskLevel = Literal["low", "medium", "high"]
DeskStatus = Literal["idle", "reviewing", "needs_approval", "ready"]

REVIEW_THRESHOLD_USD = 100.0


class ExpenseItem(BaseModel):
    id: str
    amount: float
    submitter: str
    category: str
    description: str
    date: str
    status: ExpenseStatus = "submitted"
    risk_level: RiskLevel | None = None
    risk_summary: str = ""
    recommendation: str = ""
    decision_note: str = ""


class ExpenseState(BaseModel):
    expenses: list[ExpenseItem] = Field(default_factory=list)
    selected_expense_id: str = ""
    expense_report: str = ""
    status: DeskStatus = "idle"
    review_summary: str = ""
    review_threshold_usd: float = REVIEW_THRESHOLD_USD
    user_id: str = ""


def _state_expenses(tool_context: ToolContext) -> list[dict]:
    existing = tool_context.state.get("expenses")
    if isinstance(existing, list):
        return existing
    tool_context.state["expenses"] = []
    return tool_context.state["expenses"]


def _find_expense(expenses: list[dict], expense_id: str) -> dict | None:
    return next(
        (expense for expense in expenses if expense.get("id") == expense_id),
        None,
    )


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
        tool_context.state.get("review_threshold_usd", REVIEW_THRESHOLD_USD),
    )
    status: ExpenseStatus = "needs_review" if amount >= threshold else "auto_approved"
    expense = ExpenseItem(
        id=f"exp_{uuid4().hex[:8]}",
        amount=amount,
        submitter=submitter,
        category=category,
        description=description,
        date=date,
        status=status,
    ).model_dump()
    expenses = _state_expenses(tool_context)
    expenses.append(expense)
    tool_context.state["expenses"] = expenses
    tool_context.state["selected_expense_id"] = expense["id"]
    tool_context.state["review_threshold_usd"] = threshold
    tool_context.state["status"] = "reviewing" if status == "needs_review" else "ready"
    return {"ok": True, "expense_id": expense["id"], "status": status}


def write_expense_review(
    tool_context: ToolContext,
    expense_id: str,
    risk_level: RiskLevel,
    risk_summary: str,
    recommendation: str,
) -> dict:
    """Write the AI risk review for an expense that needs human approval."""
    expenses = _state_expenses(tool_context)
    expense = _find_expense(expenses, expense_id)
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


def decide_expense(
    tool_context: ToolContext,
    expense_id: str,
    decision: Literal["approved", "rejected"],
    note: str,
) -> dict:
    """Record a human approval or rejection for an expense."""
    expenses = _state_expenses(tool_context)
    expense = _find_expense(expenses, expense_id)
    if expense is None:
        return {"ok": False, "error": "expense_not_found"}
    expense["status"] = decision
    expense["decision_note"] = note
    tool_context.state["expenses"] = expenses
    tool_context.state["selected_expense_id"] = expense_id
    tool_context.state["status"] = "ready"
    tool_context.state["review_summary"] = note
    return {"ok": True, "expense_id": expense_id, "status": decision}


def set_expense_report(tool_context: ToolContext, report: str, summary: str) -> dict:
    """Write the markdown expense review report shown in the desk."""
    tool_context.state["expense_report"] = report
    tool_context.state["review_summary"] = summary
    tool_context.state["status"] = "ready"
    return {"ok": True, "length": len(report)}


def mark_expense_ready(tool_context: ToolContext, summary: str) -> dict[str, bool]:
    """Flag the expense desk as ready after reviews or decisions are up to date."""
    tool_context.state["status"] = "ready"
    tool_context.state["review_summary"] = summary
    return {"ok": True}


_CANVAS_CONTRACT = canvas_contract(
    artifact="expense review report",
    tools=(
        "submit_expense",
        "write_expense_review",
        "decide_expense",
        "set_expense_report",
        "mark_expense_ready",
    ),
)

_INSTRUCTION = (
    """You are Expense Desk, an operations assistant for reviewing employee expenses.

You help the operator submit expenses, identify which ones need review, write
risk notes, and record explicit human decisions. Deterministic routing lives in
the tools: expenses below the threshold auto-approve, expenses at or above it
need review.

Never claim an expense is finally approved or rejected unless the operator has
explicitly said to approve or reject it. For high-value expenses, write a risk
review first with `write_expense_review`, then ask the operator for a decision.

"""
    + _CANVAS_CONTRACT
    + """

When the operator provides expense details, call `submit_expense`.
When an expense needs review, call `write_expense_review` with a concise,
grounded risk summary and recommendation.
When the operator approves or rejects an expense, call `decide_expense`.
When several items have changed, call `set_expense_report` with a markdown
summary grouped by status.

Keep chat concise. The UI renders expense state live.
"""
)

_STATE_INSTRUCTION = """\
Current expense desk state:
- Expenses: {expenses}
- Selected expense id: {selected_expense_id}
- Expense report: {expense_report}
- Status: {status}
- Review summary: {review_summary}
- Review threshold USD: {review_threshold_usd}
- User ID: {user_id}
"""


def build_agent() -> LlmAgent:
    return LlmAgent(
        name="expense_desk_agent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        state_schema=ExpenseState,
        static_instruction=_INSTRUCTION,
        instruction=_STATE_INSTRUCTION,
        before_agent_callback=make_state_initializer(ExpenseState),
        tools=[
            submit_expense,
            write_expense_review,
            decide_expense,
            set_expense_report,
            mark_expense_ready,
            AGUIToolset(),
        ],
    )
