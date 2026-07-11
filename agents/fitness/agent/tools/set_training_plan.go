package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewSetTrainingPlan creates the set_training_plan agent tool.
func NewSetTrainingPlan[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "set_training_plan",
		Description: "Write the complete weekly training plan to state.",
	}, handler)
}
