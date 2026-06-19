# Expense Desk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new `expense` ADK agent and AG-UI Next.js console that adapts the `ambient-expense-agent` sample into a state-first expense review desk.

**Architecture:** The backend is a new `expense_agent` package mounted by the existing FastAPI gateway at `/expense/agui`, using LiteLLM through `agents_shared.tools.build_model()`. The agent writes all durable UI data through deterministic state tools. The frontend adds an `expense` console route with a bespoke operational review desk that reads CopilotKit agent state and sends approval/rejection prompts back to the agent.

**Tech Stack:** Python 3.14, Google ADK, LiteLLM, `ag-ui-adk`, FastAPI, Next.js 16 App Router, React 19, CopilotKit v2, Vitest, Ruff, Pytest.

## Global Constraints

- Use the existing monorepo patterns; do not add per-agent `pyproject.toml` files.
- Use `LiteLlm` via `agents_shared.tools.build_model()`.
- State is the source of truth; UI reads `agent.state`, not chat messages.
- Never paste agent output into chat as the primary artifact; write review/report state via tools.
- Preserve unrelated user changes in the dirty worktree.
- Do not add real accounting, payment, Pub/Sub, email, deployment, or OAuth integrations.
- Do not test LLM prose content in pytest or vitest.

---

## File Structure

**Create:**

- `agents/expense/src/expense_agent/__init__.py` — package marker.
- `agents/expense/src/expense_agent/agent.py` — state models, deterministic tools, prompt, and `build_agent()`.
- `agents/expense/src/expense_agent/main.py` — gateway route registration.
- `agents/expense/tests/test_expense_tools.py` — deterministic tool tests.
- `apps/web/src/components/chat/expense-workspace.tsx` — CopilotKit-aware workspace wrapper.
- `apps/web/src/components/chat/expense/expense-desk.tsx` — presentational desk UI.
- `apps/web/src/components/chat/expense/expense-desk.test.tsx` — UI behavior tests.
- `apps/web/src/app/console/expense/page.tsx` — redirect to a new thread.
- `apps/web/src/app/console/expense/[thread]/layout.tsx` — `ConsoleSession` provider.
- `apps/web/src/app/console/expense/[thread]/page.tsx` — render `ExpenseWorkspace`.

**Modify:**

- `pyproject.toml` — include `agents/expense/src/expense_agent`.
- `agents/gateway/src/gateway/main.py` — import and register `expense`.
- `packages/types/src/index.ts` — add `expense` to agent ids/backends and define `ExpenseState`.
- `apps/web/src/components/chat/agents/registry.ts` — add `expense` config.
- `apps/web/src/components/chat/agents/registry.test.ts` — assert display order, backend path, and no external requirements.

---

### Task 1: Backend Expense Tools

**Files:**

- Create: `agents/expense/src/expense_agent/__init__.py`
- Create: `agents/expense/src/expense_agent/agent.py`
- Test: `agents/expense/tests/test_expense_tools.py`

**Interfaces:**

- Produces `ExpenseState`, `ExpenseItem`, `submit_expense`, `write_expense_review`, `decide_expense`, `set_expense_report`, `mark_expense_ready`, and `build_agent()`.
- Later tasks import `build_agent()` from `expense_agent.agent`.

- [ ] **Step 1: Write the failing backend tests**

Create `agents/expense/tests/test_expense_tools.py`:

```python
from expense_agent.agent import (
    decide_expense,
    set_expense_report,
    submit_expense,
    write_expense_review,
)


class DummyToolContext:
    def __init__(self, state=None):
        self.state = state or {}


def test_low_value_expense_auto_approves():
    ctx = DummyToolContext()

    result = submit_expense(
        tool_context=ctx,
        amount=45.5,
        submitter="alice@example.com",
        category="meals",
        description="Team lunch",
        date="2026-06-18",
    )

    assert result["ok"] is True
    expense = ctx.state["expenses"][0]
    assert expense["status"] == "auto_approved"
    assert expense["id"] == result["expense_id"]
    assert ctx.state["selected_expense_id"] == expense["id"]
    assert ctx.state["status"] == "ready"


def test_high_value_expense_requires_review():
    ctx = DummyToolContext()

    submit_expense(
        tool_context=ctx,
        amount=250,
        submitter="alice@example.com",
        category="travel",
        description="Flight to NYC",
        date="2026-06-18",
    )

    expense = ctx.state["expenses"][0]
    assert expense["status"] == "needs_review"
    assert ctx.state["status"] == "reviewing"


def test_review_updates_risk_fields_and_status():
    ctx = DummyToolContext()
    result = submit_expense(
        tool_context=ctx,
        amount=250,
        submitter="alice@example.com",
        category="travel",
        description="Flight to NYC",
        date="2026-06-18",
    )

    review = write_expense_review(
        tool_context=ctx,
        expense_id=result["expense_id"],
        risk_level="medium",
        risk_summary="Round-trip flight is plausible but needs receipt confirmation.",
        recommendation="approve",
    )

    assert review == {"ok": True, "expense_id": result["expense_id"]}
    expense = ctx.state["expenses"][0]
    assert expense["risk_level"] == "medium"
    assert "receipt" in expense["risk_summary"]
    assert expense["recommendation"] == "approve"
    assert ctx.state["status"] == "needs_approval"


def test_decision_updates_expense():
    ctx = DummyToolContext()
    result = submit_expense(
        tool_context=ctx,
        amount=250,
        submitter="alice@example.com",
        category="travel",
        description="Flight to NYC",
        date="2026-06-18",
    )

    decision = decide_expense(
        tool_context=ctx,
        expense_id=result["expense_id"],
        decision="approved",
        note="Receipt attached.",
    )

    assert decision == {"ok": True, "expense_id": result["expense_id"], "status": "approved"}
    expense = ctx.state["expenses"][0]
    assert expense["status"] == "approved"
    assert expense["decision_note"] == "Receipt attached."
    assert ctx.state["status"] == "ready"


def test_set_expense_report_stream_target():
    ctx = DummyToolContext()

    result = set_expense_report(
        tool_context=ctx,
        report="## Expense review\n- 1 approved",
        summary="One expense approved.",
    )

    assert result == {"ok": True, "length": len("## Expense review\n- 1 approved")}
    assert ctx.state["expense_report"].startswith("## Expense review")
    assert ctx.state["review_summary"] == "One expense approved."
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest agents/expense/tests/test_expense_tools.py -q`

Expected: FAIL because `expense_agent` does not exist.

- [ ] **Step 3: Implement the backend tools and agent**

Create `agents/expense/src/expense_agent/__init__.py` as an empty file.

Create `agents/expense/src/expense_agent/agent.py`:

```python
"""Expense Desk ADK agent.

Adapts the ambient expense sample into this repo's state-first AG-UI pattern.
"""

from typing import Literal
from uuid import uuid4

from ag_ui_adk import AGUIToolset
from agents_shared.prompts import canvas_contract
from agents_shared.state import make_state_initializer
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    build_model,
    make_mark_ready,
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
    return next((expense for expense in expenses if expense.get("id") == expense_id), None)


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

    threshold = float(tool_context.state.get("review_threshold_usd", REVIEW_THRESHOLD_USD))
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


mark_expense_ready = make_mark_ready(
    "mark_expense_ready",
    "ready",
    doc="Flag the expense desk as ready after reviews or decisions are up to date.",
)

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
```

- [ ] **Step 4: Run backend tests to verify they pass**

Run: `uv run pytest agents/expense/tests/test_expense_tools.py -q`

Expected: PASS.

---

### Task 2: Gateway and Python Package Wiring

**Files:**

- Create: `agents/expense/src/expense_agent/main.py`
- Modify: `pyproject.toml`
- Modify: `agents/gateway/src/gateway/main.py`

**Interfaces:**

- Consumes `build_agent()` from Task 1.
- Produces gateway route `/expense/agui` and health route `/expense/health`.

- [ ] **Step 1: Add a failing import/registration smoke test**

Add to `agents/expense/tests/test_expense_tools.py`:

```python
def test_expense_register_imports():
    from expense_agent.main import register

    assert callable(register)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest agents/expense/tests/test_expense_tools.py::test_expense_register_imports -q`

Expected: FAIL because `expense_agent.main` does not exist.

- [ ] **Step 3: Implement route registration**

Create `agents/expense/src/expense_agent/main.py`:

```python
"""Expense Desk agent wiring."""

from agents_shared.app_factory import (
    add_agent_routes,
    build_adk_agent,
    streaming_state_mapping,
)
from agents_shared.dependencies import AgentServices
from agents_shared.state import make_extract_state
from dotenv import load_dotenv
from fastapi import FastAPI

from .agent import build_agent

load_dotenv()

EXPENSE_PREDICT_STATE = [
    streaming_state_mapping(
        state_key="expense_report",
        tool="set_expense_report",
        tool_argument="report",
    ),
]

_expense_agent = build_agent()


def register(app: FastAPI, services: AgentServices):
    add_agent_routes(
        app,
        prefix="/expense",
        adk_agent=build_adk_agent(
            _expense_agent,
            services=services,
            predict_state=EXPENSE_PREDICT_STATE,
        ),
        services=services,
        extract_state_from_request=make_extract_state(),
    )
```

In `pyproject.toml`, add:

```toml
  "agents/expense/src/expense_agent",
```

In `agents/gateway/src/gateway/main.py`, add:

```python
from expense_agent.main import register as register_expense
```

and include `register_expense` in the `register_agents` tuple after
`register_wellness`.

- [ ] **Step 4: Run tests to verify wiring**

Run: `uv run pytest agents/expense/tests/test_expense_tools.py -q`

Expected: PASS.

---

### Task 3: Shared Types and Agent Registry

**Files:**

- Modify: `packages/types/src/index.ts`
- Modify: `apps/web/src/components/chat/agents/registry.ts`
- Modify: `apps/web/src/components/chat/agents/registry.test.ts`

**Interfaces:**

- Produces `AgentId` including `"expense"` and `ExpenseState` consumed by the Expense UI.

- [ ] **Step 1: Update failing registry test**

In `apps/web/src/components/chat/agents/registry.test.ts`, update expected order:

```ts
expect(AGENT_ORDER).toEqual([
  "travel",
  "grocery",
  "fitness",
  "wellness",
  "expense",
  "oral-boards",
  "oral-boards-v2",
  "a2ui",
  "resume",
]);
```

Add expectations:

```ts
expect(AGENT_BACKEND_PATHS.expense).toBe("expense");
expect(getAgentConfig("expense").requires ?? []).toEqual([]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run src/components/chat/agents/registry.test.ts`

Expected: FAIL because `expense` is not registered.

- [ ] **Step 3: Add shared types and registry config**

In `packages/types/src/index.ts`, add `"expense"` after `"wellness"` in
`AGENT_ORDER` and add `expense: "expense"` to `AGENT_BACKEND_PATHS`.

Add:

```ts
export type ExpenseStatus =
  | "submitted"
  | "auto_approved"
  | "needs_review"
  | "approved"
  | "rejected";

export type ExpenseRiskLevel = "low" | "medium" | "high";
export type ExpenseDeskStatus = "idle" | "reviewing" | "needs_approval" | "ready";

export type ExpenseItem = {
  id: string;
  amount: number;
  submitter: string;
  category: string;
  description: string;
  date: string;
  status: ExpenseStatus;
  risk_level?: ExpenseRiskLevel | null;
  risk_summary?: string;
  recommendation?: string;
  decision_note?: string;
};

export type ExpenseState = {
  expenses?: ExpenseItem[];
  selected_expense_id?: string;
  expense_report?: string;
  status?: ExpenseDeskStatus;
  review_summary?: string;
  review_threshold_usd?: number;
  user_id?: string;
};
```

In `apps/web/src/components/chat/agents/registry.ts`, add:

```ts
expense: {
  id: "expense",
  label: "Expense Desk",
  glyph: "$",
  colorVar: "--expense",
  placeholder: "Submit an expense or review the queue...",
  welcome: "Submit an expense with amount, submitter, category, description, and date.",
  artifact: {
    stateField: "expense_report",
    kind: "markdown",
    title: "Expense report",
    name: "expense_report.md",
  },
  suggestions: [
    {
      title: "Travel expense",
      message:
        "Review a $250 travel expense from alice@example.com for a flight to NYC on 2026-06-18.",
    },
    {
      title: "Meal receipt",
      message:
        "Submit a $45.50 meals expense from ben@example.com for a team lunch on 2026-06-18.",
    },
    {
      title: "Summarize queue",
      message: "Write a concise markdown report of the current expense queue by status.",
    },
  ],
},
```

- [ ] **Step 4: Run registry test to verify it passes**

Run: `pnpm --filter web exec vitest run src/components/chat/agents/registry.test.ts`

Expected: PASS.

---

### Task 4: Expense Desk UI

**Files:**

- Create: `apps/web/src/components/chat/expense/expense-desk.tsx`
- Test: `apps/web/src/components/chat/expense/expense-desk.test.tsx`

**Interfaces:**

- Consumes `ExpenseState` from `@agents/types`.
- Produces `<ExpenseDesk state onDecision />`.

- [ ] **Step 1: Write failing UI tests**

Create `apps/web/src/components/chat/expense/expense-desk.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ExpenseState } from "@agents/types";
import { ExpenseDesk } from "./expense-desk";

const state: ExpenseState = {
  status: "needs_approval",
  selected_expense_id: "exp_1",
  expense_report: "## Queue\n- One travel expense needs approval.",
  expenses: [
    {
      id: "exp_1",
      amount: 250,
      submitter: "alice@example.com",
      category: "travel",
      description: "Flight to NYC",
      date: "2026-06-18",
      status: "needs_review",
      risk_level: "medium",
      risk_summary: "Flight is plausible but needs receipt confirmation.",
      recommendation: "approve",
    },
    {
      id: "exp_2",
      amount: 45.5,
      submitter: "ben@example.com",
      category: "meals",
      description: "Team lunch",
      date: "2026-06-18",
      status: "auto_approved",
    },
  ],
};

describe("ExpenseDesk", () => {
  it("renders grouped expenses and selected review details", () => {
    render(<ExpenseDesk state={state} onDecision={vi.fn()} isRunning={false} />);

    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByText("Auto approved")).toBeInTheDocument();
    expect(screen.getByText("Flight to NYC")).toBeInTheDocument();
    expect(screen.getByText(/receipt confirmation/i)).toBeInTheDocument();
    expect(screen.getByText("## Queue")).toBeInTheDocument();
  });

  it("sends approval decisions for the selected expense", async () => {
    const onDecision = vi.fn();
    render(<ExpenseDesk state={state} onDecision={onDecision} isRunning={false} />);

    await userEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(onDecision).toHaveBeenCalledWith("exp_1", "approved");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run src/components/chat/expense/expense-desk.test.tsx`

Expected: FAIL because `expense-desk` does not exist.

- [ ] **Step 3: Implement `ExpenseDesk`**

Create `apps/web/src/components/chat/expense/expense-desk.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import type { ExpenseItem, ExpenseState, ExpenseStatus } from "@agents/types";
import { Button } from "@agents/ui";

type Decision = "approved" | "rejected";

type Props = {
  state: ExpenseState;
  isRunning: boolean;
  onDecision: (expenseId: string, decision: Decision) => void;
};

const GROUPS: { status: ExpenseStatus; label: string }[] = [
  { status: "needs_review", label: "Needs review" },
  { status: "submitted", label: "Submitted" },
  { status: "auto_approved", label: "Auto approved" },
  { status: "approved", label: "Approved" },
  { status: "rejected", label: "Rejected" },
];

function money(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function riskClass(risk: ExpenseItem["risk_level"]) {
  if (risk === "high") return "text-red-400";
  if (risk === "medium") return "text-amber-400";
  if (risk === "low") return "text-emerald-400";
  return "text-muted-foreground";
}

export function ExpenseDesk({ state, isRunning, onDecision }: Props) {
  const expenses = state.expenses ?? [];
  const initialSelected = state.selected_expense_id || expenses[0]?.id || "";
  const [localSelected, setLocalSelected] = useState(initialSelected);
  const selectedId = expenses.some((expense) => expense.id === localSelected)
    ? localSelected
    : initialSelected;
  const selected = expenses.find((expense) => expense.id === selectedId);

  const grouped = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        items: expenses.filter((expense) => expense.status === group.status),
      })),
    [expenses],
  );

  return (
    <div className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)] bg-[#101316] text-[#f4f0e8]">
      <aside className="min-h-0 overflow-y-auto border-r border-white/10 bg-[#151a1e] p-4">
        <div className="mb-4">
          <p className="text-muted-foreground text-xs uppercase tracking-[0.14em]">Expense Desk</p>
          <h2 className="text-lg font-semibold">Review queue</h2>
        </div>
        {expenses.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/15 p-4 text-sm text-[#c7c0b4]">
            Submit an expense in chat to start the queue.
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map((group) =>
              group.items.length ? (
                <section key={group.status} className="space-y-2">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.12em] text-[#9aa7ad]">
                    <span>{group.label}</span>
                    <span>{group.items.length}</span>
                  </div>
                  {group.items.map((expense) => (
                    <button
                      key={expense.id}
                      type="button"
                      onClick={() => setLocalSelected(expense.id)}
                      className={`w-full rounded-md border p-3 text-left transition ${
                        expense.id === selectedId
                          ? "border-[#7ea7ff] bg-[#1f2a36]"
                          : "border-white/10 bg-[#11161a] hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm font-medium">{expense.description}</span>
                        <span className="font-mono text-xs">{money(expense.amount)}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-[#9aa7ad]">
                        <span>{expense.submitter}</span>
                        <span>{expense.category}</span>
                      </div>
                    </button>
                  ))}
                </section>
              ) : null,
            )}
          </div>
        )}
      </aside>
      <main className="grid min-h-0 grid-rows-[minmax(0,1fr)_220px]">
        <section className="min-h-0 overflow-y-auto p-6">
          {selected ? (
            <div className="mx-auto max-w-3xl space-y-5">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-[#9aa7ad]">
                    {selected.category} / {selected.date}
                  </p>
                  <h1 className="mt-1 text-2xl font-semibold">{selected.description}</h1>
                  <p className="mt-1 text-sm text-[#c7c0b4]">{selected.submitter}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-2xl">{money(selected.amount)}</p>
                  <p className="text-xs uppercase tracking-[0.14em] text-[#9aa7ad]">
                    {selected.status.replaceAll("_", " ")}
                  </p>
                </div>
              </div>
              <div className="rounded-md border border-white/10 bg-[#151a1e] p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Risk review</h3>
                  <span
                    className={`text-xs uppercase tracking-[0.14em] ${riskClass(selected.risk_level)}`}
                  >
                    {selected.risk_level ?? "pending"}
                  </span>
                </div>
                <p className="text-sm leading-6 text-[#d8d2c7]">
                  {selected.risk_summary || "No risk review has been written yet."}
                </p>
                {selected.recommendation ? (
                  <p className="mt-3 text-sm text-[#aab6bd]">
                    Recommendation: {selected.recommendation}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  disabled={isRunning}
                  onClick={() => onDecision(selected.id, "approved")}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isRunning}
                  onClick={() => onDecision(selected.id, "rejected")}
                >
                  Reject
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[#c7c0b4]">
              No expense selected.
            </div>
          )}
        </section>
        <section className="min-h-0 overflow-y-auto border-t border-white/10 bg-[#0c0f12] p-4">
          <p className="mb-2 text-xs uppercase tracking-[0.14em] text-[#9aa7ad]">Report</p>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-[#d8d2c7]">
            {state.expense_report || "No report yet."}
          </pre>
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run UI test to verify it passes**

Run: `pnpm --filter web exec vitest run src/components/chat/expense/expense-desk.test.tsx`

Expected: PASS.

---

### Task 5: Expense Workspace and Routes

**Files:**

- Create: `apps/web/src/components/chat/expense-workspace.tsx`
- Create: `apps/web/src/app/console/expense/page.tsx`
- Create: `apps/web/src/app/console/expense/[thread]/layout.tsx`
- Create: `apps/web/src/app/console/expense/[thread]/page.tsx`

**Interfaces:**

- Consumes `<ExpenseDesk />` from Task 4.
- Produces usable `/console/expense/<thread>` route.

- [ ] **Step 1: Add route files and workspace**

Create `apps/web/src/components/chat/expense-workspace.tsx`:

```tsx
"use client";

import { useCallback } from "react";
import { CopilotSidebar, useAgent, useCopilotKit, UseAgentUpdate } from "@copilotkit/react-core/v2";

import type { ExpenseState } from "@agents/types";
import { SidebarInset, SidebarProvider } from "@agents/ui";
import { AppSidebar } from "@/components/chat/app-sidebar";
import { AgentExtensionSlot } from "@/components/chat/agents/extensions";
import { getAgentConfig } from "@/components/chat/agents/registry";
import { useNewThread } from "@/components/chat/use-new-thread";
import { ExpenseDesk } from "@/components/chat/expense/expense-desk";
import { cssVars } from "@/lib/css";

const AGENT_ID = "expense" as const;

export function ExpenseWorkspace() {
  const config = getAgentConfig(AGENT_ID);
  const { agent } = useAgent({
    agentId: AGENT_ID,
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
  });
  const { copilotkit } = useCopilotKit();
  const startNewThread = useNewThread(AGENT_ID);

  const expenseState = (agent?.state ?? {}) as ExpenseState;

  const handleDecision = useCallback(
    async (expenseId: string, decision: "approved" | "rejected") => {
      if (!agent) return;
      agent.addMessage({
        id: crypto.randomUUID(),
        role: "user",
        content: `${decision === "approved" ? "Approve" : "Reject"} expense ${expenseId}.`,
      });
      await copilotkit.runAgent({ agent });
    },
    [agent, copilotkit],
  );

  return (
    <SidebarProvider
      defaultOpen={false}
      className="h-dvh overflow-hidden"
      style={cssVars({ "--page-color": `var(${config.colorVar})` })}
    >
      <AgentExtensionSlot agentId={AGENT_ID} />
      <CopilotSidebar
        defaultOpen={false}
        labels={{
          modalHeaderTitle: "Expense Desk chat",
          chatInputPlaceholder: config.placeholder,
        }}
      />
      <AppSidebar activePath={`/console/${AGENT_ID}`} onNewThread={startNewThread} />
      <SidebarInset className="min-h-0 overflow-hidden">
        <ExpenseDesk
          state={expenseState}
          isRunning={agent?.isRunning ?? false}
          onDecision={handleDecision}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
```

Create `apps/web/src/app/console/expense/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function ExpenseIndexPage() {
  redirect(`/console/expense/${crypto.randomUUID()}`);
}
```

Create `apps/web/src/app/console/expense/[thread]/layout.tsx`:

```tsx
import { type ReactNode } from "react";
import { ConsoleSession } from "@/components/chat/console-session";

export default async function ExpenseThreadLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ thread: string }>;
}) {
  const { thread } = await params;
  return (
    <ConsoleSession agent="expense" thread={thread}>
      {children}
    </ConsoleSession>
  );
}
```

Create `apps/web/src/app/console/expense/[thread]/page.tsx`:

```tsx
import { ExpenseWorkspace } from "@/components/chat/expense-workspace";

export default async function ExpenseThreadPage({
  params,
}: {
  params: Promise<{ thread: string }>;
}) {
  const { thread } = await params;
  return <ExpenseWorkspace key={`expense:${thread}`} />;
}
```

- [ ] **Step 2: Run a targeted TypeScript check or test**

Run: `pnpm --filter web exec vitest run src/components/chat/expense/expense-desk.test.tsx src/components/chat/agents/registry.test.ts`

Expected: PASS.

---

### Task 6: Final Verification

**Files:**

- All files from Tasks 1-5.

- [ ] **Step 1: Run backend tests**

Run: `uv run pytest agents/expense/tests -q`

Expected: PASS.

- [ ] **Step 2: Run targeted web tests**

Run: `pnpm --filter web exec vitest run src/components/chat/agents/registry.test.ts src/components/chat/expense/expense-desk.test.tsx`

Expected: PASS.

- [ ] **Step 3: Run lint/check commands**

Run: `pnpm lint`

Expected: exit 0. If unrelated pre-existing lint failures appear, record the exact failures and run narrower checks that cover changed files.

Run: `pnpm lint:py`

Expected: exit 0. If unrelated pre-existing lint failures appear, record the exact failures and run narrower Ruff checks that cover changed Python files.

- [ ] **Step 4: Audit objective completion**

Verify:

- ADK samples clone exists at `/tmp/adk-samples.iMmn8I`.
- `ambient-expense-agent` selection is documented in the design spec.
- New backend `expense` agent exists and uses `build_model()`.
- Gateway mounts `/expense/agui`.
- Next.js route `/console/expense/[thread]` exists.
- Frontend uses AG-UI/CopilotKit state from `useAgent`.
- Tests prove deterministic tool behavior and core desk UI behavior.
