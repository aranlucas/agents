package presentation

import (
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

func New(m model.LLM, toolsets ...tool.Toolset) (agent.Agent, error) {
	tools, err := presentationTools()
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

func presentationTools() ([]tool.Tool, error) {
	setMetaTool, err := functiontool.New(functiontool.Config{
		Name:        "set_presentation_meta",
		Description: "Set presentation title and theme.",
	}, SetMeta)
	if err != nil {
		return nil, err
	}

	createSlideTool, err := functiontool.New(functiontool.Config{
		Name:        "create_slide",
		Description: "Add a slide to the presentation.",
	}, CreateSlide)
	if err != nil {
		return nil, err
	}

	updateSlideTool, err := functiontool.New(functiontool.Config{
		Name:        "update_slide",
		Description: "Update selected fields of an existing slide.",
	}, UpdateSlide)
	if err != nil {
		return nil, err
	}

	deleteSlideTool, err := functiontool.New(functiontool.Config{
		Name:        "delete_slide",
		Description: "Delete a slide by ID.",
	}, DeleteSlide)
	if err != nil {
		return nil, err
	}

	reorderSlidesTool, err := functiontool.New(functiontool.Config{
		Name:        "reorder_slides",
		Description: "Reorder slides using the explicit list of IDs; unlisted slides are removed.",
	}, ReorderSlides)
	if err != nil {
		return nil, err
	}

	markReadyTool, err := functiontool.New(functiontool.Config{
		Name:        "mark_presentation_ready",
		Description: "Mark the deck ready and record a review summary.",
	}, MarkReady)
	if err != nil {
		return nil, err
	}

	return []tool.Tool{
		setMetaTool,
		createSlideTool,
		updateSlideTool,
		deleteSlideTool,
		reorderSlidesTool,
		markReadyTool,
	}, nil
}
