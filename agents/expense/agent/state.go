package expense

import (
	"encoding/json"
	"fmt"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/session"
)

const (
	AppName                   = "expense_desk_agent"
	DefaultReviewThresholdUSD = 100.0
)

type ExpenseStatus string

const (
	StatusSubmitted    ExpenseStatus = "submitted"
	StatusAutoApproved ExpenseStatus = "auto_approved"
	StatusNeedsReview  ExpenseStatus = "needs_review"
	StatusApproved     ExpenseStatus = "approved"
	StatusRejected     ExpenseStatus = "rejected"
)

type RiskLevel string

const (
	RiskLow    RiskLevel = "low"
	RiskMedium RiskLevel = "medium"
	RiskHigh   RiskLevel = "high"
)

type Expense struct {
	ID             string        `json:"id"`
	Amount         float64       `json:"amount"`
	Submitter      string        `json:"submitter"`
	Category       string        `json:"category"`
	Description    string        `json:"description"`
	Date           string        `json:"date"`
	Status         ExpenseStatus `json:"status"`
	RiskLevel      *RiskLevel    `json:"risk_level,omitempty"`
	RiskSummary    string        `json:"risk_summary"`
	Recommendation string        `json:"recommendation"`
	DecisionNote   string        `json:"decision_note"`
}
type ExpenseState struct {
	Expenses           []Expense `json:"expenses"`
	SelectedExpenseID  string    `json:"selected_expense_id"`
	ExpenseReport      string    `json:"expense_report"`
	Status             string    `json:"status"`
	ReviewSummary      string    `json:"review_summary"`
	ReviewThresholdUSD float64   `json:"review_threshold_usd"`
	UserID             string    `json:"user_id"`
}

func Defaults() ExpenseState {
	return ExpenseState{Expenses: []Expense{}, Status: "idle", ReviewThresholdUSD: DefaultReviewThresholdUSD}
}

func StateDefaults() map[string]any {
	encoded, _ := json.Marshal(Defaults())
	var values map[string]any
	_ = json.Unmarshal(encoded, &values)
	return values
}

func readState(source session.ReadonlyState) ExpenseState {
	state := Defaults()
	values := make(map[string]any)
	if source != nil {
		for key, value := range source.All() {
			values[key] = value
		}
	}
	encoded, err := json.Marshal(values)
	if err == nil {
		_ = json.Unmarshal(encoded, &state)
	}
	if state.Expenses == nil {
		state.Expenses = []Expense{}
	}
	if state.Status == "" {
		state.Status = "idle"
	}
	if state.ReviewThresholdUSD <= 0 {
		state.ReviewThresholdUSD = DefaultReviewThresholdUSD
	}
	return state
}

func publishState(ctx agent.Context, state ExpenseState) error {
	s := ctx.State()
	fields := []struct {
		key   string
		value any
	}{
		{"expenses", state.Expenses},
		{"selected_expense_id", state.SelectedExpenseID},
		{"expense_report", state.ExpenseReport},
		{"status", state.Status},
		{"review_summary", state.ReviewSummary},
		{"review_threshold_usd", state.ReviewThresholdUSD},
		{"user_id", state.UserID},
	}
	for _, field := range fields {
		if err := s.Set(field.key, field.value); err != nil {
			return fmt.Errorf("set %s: %w", field.key, err)
		}
	}
	return nil
}
