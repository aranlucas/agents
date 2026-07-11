package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewReadDoc creates the read_doc agent tool.
func NewReadDoc[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "read_doc",
		Description: "Read one corpus document by an exact path returned by search_docs.",
	}, handler)
}
