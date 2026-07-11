package travel

import (
	"fmt"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	adktool "google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

func New(m model.LLM, toolsets ...adktool.Toolset) (agent.Agent, error) {
	tools, err := travelTools()
	if err != nil {
		return nil, err
	}
	return llmagent.New(llmagent.Config{Name: AppName, Description: "Trip planning, itinerary drafting, and booking readiness.", Instruction: Instruction, Model: m, Tools: tools, Toolsets: toolsets})
}

func travelTools() ([]adktool.Tool, error) {
	var result []adktool.Tool
	add := func(value adktool.Tool, err error) error {
		if err != nil {
			return err
		}
		result = append(result, value)
		return nil
	}
	definitions := []struct {
		name, description string
		build             func() (adktool.Tool, error)
	}{
		{"set_trip_meta", "Set validated destination, dates, party size, and budget before drafting.", func() (adktool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "set_trip_meta", Description: "Set validated destination, dates, party size, and budget before drafting."}, SetTripMeta)
		}},
		{"write_itinerary", "Replace the structured itinerary and optional flights state.", func() (adktool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "write_itinerary", Description: "Replace the structured itinerary and optional flights state."}, WriteItinerary)
		}},
		{"add_day", "Replace or append one structured itinerary day.", func() (adktool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "add_day", Description: "Replace or append one structured itinerary day."}, AddDay)
		}},
		{"mark_ready_to_book", "Mark a complete itinerary ready for explicit booking approval.", func() (adktool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "mark_ready_to_book", Description: "Mark a complete itinerary ready for explicit booking approval."}, MarkReadyToBook)
		}},
		{"get_current_date", "Return the current UTC calendar date.", func() (adktool.Tool, error) {
			return functiontool.New(functiontool.Config{Name: "get_current_date", Description: "Return the current UTC calendar date."}, GetCurrentDate)
		}},
	}
	for _, definition := range definitions {
		value, err := definition.build()
		if err := add(value, err); err != nil {
			return nil, fmt.Errorf("build %s tool: %w", definition.name, err)
		}
	}
	return result, nil
}
