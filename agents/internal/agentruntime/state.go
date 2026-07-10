// Package agentruntime contains shared typed agent runtime primitives.
package agentruntime

import (
	"iter"
	"reflect"
	"strings"
	"sync"

	"google.golang.org/adk/session"
)

// Patch is an RFC 6902 JSON Patch operation against the top-level state map.
type Patch struct {
	Op    string `json:"op"`
	Path  string `json:"path"`
	Value any    `json:"value,omitempty"`
}

// Transaction stages validated state changes for one tool invocation.
type Transaction struct {
	mu      sync.RWMutex
	values  map[string]any
	patches []Patch
	changes map[string]any
}

// NewTransaction snapshots state so failed tools cannot partially mutate it.
func NewTransaction(initial map[string]any) *Transaction {
	return &Transaction{values: cloneMap(initial), changes: make(map[string]any)}
}

// NewTransactionFromState snapshots an ADK state implementation.
func NewTransactionFromState(state session.ReadonlyState) *Transaction {
	values := make(map[string]any)
	if state != nil {
		for key, value := range state.All() {
			values[key] = cloneValue(value)
		}
	}
	return NewTransaction(values)
}

func (t *Transaction) Get(key string) (any, bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	value, ok := t.values[key]
	return cloneValue(value), ok
}

func (t *Transaction) Set(key string, value any) {
	t.mu.Lock()
	defer t.mu.Unlock()
	_, exists := t.values[key]
	value = cloneValue(value)
	t.values[key] = value
	t.changes[key] = value
	if strings.HasPrefix(key, session.KeyPrefixTemp) {
		return
	}
	op := "add"
	if exists {
		op = "replace"
	}
	t.patches = append(t.patches, Patch{Op: op, Path: "/" + escapeJSONPointer(key), Value: cloneValue(value)})
}

func (t *Transaction) Delete(key string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if _, exists := t.values[key]; !exists {
		return
	}
	delete(t.values, key)
	t.changes[key] = nil
	if !strings.HasPrefix(key, session.KeyPrefixTemp) {
		t.patches = append(t.patches, Patch{Op: "remove", Path: "/" + escapeJSONPointer(key)})
	}
}

func (t *Transaction) Snapshot() map[string]any {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return cloneMap(t.values)
}

func (t *Transaction) PersistentSnapshot() map[string]any {
	t.mu.RLock()
	defer t.mu.RUnlock()
	result := make(map[string]any)
	for key, value := range t.values {
		if !strings.HasPrefix(key, session.KeyPrefixTemp) {
			result[key] = cloneValue(value)
		}
	}
	return result
}

func (t *Transaction) Patch() []Patch {
	t.mu.RLock()
	defer t.mu.RUnlock()
	result := make([]Patch, len(t.patches))
	for index, patch := range t.patches {
		result[index] = Patch{Op: patch.Op, Path: patch.Path, Value: cloneValue(patch.Value)}
	}
	return result
}

// Changes returns the ADK state delta, excluding invocation-only keys.
func (t *Transaction) Changes() map[string]any {
	t.mu.RLock()
	defer t.mu.RUnlock()
	result := make(map[string]any)
	for key, value := range t.changes {
		if !strings.HasPrefix(key, session.KeyPrefixTemp) {
			result[key] = cloneValue(value)
		}
	}
	return result
}

func escapeJSONPointer(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "~", "~0"), "/", "~1")
}

func cloneMap(input map[string]any) map[string]any {
	output := make(map[string]any, len(input))
	for key, value := range input {
		output[key] = cloneValue(value)
	}
	return output
}

func cloneValue(value any) any {
	if value == nil {
		return nil
	}
	return cloneReflect(reflect.ValueOf(value)).Interface()
}

func cloneReflect(value reflect.Value) reflect.Value {
	if !value.IsValid() {
		return value
	}
	switch value.Kind() {
	case reflect.Interface:
		if value.IsNil() {
			return reflect.Zero(value.Type())
		}
		result := reflect.New(value.Type()).Elem()
		result.Set(cloneReflect(value.Elem()))
		return result
	case reflect.Pointer:
		if value.IsNil() {
			return reflect.Zero(value.Type())
		}
		result := reflect.New(value.Type().Elem())
		result.Elem().Set(cloneReflect(value.Elem()))
		return result
	case reflect.Map:
		if value.IsNil() {
			return reflect.Zero(value.Type())
		}
		result := reflect.MakeMapWithSize(value.Type(), value.Len())
		iterator := value.MapRange()
		for iterator.Next() {
			result.SetMapIndex(iterator.Key(), cloneReflect(iterator.Value()))
		}
		return result
	case reflect.Slice:
		if value.IsNil() {
			return reflect.Zero(value.Type())
		}
		result := reflect.MakeSlice(value.Type(), value.Len(), value.Len())
		for index := range value.Len() {
			result.Index(index).Set(cloneReflect(value.Index(index)))
		}
		return result
	case reflect.Array:
		result := reflect.New(value.Type()).Elem()
		for index := range value.Len() {
			result.Index(index).Set(cloneReflect(value.Index(index)))
		}
		return result
	default:
		return value
	}
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
