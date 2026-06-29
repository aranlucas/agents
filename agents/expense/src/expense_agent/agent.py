"""Expense Desk ADK agent."""

from pathlib import Path
from typing import Literal

from ag_ui_adk import AGUIToolset
from agents_shared.state import make_state_initializer
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    on_model_error_callback,
    stop_on_terminal_text,
)
from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import FunctionTool
from pydantic import BaseModel, Field

from .tools.decide_expense import decide_expense
from .tools.mark_expense_ready import mark_expense_ready
from .tools.set_expense_report import set_expense_report
from .tools.submit_expense import REVIEW_THRESHOLD_USD, submit_expense
from .tools.write_expense_review import write_expense_review

_INSTRUCTION = (Path(__file__).parent / "instructions.md").read_text(encoding="utf-8")

ExpenseStatus = Literal[
    "submitted",
    "auto_approved",
    "needs_review",
    "approved",
    "rejected",
]
RiskLevel = Literal["low", "medium", "high"]
DeskStatus = Literal["idle", "reviewing", "needs_approval", "ready"]


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
    expenses: list[ExpenseItem] = Field(default_factory=list[ExpenseItem])
    selected_expense_id: str = ""
    expense_report: str = ""
    status: DeskStatus = "idle"
    review_summary: str = ""
    review_threshold_usd: float = REVIEW_THRESHOLD_USD
    user_id: str = ""


def _build_agent(*, include_agui: bool) -> LlmAgent:
    tools: list[object] = [
        FunctionTool(submit_expense),
        FunctionTool(write_expense_review),
        FunctionTool(decide_expense),
        FunctionTool(set_expense_report),
        FunctionTool(mark_expense_ready),
    ]
    if include_agui:
        tools.append(AGUIToolset())

    return LlmAgent(
        name="expense_desk_agent",
        description="Expense review and approval-desk workflow.",
        model=LiteLlm(model="openrouter/openai/gpt-oss-120b:free"),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        state_schema=ExpenseState,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(ExpenseState),
        tools=tools,
    )


def build_agent() -> LlmAgent:
    return _build_agent(include_agui=True)


def build_telegram_agent() -> LlmAgent:
    return _build_agent(include_agui=False)


def build_eval_agent() -> LlmAgent:
    """Eval-compatible agent: no AGUIToolset."""
    return LlmAgent(
        name="expense_desk_agent",
        description="Expense review and approval-desk workflow.",
        model=LiteLlm(model="mistral/mistral-small-latest"),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        instruction=_INSTRUCTION,
        before_agent_callback=make_state_initializer(ExpenseState),
        tools=[
            FunctionTool(submit_expense),
            FunctionTool(write_expense_review),
            FunctionTool(decide_expense),
            FunctionTool(set_expense_report),
            FunctionTool(mark_expense_ready),
        ],
    )


root_agent = build_eval_agent()
