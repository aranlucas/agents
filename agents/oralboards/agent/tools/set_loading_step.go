package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewSetLoadingStep creates the set_loading_step agent tool.
func NewSetLoadingStep[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "set_loading_step",
		Description: "Set a concise progress message for the exam UI.",
	}, handler)
}
