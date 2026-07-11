package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewSetTrendsVerification creates the set_trends_verification agent tool.
func NewSetTrendsVerification[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "set_trends_verification",
		Description: "Append web-search verification notes to the trends insights in state.",
	}, handler)
}
