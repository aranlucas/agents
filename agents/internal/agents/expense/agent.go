package expense

import (
	"context"
	"fmt"
	"github.com/aranlucas/agents/agents/internal/agentruntime"
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
	return llmagent.New(llmagent.Config{Name: AppName, Description: "Expense review and approval-desk workflow.", Instruction: Instruction, Model: m, Tools: tools, Toolsets: toolsets})
}
func expenseTools() ([]tool.Tool, error) {
	var tools []tool.Tool
	add := func(value tool.Tool, err error) error {
		if err != nil {
			return err
		}
		tools = append(tools, value)
		return nil
	}
	if err := add(functiontool.New(functiontool.Config{Name: "submit_expense", Description: "Submit an expense and route it deterministically by threshold."}, wrap(SubmitExpense))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "write_expense_review", Description: "Write a risk review without making the human decision."}, wrap(WriteExpenseReview))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "decide_expense", Description: "Record an explicit human approval or rejection."}, wrap(DecideExpense))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "set_expense_report", Description: "Write the streamed markdown expense report state."}, wrap(SetExpenseReport))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "mark_expense_ready", Description: "Mark the expense desk ready."}, wrap(MarkExpenseReady))); err != nil {
		return nil, err
	}
	return tools, nil
}

type handler[A any] func(context.Context, *agentruntime.Transaction, A) (Result, error)

func wrap[A any](handler handler[A]) functiontool.Func[A, Result] {
	return func(ctx agent.Context, input A) (Result, error) {
		tx := agentruntime.NewTransactionFromState(ctx.State())
		result, err := handler(ctx, tx, input)
		if err != nil {
			return Result{}, err
		}
		if result.OK {
			if err := agentruntime.Commit(ctx, tx); err != nil {
				return Result{}, fmt.Errorf("commit expense state: %w", err)
			}
		}
		return result, nil
	}
}
