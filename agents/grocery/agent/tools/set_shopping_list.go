package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewSetShoppingList creates the set_shopping_list agent tool.
func NewSetShoppingList[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "set_shopping_list",
		Description: "Replace the unmaterialized shopping list.",
	}, handler)
}
