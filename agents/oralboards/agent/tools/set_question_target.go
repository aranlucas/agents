package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewSetQuestionTarget creates the set_question_target agent tool.
func NewSetQuestionTarget[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "set_question_target",
		Description: "Declare the exact ABPD domain and cognitive skill assessed next.",
	}, handler)
}
