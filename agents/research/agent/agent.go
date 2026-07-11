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
	return llmagent.New(llmagent.Config{Name: AppName, Description: "Research canvas, sources, sections, and reports.", Instruction: Instruction, Model: m, Tools: tools, Toolsets: toolsets})
}

func researchTools() ([]adktool.Tool, error) {
	var result []adktool.Tool
	add := func(value adktool.Tool, err error) error {
		if err != nil {
			return err
		}
		result = append(result, value)
		return nil
	}
	if err := add(functiontool.New(functiontool.Config{Name: "set_research_query", Description: "Set the report title and research query."}, SetQuery)); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "create_section", Description: "Append a report section and rebuild ordered markdown."}, CreateSection)); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "update_section", Description: "Update section content by ID and rebuild ordered markdown."}, UpdateSection)); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "add_source", Description: "Append a validated HTTPS citation source."}, AddSource)); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "write_report", Description: "Replace the complete markdown report."}, WriteReport)); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "mark_research_ready", Description: "Mark the report ready and record its review summary."}, MarkReady)); err != nil {
		return nil, err
	}
	return result, nil
}
