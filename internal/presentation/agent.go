package presentation

import (
	"github.com/aranlucas/agents/internal/bravesearch"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

func New(m model.LLM, search *bravesearch.Client, toolsets ...tool.Toolset) (agent.Agent, error) {
	tools, err := presentationTools(search)
	if err != nil {
		return nil, err
	}
	return llmagent.New(llmagent.Config{
		Name:        AppName,
		Description: "Presentation outline and slide authoring.",
		Instruction: Instruction,
		Model:       m,
		Tools:       tools,
		Toolsets:    toolsets,
	})
}

func presentationTools(search *bravesearch.Client) ([]tool.Tool, error) {
	buildPresentationTool, err := functiontool.New(functiontool.Config{
		Name:        "build_presentation",
		Description: "Create or replace the complete presentation in one ordered slides array.",
	}, BuildPresentation)
	if err != nil {
		return nil, err
	}

	revisePresentationTool, err := functiontool.New(functiontool.Config{
		Name:        "revise_presentation",
		Description: "Atomically revise an existing presentation with arrays of slide updates, deletions, and an optional complete slide order.",
	}, RevisePresentation)
	if err != nil {
		return nil, err
	}

	result := []tool.Tool{
		buildPresentationTool,
		revisePresentationTool,
	}
	if search != nil {
		webSearchTool, err := search.SearchTool("Search current public web results with the limited Brave budget.")
		if err != nil {
			return nil, err
		}
		result = append(result, webSearchTool)
	}
	return result, nil
}
