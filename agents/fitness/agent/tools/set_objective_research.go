package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewSetObjectiveResearch creates the set_objective_research agent tool.
func NewSetObjectiveResearch[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "set_objective_research",
		Description: "Write concise sourced objective research to state.",
	}, handler)
}
