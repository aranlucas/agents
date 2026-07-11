package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewGenerateA2ui creates the generate_a2ui agent tool.
func NewGenerateA2ui[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "generate_a2ui",
		Description: "Render the saved Trends result as a catalog-valid A2UI surface.",
	}, handler)
}
