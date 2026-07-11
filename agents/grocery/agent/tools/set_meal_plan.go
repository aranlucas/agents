package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewSetMealPlan creates the set_meal_plan agent tool.
func NewSetMealPlan[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "set_meal_plan",
		Description: "Write the meal plan to streamed state.",
	}, handler)
}
