package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewBeginTrendsQuery creates the begin_trends_query agent tool.
func NewBeginTrendsQuery[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "begin_trends_query",
		Description: "Mark the trends state 'querying' before BigQuery execution starts.",
	}, handler)
}
