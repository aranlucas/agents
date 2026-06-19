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
