package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewSetPhase creates the set_phase agent tool.
func NewSetPhase[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "set_phase",
		Description: "Transition the oral exam phase.",
	}, handler)
}
