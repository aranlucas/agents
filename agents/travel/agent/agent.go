package travel

import (
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
	return llmagent.New(llmagent.Config{
		Name:        AppName,
		Description: "Trip planning, itinerary drafting, and booking readiness.",
		Instruction: Instruction,
		Model:       m,
		Tools:       tools,
		Toolsets:    toolsets,
	})
}

func travelTools() ([]adktool.Tool, error) {
	setTripMetaTool, err := functiontool.New(functiontool.Config{
		Name:        "set_trip_meta",
		Description: "Set validated destination, dates, party size, and budget before drafting.",
	}, SetTripMeta)
	if err != nil {
		return nil, err
	}

	writeItineraryTool, err := functiontool.New(functiontool.Config{
		Name:        "write_itinerary",
		Description: "Replace the structured itinerary and optional flights state.",
	}, WriteItinerary)
	if err != nil {
		return nil, err
	}

	addDayTool, err := functiontool.New(functiontool.Config{
		Name:        "add_day",
		Description: "Replace or append one structured itinerary day.",
	}, AddDay)
	if err != nil {
		return nil, err
	}

	markReadyToBookTool, err := functiontool.New(functiontool.Config{
		Name:        "mark_ready_to_book",
		Description: "Mark a complete itinerary ready for explicit booking approval.",
	}, MarkReadyToBook)
	if err != nil {
		return nil, err
	}

	getCurrentDateTool, err := functiontool.New(functiontool.Config{
		Name:        "get_current_date",
		Description: "Return the current UTC calendar date.",
	}, GetCurrentDate)
	if err != nil {
		return nil, err
	}

	return []adktool.Tool{
		setTripMetaTool,
		writeItineraryTool,
		addDayTool,
		markReadyToBookTool,
		getCurrentDateTool,
	}, nil
}
