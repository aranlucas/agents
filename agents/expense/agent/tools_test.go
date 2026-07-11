package expense

import (
	"encoding/json"
	"testing"
)

func TestSubmitExpenseUsesApprovalThreshold(t *testing.T) {
	state := newExpenseState(100)
	below, err := submitExpense(&state, SubmitExpenseArgs{Amount: 99, Submitter: "A", Category: "meal", Description: "d", Date: "2026-07-09"})
	if err != nil || !below.OK || below.Status != StatusAutoApproved {
		t.Fatalf("below=%#v,%v", below, err)
	}
	above, err := submitExpense(&state, SubmitExpenseArgs{Amount: 100, Submitter: "A", Category: "meal", Description: "d", Date: "2026-07-09"})
	if err != nil || !above.OK || above.Status != StatusNeedsReview {
		t.Fatalf("above=%#v,%v", above, err)
	}
}

func TestReviewCannotDecideExpense(t *testing.T) {
	state := newExpenseState(100)
	submitted, _ := submitExpense(&state, SubmitExpenseArgs{Amount: 200, Submitter: "A", Category: "travel", Date: "2026-07-09"})
	review, _ := writeExpenseReview(&state, WriteReviewArgs{ExpenseID: submitted.ExpenseID, RiskLevel: RiskHigh, RiskSummary: "Receipt needed", Recommendation: "reject"})
	expense := state.Expenses[0]
	if !review.OK || expense.Status != StatusNeedsReview || expense.Recommendation != "reject" {
		t.Fatalf("review/expense=%#v/%#v", review, expense)
	}
}

func TestDecisionRequiresReviewableExpenseAndExplicitValue(t *testing.T) {
	state := newExpenseState(100)
	auto, _ := submitExpense(&state, SubmitExpenseArgs{Amount: 20, Submitter: "A", Category: "meal", Date: "2026-07-09"})
	before := jsonText(state)
	result, _ := decideExpense(&state, DecideExpenseArgs{ExpenseID: auto.ExpenseID, Decision: StatusApproved})
	if result.OK || result.Error.Code != "expense_not_reviewable" || jsonText(state) != before {
		t.Fatalf("auto decision=%#v", result)
	}
	pending, _ := submitExpense(&state, SubmitExpenseArgs{Amount: 120, Submitter: "A", Category: "meal", Date: "2026-07-09"})
	result, _ = decideExpense(&state, DecideExpenseArgs{ExpenseID: pending.ExpenseID, Decision: StatusApproved, Note: "Receipt attached"})
	if !result.OK || state.Expenses[1].Status != StatusApproved || state.Expenses[1].DecisionNote != "Receipt attached" {
		t.Fatalf("decision/state=%#v/%#v", result, state)
	}
}

func TestExpenseReportIsBoundedStreamTarget(t *testing.T) {
	state := newExpenseState(100)
	result, _ := setExpenseReport(&state, SetReportArgs{Report: "## Review\n- pending", Summary: "One pending"})
	if !result.OK || state.ExpenseReport != "## Review\n- pending" || state.Status != "ready" {
		t.Fatalf("result/state=%#v/%#v", result, state)
	}
}

func newExpenseState(threshold float64) ExpenseState {
	state := Defaults()
	state.ReviewThresholdUSD = threshold
	return state
}
func jsonText(value any) string { data, _ := json.Marshal(value); return string(data) }
