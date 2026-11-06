package agentruntime

import (
	json "encoding/json/v2"
	"maps"

	"google.golang.org/adk/v2/session"
)

// StateMap produces the JSON-shaped defaults used when creating an ADK session.
func StateMap(value any) map[string]any {
	encoded, _ := json.Marshal(value)
	var values map[string]any
	_ = json.Unmarshal(encoded, &values)
	return values
}

func ReadState[T any](source session.ReadonlyState, defaults T) T {
	values := make(map[string]any)
	if source != nil {
		maps.Insert(values, source.All())
	}
	return DecodeState(values, defaults)
}

// DecodeState overlays persisted JSON-shaped values on domain defaults. The
// existing tolerant read contract retains defaults on encoding failure and any
// fields decoded before an invalid value; domain normalization stays with callers.
func DecodeState[T any](values map[string]any, defaults T) T {
	encoded, err := json.Marshal(values)
	if err == nil {
		_ = json.Unmarshal(encoded, &defaults)
	}
	return defaults
}
