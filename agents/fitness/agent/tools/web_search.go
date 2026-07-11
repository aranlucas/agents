package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewWebSearch creates the web_search agent tool.
func NewWebSearch[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "web_search",
		Description: "Search current public web results with the limited Brave budget.",
	}, handler)
}
