package expense

import (
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

func New(m model.LLM, toolsets ...tool.Toolset) (agent.Agent, error) {
	tools, err := expenseTools()
	if err != nil {
		return nil, err
	}
	return llmagent.New(llmagent.Config{
		Name:        AppName,
		Description: "Expense review and approval-desk workflow.",
		Instruction: Instruction,
		Model:       m,
		Tools:       tools,
		Toolsets:    toolsets,
	})
}

func expenseTools() ([]tool.Tool, error) {
	submitExpenseTool, err := functiontool.New(functiontool.Config{
		Name:        "submit_expense",
		Description: "Submit an expense and route it deterministically by threshold.",
	}, SubmitExpense)
	if err != nil {
		return nil, err
	}

	writeExpenseReviewTool, err := functiontool.New(functiontool.Config{
		Name:        "write_expense_review",
		Description: "Write a risk review without making the human decision.",
	}, WriteExpenseReview)
	if err != nil {
		return nil, err
	}

	decideExpenseTool, err := functiontool.New(functiontool.Config{
		Name:        "decide_expense",
		Description: "Record an explicit human approval or rejection.",
	}, DecideExpense)
	if err != nil {
		return nil, err
	}

	setExpenseReportTool, err := functiontool.New(functiontool.Config{
		Name:        "set_expense_report",
		Description: "Write the streamed markdown expense report state.",
	}, SetExpenseReport)
	if err != nil {
		return nil, err
	}

	markReadyTool, err := functiontool.New(functiontool.Config{
		Name:        "mark_expense_ready",
		Description: "Mark the expense desk ready.",
	}, MarkExpenseReady)
	if err != nil {
		return nil, err
	}

	return []tool.Tool{
		submitExpenseTool,
		writeExpenseReviewTool,
		decideExpenseTool,
		setExpenseReportTool,
		markReadyTool,
	}, nil
}
