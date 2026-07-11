package expense

import (
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	adktool "google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

func New(m model.LLM, toolsets ...adktool.Toolset) (agent.Agent, error) {
	tools, err := expenseTools()
	if err != nil {
		return nil, err
	}
	return llmagent.New(llmagent.Config{Name: AppName, Description: "Expense review and approval-desk workflow.", Instruction: Instruction, Model: m, Tools: tools, Toolsets: toolsets})
}

func expenseTools() ([]adktool.Tool, error) {
	var result []adktool.Tool
	add := func(value adktool.Tool, err error) error {
		if err != nil {
			return err
		}
		result = append(result, value)
		return nil
	}
	if err := add(functiontool.New(functiontool.Config{Name: "submit_expense", Description: "Submit an expense and route it deterministically by threshold."}, SubmitExpense)); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "write_expense_review", Description: "Write a risk review without making the human decision."}, WriteExpenseReview)); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "decide_expense", Description: "Record an explicit human approval or rejection."}, DecideExpense)); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "set_expense_report", Description: "Write the streamed markdown expense report state."}, SetExpenseReport)); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "mark_expense_ready", Description: "Mark the expense desk ready."}, MarkExpenseReady)); err != nil {
		return nil, err
	}
	return result, nil
}
