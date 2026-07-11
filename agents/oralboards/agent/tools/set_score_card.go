package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewSetScoreCard creates the set_score_card agent tool.
func NewSetScoreCard[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "set_score_card",
		Description: "Write final ABPD 1-3 per-skillset scores and outcome.",
	}, handler)
}
