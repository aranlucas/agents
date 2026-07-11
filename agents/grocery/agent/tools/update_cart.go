package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewUpdateCart creates the update_cart agent tool.
func NewUpdateCart[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "update_cart",
		Description: "Reflect only confirmed live Kroger cart contents in state.",
	}, handler)
}
