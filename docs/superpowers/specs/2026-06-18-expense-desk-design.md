# Expense Desk AG-UI Frontend Design

**Date:** 2026-06-18
**Status:** Approved by continuation

## Background

The goal is to choose a finance or personal-automation example from
`google/adk-samples/python/agents`, clone it for review, and build an AG-UI +
Next.js frontend around it using LiteLLM where practical.

The samples repo was cloned to `/tmp/adk-samples.iMmn8I`. The most relevant
samples reviewed were:

- `ambient-expense-agent` — event-driven expense review with deterministic
  amount routing, LLM risk review, and human approval.
- `financial-advisor` — multi-agent stock-analysis workflow using Google Search.
- `small-business-loan-agent` — advanced loan workflow with PDF extraction,
  Firestore repair/resume, and HITL.
- `economic-research-agent` and `invoice-processing` — useful domain ideas but
  heavier setup or less direct fit for this console.

`ambient-expense-agent` is the best fit for this repo. It has finance relevance,
personal automation value, deterministic workflow boundaries, and a natural
AG-UI surface: an expense desk where the user submits or reviews expense items,
sees triage state, and approves or rejects high-value expenses.

## Goals

- Add a new `expense` agent to the existing pnpm/uv monorepo.
- Adapt the ambient expense sample's core pattern:
  deterministic business routing first, LLM risk review only when needed, and
  explicit human approval for sensitive decisions.
- Use the repo's existing `LiteLlm` helper, `ag-ui-adk`, gateway registration,
  and CopilotKit v2 console patterns.
- Create a useful Next.js AG-UI frontend for expense review rather than a plain
  chat-only demo.
- Keep state as the source of truth. The agent writes expense data, review
  notes, decisions, and summaries into ADK shared state through tools.
- Avoid the sample's standalone Pub/Sub, Cloud Run frontend, Terraform, and IAP
  paths. Those are useful production learnings but do not match this monorepo's
  single gateway + Next.js console architecture.

## Non-goals

- No real reimbursement, payment, accounting, email, or Pub/Sub integration.
- No deployment changes to Railway, Vercel, or EAS.
- No new external OAuth provider.
- No financial advice, securities analysis, or loan decisioning.
- No changes to existing agents beyond shared registry/gateway wiring.

## Architecture

### Backend agent

Create `agents/expense/src/expense_agent/` with the same shape as existing
agents:

- `agent.py` owns state models, deterministic tools, and `build_agent()`.
- `main.py` registers `/expense/agui` and `/expense/health` through
  `agents_shared.app_factory.add_agent_routes`.
- Tests live in `agents/expense/tests/`.

The agent is a `google.adk.agents.LlmAgent` using `agents_shared.tools.build_model()`
so LiteLLM model fallback behavior matches the rest of the repo.

The agent does not paste expense outputs into chat as the primary artifact.
Instead it calls state tools:

- `submit_expense(...)` creates an expense item and stores it in
  `state["expenses"]`.
- `write_expense_review(...)` stores LLM risk analysis for a submitted expense.
- `decide_expense(...)` records an approval/rejection decision.
- `set_expense_report(...)` streams a markdown summary into
  `state["expense_report"]`.
- `mark_expense_ready(...)` marks the desk as ready once review work is done.

Deterministic routing lives in Python. Expenses below the review threshold are
auto-approved by `submit_expense`. Expenses at or above the threshold become
`needs_review`; the agent must write a risk review before proposing a final
decision.

### Shared state

Add `ExpenseState` to `packages/types/src/index.ts` and mirror it in Pydantic:

- `expenses: ExpenseItem[]`
- `selected_expense_id: string`
- `expense_report: string`
- `status: "idle" | "reviewing" | "needs_approval" | "ready"`
- `review_summary: string`
- `review_threshold_usd: number`

`ExpenseItem` includes:

- `id`
- `amount`
- `submitter`
- `category`
- `description`
- `date`
- `status: "submitted" | "auto_approved" | "needs_review" | "approved" | "rejected"`
- `risk_level?: "low" | "medium" | "high"`
- `risk_summary?: string`
- `decision_note?: string`

### Frontend

Register `expense` in `packages/types` and
`apps/web/src/components/chat/agents/registry.ts`.

The route mirrors existing agents:

- `apps/web/src/app/console/expense/page.tsx`
- `apps/web/src/app/console/expense/[thread]/layout.tsx`
- `apps/web/src/app/console/expense/[thread]/page.tsx`

The page renders a bespoke `ExpenseWorkspace` rather than the generic
`AgentWorkspace`, because the primary surface is a structured review desk, not
one markdown artifact.

`ExpenseWorkspace` uses the existing `SidebarProvider`, `AppSidebar`, and
`CopilotSidebar` primitives. The route owns a direct `<CopilotKit>` provider for
the `expense` agent so unrelated agent extensions do not enter this focused desk
bundle. It subscribes to
`useAgent({ agentId: "expense", updates: [OnStateChanged, OnRunStatusChanged] })`
and renders `ExpenseDesk`.

`ExpenseDesk` is a dense operational UI:

- left column: expense list grouped by review status.
- main panel: selected expense details, risk review, and decision controls.
- right rail or lower section: markdown expense report.
- quick-start actions seed realistic prompts such as "Review this $250 travel
  expense from alice@company.com for a flight to NYC."

Visual direction: quiet finance operations desk, not a marketing page. The
palette should use restrained ledger-inspired neutrals with stateful accents:
green for approved, amber for review, red for rejected, and a single ink/blue
accent for the active selection. Cards stay compact with <= 8px radius.

### Human approval

For this first version, approval is represented as an explicit AG-UI frontend
action in the desk:

1. User selects a high-value item.
2. User clicks Approve or Reject.
3. The frontend sends a user message to the agent with the selected expense id,
   decision, and note.
4. The agent calls `decide_expense(...)`, updating shared state.

This avoids forcing the ADK graph `RequestInput` sample architecture into the
current CopilotKit route. The sample's HITL lesson is preserved: final decisions
are explicit human actions, not silent LLM conclusions.

## Data Flow

1. User starts from `/console/expense`.
2. The route creates a thread id and mounts `<CopilotKit agent="expense">`.
3. The user submits an expense through chat or a quick action.
4. The agent calls `submit_expense`.
5. If amount is below threshold, state changes to `auto_approved`.
6. If amount is at or above threshold, state changes to `needs_review`, then the
   agent calls `write_expense_review`.
7. The desk renders the selected expense and review.
8. User approves/rejects from the UI.
9. The agent records the decision with `decide_expense` and updates
   `expense_report`.

## Error Handling

- Invalid amounts, dates, or missing submitters return tool errors and do not
  mutate state.
- Unknown expense ids return `{"ok": false, "error": "expense_not_found"}`.
- Frontend empty state offers quick-start prompts instead of instructional copy.
- If no agent state is available yet, the desk renders an empty review queue and
  keeps chat usable.

## Testing

Backend:

- Unit-test deterministic tools without calling an LLM:
  - low-value expenses auto-approve.
  - high-value expenses require review.
  - review writes risk fields.
  - decisions update status and decision note.
  - report writes markdown and status.
- Test gateway/registry imports enough to catch missing package wiring.

Frontend:

- Test `ExpenseDesk` selection and status grouping.
- Test approval/rejection callbacks send the expected prompt through a passed
  callback prop.
- Update registry tests to include `expense`.
- Keep tests focused on deterministic UI/state behavior, not model text.

Verification:

- `uv run pytest agents/expense/tests`
- relevant web vitest files.
- `pnpm --filter web lint` or the closest available targeted check.
- `pnpm --filter @agents/types check` if available, otherwise `pnpm check`
  if the incremental checks do not cover changed TypeScript.

## Implementation Notes

- Add `agents/expense/src/expense_agent` to
  `[tool.hatch.build.targets.wheel].packages` in `pyproject.toml`.
- Add `agents/expense/tests` to the existing pytest discovery tree by placing it
  under `agents/`.
- Register `register_expense` in `agents/gateway/src/gateway/main.py`.
- Keep `review_threshold_usd` default at `100`, matching the sample.
- Use `PredictStateMapping` for `expense_report` via `set_expense_report.report`
  so the report can stream into the UI.
- Do not add per-agent `pyproject.toml` files.

## Spec Self-Review

- Placeholder scan: no TBD/TODO placeholders.
- Scope check: one backend agent plus one frontend workspace; no deployment or
  real accounting integration.
- Consistency check: agent id is `expense`, backend path is `expense`, shared
  state key for the markdown artifact is `expense_report`.
- Ambiguity check: human approval is implemented as an explicit UI-driven
  message-to-agent flow for this version, not ADK graph `RequestInput`.
