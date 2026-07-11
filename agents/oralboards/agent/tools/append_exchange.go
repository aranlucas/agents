package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewAppendExchange creates the append_exchange agent tool.
func NewAppendExchange[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "append_exchange",
		Description: "Append one scored exchange after the candidate has answered.",
	}, handler)
}
