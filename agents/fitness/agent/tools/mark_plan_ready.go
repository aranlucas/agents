package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewMarkPlanReady creates the mark_plan_ready agent tool.
func NewMarkPlanReady[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "mark_plan_ready",
		Description: "Mark a complete training plan ready.",
	}, handler)
}
