package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewWriteTrendsResult creates the write_trends_result agent tool.
func NewWriteTrendsResult[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "write_trends_result",
		Description: "Persist the final (or failed) Trends query result to state.",
	}, handler)
}
