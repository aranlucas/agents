package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewMarkListReady creates the mark_list_ready agent tool.
func NewMarkListReady[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "mark_list_ready",
		Description: "Mark a complete shopping list ready.",
	}, handler)
}
