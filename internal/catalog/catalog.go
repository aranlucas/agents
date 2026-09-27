// Package catalog owns the static identity and surface metadata for every
// authored agent. Runtime construction remains explicit in each command; this
// package deliberately contains no agent constructors or tool registration.
package catalog

import "time"

// Spec is deployment-independent metadata for one authored agent.
//
// ClientID is the stable identity exposed by @agents/types. Route is the
// backend path mounted by the gateway and used by Telegram/eval tooling.
type Spec struct {
	ClientID string
	Route    string
	AppName  string
	Public   bool
	Timeout  time.Duration
	Telegram bool
	Eval     bool
}

var specs = [...]Spec{
	{ClientID: "travel", Route: "travel", AppName: "collab_trip_agent", Timeout: 3 * time.Minute, Telegram: true, Eval: true},
	{ClientID: "grocery", Route: "grocery", AppName: "grocery_agent", Timeout: 3 * time.Minute, Telegram: true, Eval: true},
	{ClientID: "fitness", Route: "fitness", AppName: "fitness_agent", Timeout: 3 * time.Minute, Telegram: true, Eval: true},
	{ClientID: "wellness", Route: "wellness", AppName: "wellness_agent", Timeout: 5 * time.Minute, Telegram: true, Eval: true},
	{ClientID: "expense", Route: "expense", AppName: "expense_desk_agent", Timeout: 2 * time.Minute, Telegram: true, Eval: true},
	{ClientID: "oral-boards", Route: "oralboards", AppName: "oralboards_agent", Timeout: 5 * time.Minute, Telegram: true, Eval: true},
	{ClientID: "trends", Route: "trends", AppName: "GoogleTrendsAgent", Timeout: 3 * time.Minute, Telegram: true},
	{ClientID: "resume", Route: "resume", AppName: "resume_agent", Public: true, Timeout: 2 * time.Minute, Telegram: true, Eval: true},
	{ClientID: "jobs", Route: "jobs", AppName: "jobs_agent", Timeout: 2 * time.Minute},
	{ClientID: "interview", Route: "interview", AppName: "interview_coach_agent", Timeout: 2 * time.Minute, Eval: true},
	{ClientID: "research", Route: "research", AppName: "research_canvas_agent", Timeout: 3 * time.Minute, Telegram: true, Eval: true},
	{ClientID: "spreadsheet", Route: "spreadsheet", AppName: "spreadsheet_agent", Timeout: 2 * time.Minute, Telegram: true, Eval: true},
	{ClientID: "presentation", Route: "presentation", AppName: "presentation_agent", Timeout: 2 * time.Minute, Telegram: true, Eval: true},
}

// All returns every authored agent in stable client display order.
func All() []Spec {
	return append([]Spec(nil), specs[:]...)
}

// ByRoute returns metadata for one backend route.
func ByRoute(route string) (Spec, bool) {
	for _, spec := range specs {
		if spec.Route == route {
			return spec, true
		}
	}
	return Spec{}, false
}

// Telegram returns the specialists exposed through the Telegram orchestrator.
func Telegram() []Spec {
	return filter(func(spec Spec) bool { return spec.Telegram })
}

// Eval returns agents supported by the Go-native dataset evaluator. Trends is
// intentionally absent until it has a dataset in the evalrun format.
func Eval() []Spec {
	return filter(func(spec Spec) bool { return spec.Eval })
}

func filter(include func(Spec) bool) []Spec {
	result := make([]Spec, 0, len(specs))
	for _, spec := range specs {
		if include(spec) {
			result = append(result, spec)
		}
	}
	return result
}
