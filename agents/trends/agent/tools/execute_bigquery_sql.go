package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewExecuteBigquerySql creates the execute_bigquery_sql agent tool.
func NewExecuteBigquerySql[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "execute_bigquery_sql",
		Description: "Execute bounded BigQuery SQL and return normalized columns and rows.",
	}, handler)
}
