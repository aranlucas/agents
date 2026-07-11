package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewLoadWebPage creates the load_web_page agent tool.
func NewLoadWebPage[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "load_web_page",
		Description: "Load bounded public HTTPS page text.",
	}, handler)
}
