package spreadsheet

import (
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
	return llmagent.New(llmagent.Config{
		Name:        AppName,
		Description: "Spreadsheet creation, editing, and summaries.",
		Instruction: Instruction,
		Model:       m,
		Tools:       tools,
		Toolsets:    toolsets,
	})
}

func spreadsheetTools() ([]tool.Tool, error) {
	createSheetTool, err := functiontool.New(functiontool.Config{
		Name:        "create_sheet",
		Description: "Create a typed sheet; the first row should be headers.",
	}, CreateSheet)
	if err != nil {
		return nil, err
	}

	updateSheetTool, err := functiontool.New(functiontool.Config{
		Name:        "update_sheet",
		Description: "Replace an existing sheet title and rows.",
	}, UpdateSheet)
	if err != nil {
		return nil, err
	}

	appendRowsTool, err := functiontool.New(functiontool.Config{
		Name:        "append_rows",
		Description: "Append rows to a sheet while preserving order.",
	}, AppendRows)
	if err != nil {
		return nil, err
	}

	deleteSheetTool, err := functiontool.New(functiontool.Config{
		Name:        "delete_sheet",
		Description: "Delete a sheet by zero-based index.",
	}, DeleteSheet)
	if err != nil {
		return nil, err
	}

	setActiveSheetTool, err := functiontool.New(functiontool.Config{
		Name:        "set_active_sheet",
		Description: "Select the active sheet tab by zero-based index.",
	}, SetActiveSheet)
	if err != nil {
		return nil, err
	}

	writeSummaryTool, err := functiontool.New(functiontool.Config{
		Name:        "write_summary",
		Description: "Write the workbook markdown summary.",
	}, WriteSummary)
	if err != nil {
		return nil, err
	}

	return []tool.Tool{
		createSheetTool,
		updateSheetTool,
		appendRowsTool,
		deleteSheetTool,
		setActiveSheetTool,
		writeSummaryTool,
	}, nil
}
