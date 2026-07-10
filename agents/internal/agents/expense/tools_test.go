package expense

import (
	"context"
	"encoding/json"
	"github.com/aranlucas/agents/agents/internal/agentruntime"
	"testing"
)

func TestSubmitExpenseUsesApprovalThreshold(t *testing.T) {
	tx := newExpenseTx(100)
	below, err := SubmitExpense(context.Background(), tx, SubmitExpenseArgs{Amount: 99, Submitter: "A", Category: "meal", Description: "d", Date: "2026-07-09"})
	if err != nil || !below.OK || below.Status != StatusAutoApproved {
		t.Fatalf("below=%#v,%v", below, err)
	}
	above, err := SubmitExpense(context.Background(), tx, SubmitExpenseArgs{Amount: 100, Submitter: "A", Category: "meal", Description: "d", Date: "2026-07-09"})
	if err != nil || !above.OK || above.Status != StatusNeedsReview {
		t.Fatalf("above=%#v,%v", above, err)
	}
}
func TestReviewCannotDecideExpense(t *testing.T) {
	tx := newExpenseTx(100)
	submitted, _ := SubmitExpense(context.Background(), tx, SubmitExpenseArgs{Amount: 200, Submitter: "A", Category: "travel", Date: "2026-07-09"})
	review, _ := WriteExpenseReview(context.Background(), tx, WriteReviewArgs{ExpenseID: submitted.ExpenseID, RiskLevel: RiskHigh, RiskSummary: "Receipt needed", Recommendation: "reject"})
	expense := decodeState(tx).Expenses[0]
	if !review.OK || expense.Status != StatusNeedsReview || expense.Recommendation != "reject" {
		t.Fatalf("review/expense=%#v/%#v", review, expense)
	}
}
func TestDecisionRequiresReviewableExpenseAndExplicitValue(t *testing.T) {
	tx := newExpenseTx(100)
	auto, _ := SubmitExpense(context.Background(), tx, SubmitExpenseArgs{Amount: 20, Submitter: "A", Category: "meal", Date: "2026-07-09"})
	before := jsonText(tx.Snapshot())
	result, _ := DecideExpense(context.Background(), tx, DecideExpenseArgs{ExpenseID: auto.ExpenseID, Decision: StatusApproved})
	if result.OK || result.Error.Code != "expense_not_reviewable" || jsonText(tx.Snapshot()) != before {
		t.Fatalf("auto decision=%#v", result)
	}
	pending, _ := SubmitExpense(context.Background(), tx, SubmitExpenseArgs{Amount: 120, Submitter: "A", Category: "meal", Date: "2026-07-09"})
	result, _ = DecideExpense(context.Background(), tx, DecideExpenseArgs{ExpenseID: pending.ExpenseID, Decision: StatusApproved, Note: "Receipt attached"})
	state := decodeState(tx)
	if !result.OK || state.Expenses[1].Status != StatusApproved || state.Expenses[1].DecisionNote != "Receipt attached" {
		t.Fatalf("decision/state=%#v/%#v", result, state)
	}
}
func TestExpenseReportIsBoundedStreamTarget(t *testing.T) {
	tx := newExpenseTx(100)
	result, _ := SetExpenseReport(context.Background(), tx, SetReportArgs{Report: "## Review\n- pending", Summary: "One pending"})
	state := decodeState(tx)
	if !result.OK || state.ExpenseReport != "## Review\n- pending" || state.Status != "ready" {
		t.Fatalf("result/state=%#v/%#v", result, state)
	}
}
func newExpenseTx(threshold float64) *agentruntime.Transaction {
	state := StateDefaults()
	state["review_threshold_usd"] = threshold
	return agentruntime.NewTransaction(state)
}
func jsonText(value any) string { data, _ := json.Marshal(value); return string(data) }
