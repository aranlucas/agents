package research

import (
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	adktool "google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

func New(m model.LLM, toolsets ...adktool.Toolset) (agent.Agent, error) {
	tools, err := researchTools()
	if err != nil {
		return nil, err
	}
	return llmagent.New(llmagent.Config{
		Name:        AppName,
		Description: "Research canvas, sources, sections, and reports.",
		Instruction: Instruction,
		Model:       m,
		Tools:       tools,
		Toolsets:    toolsets,
	})
}

func researchTools() ([]adktool.Tool, error) {
	setQueryTool, err := functiontool.New(functiontool.Config{
		Name:        "set_research_query",
		Description: "Set the report title and research query.",
	}, SetQuery)
	if err != nil {
		return nil, err
	}

	createSectionTool, err := functiontool.New(functiontool.Config{
		Name:        "create_section",
		Description: "Append a report section and rebuild ordered markdown.",
	}, CreateSection)
	if err != nil {
		return nil, err
	}

	updateSectionTool, err := functiontool.New(functiontool.Config{
		Name:        "update_section",
		Description: "Update section content by ID and rebuild ordered markdown.",
	}, UpdateSection)
	if err != nil {
		return nil, err
	}

	addSourceTool, err := functiontool.New(functiontool.Config{
		Name:        "add_source",
		Description: "Append a validated HTTPS citation source.",
	}, AddSource)
	if err != nil {
		return nil, err
	}

	writeReportTool, err := functiontool.New(functiontool.Config{
		Name:        "write_report",
		Description: "Replace the complete markdown report.",
	}, WriteReport)
	if err != nil {
		return nil, err
	}

	markReadyTool, err := functiontool.New(functiontool.Config{
		Name:        "mark_research_ready",
		Description: "Mark the report ready and record its review summary.",
	}, MarkReady)
	if err != nil {
		return nil, err
	}

	return []adktool.Tool{
		setQueryTool,
		createSectionTool,
		updateSectionTool,
		addSourceTool,
		writeReportTool,
		markReadyTool,
	}, nil
}
