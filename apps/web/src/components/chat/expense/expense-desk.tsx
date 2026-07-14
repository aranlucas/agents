"use client";

import { useMemo, useState } from "react";

import type { ExpenseItem, ExpenseState, ExpenseStatus } from "@agents/types";
import { Button } from "@agents/ui";

type Decision = "approved" | "rejected";

type ExpenseDeskProps = {
  state: ExpenseState;
  isRunning: boolean;
  onDecision: (expenseId: string, decision: Decision) => void;
  onPrompt?: (message: string) => void;
};

const GROUPS: { status: ExpenseStatus; label: string }[] = [
  { status: "needs_review", label: "Needs review" },
  { status: "submitted", label: "Submitted" },
  { status: "auto_approved", label: "Auto approved" },
  { status: "approved", label: "Approved" },
  { status: "rejected", label: "Rejected" },
];

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(amount);
}

function riskClass(risk: ExpenseItem["risk_level"]) {
  if (risk === "high") return "text-red-400";
  if (risk === "medium") return "text-amber-400";
  if (risk === "low") return "text-emerald-400";
  return "text-zinc-400";
}

function statusLabel(status: ExpenseStatus) {
  return status.replaceAll("_", " ");
}

function ReportLines({ report }: { report: string | undefined }) {
  if (!report?.trim()) return <p>No report yet.</p>;
  return report.split("\n").map((line) => (
    <p key={line} className={line.startsWith("## ") ? "font-semibold" : undefined}>
      {line}
    </p>
  ));
}

export function ExpenseDesk({ state, isRunning, onDecision, onPrompt }: ExpenseDeskProps) {
  const expenses = useMemo(() => state.expenses ?? [], [state.expenses]);
  const initialSelected = state.selected_expense_id ?? expenses[0]?.id ?? "";
  const [localSelected, setLocalSelected] = useState(initialSelected);
  const selectedId = expenses.some((expense) => expense.id === localSelected)
    ? localSelected
    : initialSelected;
  const selected = expenses.find((expense) => expense.id === selectedId);

  const grouped = useMemo(
    () =>
      GROUPS.map((group) =>
        Object.assign(group, {
          items: expenses.filter((expense) => expense.status === group.status),
        }),
      ),
    [expenses],
  );

  return (
    <div className="grid h-full min-h-0 grid-cols-4 bg-zinc-950 text-zinc-100">
      <aside className="col-span-1 min-h-0 overflow-y-auto border-e border-white/10 bg-zinc-900 p-4">
        <div className="mb-4">
          <p className="text-xs tracking-widest text-zinc-400 uppercase">Expense Desk</p>
          <h2 className="text-lg font-semibold">Review queue</h2>
        </div>
        {expenses.length === 0 ? (
          <div className="flex flex-col gap-3 rounded-md border border-dashed border-white/15 p-4 text-sm text-zinc-300">
            <p>Submit an expense in chat to start the queue.</p>
            {onPrompt ? (
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isRunning}
                  className="w-full justify-start"
                  onClick={() =>
                    onPrompt(
                      "Review a $250 travel expense from alice@example.com for a flight to NYC on 2026-06-18.",
                    )
                  }
                >
                  Seed travel expense
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isRunning}
                  className="w-full justify-start"
                  onClick={() =>
                    onPrompt(
                      "Submit a $45.50 meals expense from ben@example.com for a team lunch on 2026-06-18.",
                    )
                  }
                >
                  Seed meal receipt
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {grouped.map((group) =>
              group.items.length ? (
                <section key={group.status} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs tracking-widest text-zinc-400 uppercase">
                    <span>{group.label}</span>
                    <span>{group.items.length}</span>
                  </div>
                  {group.items.map((expense) => (
                    <button
                      key={expense.id}
                      type="button"
                      aria-label={`Select ${expense.description}`}
                      onClick={() => setLocalSelected(expense.id)}
                      className={`w-full rounded-md border p-3 text-left transition ${
                        expense.id === selectedId
                          ? "border-blue-400 bg-zinc-800"
                          : "border-white/10 bg-zinc-900 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm font-medium">
                          {expense.category} / {expense.description}
                        </span>
                        <span className="font-mono text-xs">{formatMoney(expense.amount)}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-zinc-400">
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
      <main className="col-span-3 flex min-h-0 flex-col">
        <section className="min-h-0 flex-1 overflow-y-auto p-6">
          {selected ? (
            <div className="mx-auto flex max-w-3xl flex-col gap-5">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <p className="text-xs tracking-widest text-zinc-400 uppercase">
                    {selected.category} / {selected.date}
                  </p>
                  <h1 className="mt-1 text-2xl font-semibold">{selected.description}</h1>
                  <p className="mt-1 text-sm text-zinc-300">{selected.submitter}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-2xl">{formatMoney(selected.amount)}</p>
                  <p className="text-xs tracking-widest text-zinc-400 uppercase">
                    {statusLabel(selected.status)}
                  </p>
                </div>
              </div>
              <div className="rounded-md border border-white/10 bg-zinc-900 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Risk review</h3>
                  <span
                    className={`text-xs tracking-widest uppercase ${riskClass(selected.risk_level)}`}
                  >
                    {selected.risk_level ?? "pending"}
                  </span>
                </div>
                <p className="text-sm leading-6 text-zinc-300">
                  {selected.risk_summary?.trim()
                    ? selected.risk_summary
                    : "No risk review has been written yet."}
                </p>
                {selected.recommendation ? (
                  <p className="mt-3 text-sm text-zinc-400">
                    Recommendation: {selected.recommendation}
                  </p>
                ) : null}
              </div>
              {selected.status === "needs_review" ? (
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
              ) : null}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-zinc-300">
              No expense selected.
            </div>
          )}
        </section>
        <section className="h-56 shrink-0 overflow-y-auto border-t border-white/10 bg-black p-4">
          <p className="mb-2 text-xs tracking-widest text-zinc-400 uppercase">Report</p>
          <div className="flex flex-col gap-1 text-sm leading-6 whitespace-pre-wrap text-zinc-300">
            <ReportLines report={state.expense_report} />
          </div>
        </section>
      </main>
    </div>
  );
}
