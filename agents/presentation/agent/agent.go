package presentation

import (
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	adktool "google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

func New(m model.LLM, toolsets ...adktool.Toolset) (agent.Agent, error) {
	tools, err := presentationTools()
	if err != nil {
		return nil, err
	}
	return llmagent.New(llmagent.Config{Name: AppName, Description: "Presentation outline and slide authoring.", Instruction: Instruction, Model: m, Tools: tools, Toolsets: toolsets})
}

func presentationTools() ([]adktool.Tool, error) {
	var result []adktool.Tool
	add := func(value adktool.Tool, err error) error {
		if err != nil {
			return err
		}
		result = append(result, value)
		return nil
	}
	if err := add(functiontool.New(functiontool.Config{Name: "set_presentation_meta", Description: "Set presentation title and theme."}, SetMeta)); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "create_slide", Description: "Add a slide to the presentation."}, CreateSlide)); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "update_slide", Description: "Update selected fields of an existing slide."}, UpdateSlide)); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "delete_slide", Description: "Delete a slide by ID."}, DeleteSlide)); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "reorder_slides", Description: "Reorder slides using the explicit list of IDs; unlisted slides are removed."}, ReorderSlides)); err != nil {
		return nil, err
	}
	if err := add(functiontool.New(functiontool.Config{Name: "mark_presentation_ready", Description: "Mark the deck ready and record a review summary."}, MarkReady)); err != nil {
		return nil, err
	}
	return result, nil
}
