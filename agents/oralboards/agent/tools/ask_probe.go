package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewAskProbe creates the ask_probe agent tool.
func NewAskProbe[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "ask_probe",
		Description: "Ask one probing follow-up before scoring a partial answer.",
	}, handler)
}
