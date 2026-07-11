package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewGetCurrentDate creates the get_current_date agent tool.
func NewGetCurrentDate[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "get_current_date",
		Description: "Return the current UTC date.",
	}, handler)
}
