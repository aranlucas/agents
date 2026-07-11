package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewCompleteExamination creates the complete_examination agent tool.
func NewCompleteExamination[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "complete_examination",
		Description: "Mark questioning complete so the deterministic router runs the scorer.",
	}, handler)
}
