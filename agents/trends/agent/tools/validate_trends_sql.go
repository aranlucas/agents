package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewValidateTrendsSql creates the validate_trends_sql agent tool.
func NewValidateTrendsSql[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "validate_trends_sql",
		Description: "Validate that generated SQL is a bounded, read-only SELECT/WITH query.",
	}, handler)
}
