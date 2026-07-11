package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewSearchDocs creates the search_docs agent tool.
func NewSearchDocs[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "search_docs",
		Description: "Search the bundled pediatric dentistry corpus; maximum two calls per episode.",
	}, handler)
}
