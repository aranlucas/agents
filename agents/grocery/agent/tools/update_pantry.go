package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewUpdatePantry creates the update_pantry agent tool.
func NewUpdatePantry[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "update_pantry",
		Description: "Replace validated pantry state.",
	}, handler)
}
