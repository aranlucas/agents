package expense

import (
	"github.com/aranlucas/agents/internal/agentruntime"

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
}

func Defaults() ExpenseState {
	return ExpenseState{Expenses: []Expense{}, Status: "idle", ReviewThresholdUSD: DefaultReviewThresholdUSD}
}

func StateDefaults() map[string]any {
	return agentruntime.StateMap(Defaults())
}

func readState(source session.ReadonlyState) ExpenseState {
	state := agentruntime.ReadState(source, Defaults())
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
