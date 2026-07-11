package spreadsheet

import (
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	adktool "google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

func New(m model.LLM, toolsets ...adktool.Toolset) (agent.Agent, error) {
	tools, err := spreadsheetTools()
	if err != nil {
		return nil, err
	}
	return llmagent.New(llmagent.Config{Name: AppName, Description: "Spreadsheet creation, editing, and summaries.", Instruction: Instruction, Model: m, Tools: tools, Toolsets: toolsets})
}

func spreadsheetTools() ([]adktool.Tool, error) {
	var result []adktool.Tool
	add := func(value adktool.Tool, err error) error {
		if err != nil {
			return err
		}
		result = append(result, value)
		return nil
	}
	if err := add(functiontool.New(functiontool.Config{Name: "create_sheet", Description: "Create a typed sheet; the first row should be headers."}, CreateSheet)); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "update_sheet", Description: "Replace an existing sheet title and rows."}, UpdateSheet)); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "append_rows", Description: "Append rows to a sheet while preserving order."}, AppendRows)); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "delete_sheet", Description: "Delete a sheet by zero-based index."}, DeleteSheet)); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "set_active_sheet", Description: "Select the active sheet tab by zero-based index."}, SetActiveSheet)); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "write_summary", Description: "Write the workbook markdown summary."}, WriteSummary)); err != nil {
		return nil, err
	}
	return result, nil
}
