package expense

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"math"
	"strings"
	"time"

	"agents/internal/agentruntime"
	"google.golang.org/adk/v2/agent"
)

type Result struct {
	OK        bool                          `json:"ok"`
	ExpenseID string                        `json:"expense_id,omitempty"`
	Status    ExpenseStatus                 `json:"status,omitempty"`
	Length    int                           `json:"length,omitempty"`
	Error     *agentruntime.StructuredError `json:"error,omitempty"`
}
type SubmitExpenseArgs struct {
	Amount      float64 `json:"amount"`
	Submitter   string  `json:"submitter"`
	Category    string  `json:"category"`
	Description string  `json:"description"`
	Date        string  `json:"date"`
}
type WriteReviewArgs struct {
	ExpenseID      string    `json:"expense_id"`
	RiskLevel      RiskLevel `json:"risk_level"`
	RiskSummary    string    `json:"risk_summary"`
	Recommendation string    `json:"recommendation"`
}
type DecideExpenseArgs struct {
	ExpenseID string        `json:"expense_id"`
	Decision  ExpenseStatus `json:"decision"`
	Note      string        `json:"note"`
}
type SetReportArgs struct {
	Report  string `json:"report"`
	Summary string `json:"summary"`
}
type ReadyArgs struct {
	Summary string `json:"summary"`
}

func SubmitExpense(ctx agent.Context, input SubmitExpenseArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := submitExpense(&state, input)
	if err == nil && result.OK {
		publishState(ctx, state)
	}
	return result, err
}

func submitExpense(state *ExpenseState, input SubmitExpenseArgs) (Result, error) {
	if input.Amount <= 0 || math.IsNaN(input.Amount) || math.IsInf(input.Amount, 0) || input.Amount > 1_000_000_000 {
		return fail("amount_must_be_positive", "amount must be a positive finite value within policy bounds"), nil
	}
	submitter := strings.TrimSpace(input.Submitter)
	if submitter == "" || len(submitter) > 300 {
		return fail("submitter_required", "submitter is required and must be at most 300 characters"), nil
	}
	category := strings.TrimSpace(input.Category)
	if category == "" || len(category) > 200 {
		return fail("category_required", "category is required and must be at most 200 characters"), nil
	}
	if len(input.Description) > 10_000 {
		return fail("description_too_large", "description exceeds the allowed size"), nil
	}
	if _, err := time.Parse(time.DateOnly, input.Date); err != nil {
		return fail("invalid_date", "date must use YYYY-MM-DD"), nil
	}
	if len(state.Expenses) >= 10_000 {
		return fail("expense_limit_reached", "expense desk cannot exceed 10000 entries"), nil
	}
	status := StatusAutoApproved
	if input.Amount >= state.ReviewThresholdUSD {
		status = StatusNeedsReview
	}
	id, err := newExpenseID()
	if err != nil {
		return Result{}, err
	}
	state.Expenses = append(state.Expenses, Expense{ID: id, Amount: input.Amount, Submitter: submitter, Category: category, Description: input.Description, Date: input.Date, Status: status})
	state.SelectedExpenseID = id
	if status == StatusNeedsReview {
		state.Status = "reviewing"
	} else {
		state.Status = "ready"
	}
	return Result{OK: true, ExpenseID: id, Status: status}, nil
}

func WriteExpenseReview(ctx agent.Context, input WriteReviewArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := writeExpenseReview(&state, input)
	if err == nil && result.OK {
		publishState(ctx, state)
	}
	return result, err
}

func writeExpenseReview(state *ExpenseState, input WriteReviewArgs) (Result, error) {
	if input.RiskLevel != RiskLow && input.RiskLevel != RiskMedium && input.RiskLevel != RiskHigh {
		return fail("invalid_risk_level", "risk_level must be low, medium, or high"), nil
	}
	if len(input.RiskSummary) > 10_000 || len(input.Recommendation) > 5000 {
		return fail("review_too_large", "risk review exceeds the allowed size"), nil
	}
	index := expenseIndex(state.Expenses, input.ExpenseID)
	if index < 0 {
		return fail("expense_not_found", "expense was not found"), nil
	}
	if state.Expenses[index].Status != StatusNeedsReview {
		return fail("expense_not_reviewable", "only expenses needing review can receive a risk review"), nil
	}
	risk := input.RiskLevel
	state.Expenses[index].RiskLevel = &risk
	state.Expenses[index].RiskSummary = input.RiskSummary
	state.Expenses[index].Recommendation = input.Recommendation
	state.SelectedExpenseID = input.ExpenseID
	state.Status = "needs_approval"
	state.ReviewSummary = input.RiskSummary
	return Result{OK: true, ExpenseID: input.ExpenseID}, nil
}

func DecideExpense(ctx agent.Context, input DecideExpenseArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := decideExpense(&state, input)
	if err == nil && result.OK {
		publishState(ctx, state)
	}
	return result, err
}

func decideExpense(state *ExpenseState, input DecideExpenseArgs) (Result, error) {
	if input.Decision != StatusApproved && input.Decision != StatusRejected {
		return fail("invalid_decision", "decision must be approved or rejected"), nil
	}
	if len(input.Note) > 10_000 {
		return fail("decision_note_too_large", "decision note exceeds the allowed size"), nil
	}
	index := expenseIndex(state.Expenses, input.ExpenseID)
	if index < 0 {
		return fail("expense_not_found", "expense was not found"), nil
	}
	if state.Expenses[index].Status != StatusNeedsReview {
		return fail("expense_not_reviewable", "only an expense needing review can be decided"), nil
	}
	state.Expenses[index].Status = input.Decision
	state.Expenses[index].DecisionNote = input.Note
	state.SelectedExpenseID = input.ExpenseID
	state.Status = "ready"
	state.ReviewSummary = input.Note
	return Result{OK: true, ExpenseID: input.ExpenseID, Status: input.Decision}, nil
}

func SetExpenseReport(ctx agent.Context, input SetReportArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := setExpenseReport(&state, input)
	if err == nil && result.OK {
		publishState(ctx, state)
	}
	return result, err
}

func setExpenseReport(state *ExpenseState, input SetReportArgs) (Result, error) {
	if len(input.Report) > 1<<20 || len(input.Summary) > 10_000 {
		return fail("report_too_large", "expense report or summary exceeds the allowed size"), nil
	}
	state.ExpenseReport = input.Report
	state.ReviewSummary = input.Summary
	state.Status = "ready"
	return Result{OK: true, Length: len(input.Report)}, nil
}

func MarkExpenseReady(ctx agent.Context, input ReadyArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := markExpenseReady(&state, input)
	if err == nil && result.OK {
		publishState(ctx, state)
	}
	return result, err
}

func markExpenseReady(state *ExpenseState, input ReadyArgs) (Result, error) {
	if len(input.Summary) > 10_000 {
		return fail("summary_too_large", "review summary exceeds the allowed size"), nil
	}
	state.Status = "ready"
	state.ReviewSummary = input.Summary
	return Result{OK: true}, nil
}

func expenseIndex(expenses []Expense, id string) int {
	for index, item := range expenses {
		if item.ID == id {
			return index
		}
	}
	return -1
}

func fail(code, message string) Result {
	return Result{Error: &agentruntime.StructuredError{Code: code, Message: message}}
}

func newExpenseID() (string, error) {
	var data [4]byte
	if _, err := rand.Read(data[:]); err != nil {
		return "", errors.New("generate expense ID")
	}
	return "exp_" + hex.EncodeToString(data[:]), nil
}
