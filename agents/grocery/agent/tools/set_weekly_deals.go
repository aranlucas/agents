package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewSetWeeklyDeals creates the set_weekly_deals agent tool.
func NewSetWeeklyDeals[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "set_weekly_deals",
		Description: "Write current weekly deals to state.",
	}, handler)
}
