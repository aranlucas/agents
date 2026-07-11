package tools

import (
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

// NewFetchActivities creates the fetch_activities agent tool.
func NewFetchActivities[TArgs, TResult any](handler functiontool.Func[TArgs, TResult]) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "fetch_activities",
		Description: "Fetch and merge one bounded page of Strava activities.",
	}, handler)
}
