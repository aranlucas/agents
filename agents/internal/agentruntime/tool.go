package agentruntime

import (
	"iter"

	"google.golang.org/adk/v2/session"
)

// StructuredError is safe for both tool results and AG-UI error events.
type StructuredError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// StateMap is a small state implementation useful for deterministic tool tests.
type StateMap map[string]any

func (s StateMap) Get(key string) (any, error) {
	value, ok := s[key]
	if !ok {
		return nil, session.ErrStateKeyNotExist
	}
	return value, nil
}
func (s StateMap) Set(key string, value any) error { s[key] = value; return nil }
func (s StateMap) All() iter.Seq2[string, any] {
	return func(yield func(string, any) bool) {
		for key, value := range s {
			if !yield(key, value) {
				return
			}
		}
	}
}
