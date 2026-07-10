package spreadsheet

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
	tools, err := spreadsheetTools()
	if err != nil {
		return nil, err
	}
	return llmagent.New(llmagent.Config{Name: AppName, Description: "Spreadsheet creation, editing, and summaries.", Instruction: Instruction, Model: m, Tools: tools, Toolsets: toolsets})
}
func spreadsheetTools() ([]tool.Tool, error) {
	var tools []tool.Tool
	add := func(value tool.Tool, err error) error {
		if err != nil {
			return err
		}
		tools = append(tools, value)
		return nil
	}
	if err := add(functiontool.New(functiontool.Config{Name: "create_sheet", Description: "Create a typed sheet; the first row should be headers."}, wrap(CreateSheet))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "update_sheet", Description: "Replace an existing sheet title and rows."}, wrap(UpdateSheet))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "append_rows", Description: "Append rows to a sheet while preserving order."}, wrap(AppendRows))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "delete_sheet", Description: "Delete a sheet by zero-based index."}, wrap(DeleteSheet))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "set_active_sheet", Description: "Select the active sheet tab by zero-based index."}, wrap(SetActiveSheet))); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "write_summary", Description: "Write the workbook markdown summary."}, wrap(WriteSummary))); err != nil {
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
				return Result{}, fmt.Errorf("commit spreadsheet state: %w", err)
			}
		}
		return result, nil
	}
}
