package agentruntime

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"sort"
	"strings"
	"time"

	"google.golang.org/adk/v2/agent"
)

// Entry describes one mounted agent without coupling it to HTTP routing code.
type Entry struct {
	Route         string
	AppName       string
	Agent         agent.Agent
	StateDefaults map[string]any
	Public        bool
	Timeout       time.Duration
	Health        func(context.Context) error
	Forwarded     ForwardedRequestHandler
}

// ForwardedRequestHandler handles library-defined forwarded AG-UI properties
// without invoking the model. The input and result are intentionally dynamic:
// forwardedProps is an AG-UI extension boundary whose concrete schema belongs
// to the mounted integration (for example, MCP Apps).
type ForwardedRequestHandler interface {
	HandleForwarded(context.Context, any) (result any, handled bool, err error)
}

// Registry is immutable after construction and safe for concurrent lookups.
type Registry struct{ entries map[string]Entry }

func NewRegistry(entries ...Entry) (*Registry, error) {
	registry := &Registry{entries: make(map[string]Entry, len(entries))}
	for _, entry := range entries {
		entry.Route = strings.Trim(strings.TrimSpace(entry.Route), "/")
		if entry.Route == "" || strings.Contains(entry.Route, "/") || entry.AppName == "" || entry.Agent == nil {
			return nil, fmt.Errorf("invalid registry entry %q", entry.Route)
		}
		if _, exists := registry.entries[entry.Route]; exists {
			return nil, fmt.Errorf("duplicate agent route %q", entry.Route)
		}
		if entry.Timeout <= 0 {
			entry.Timeout = 2 * time.Minute
		}
		entry.StateDefaults = cloneMap(entry.StateDefaults)
		registry.entries[entry.Route] = entry
	}
	return registry, nil
}

func (r *Registry) Lookup(route string) (Entry, error) {
	if r == nil {
		return Entry{}, errors.New("agent registry is required")
	}
	route = strings.Trim(strings.TrimSpace(route), "/")
	entry, ok := r.entries[route]
	if !ok {
		return Entry{}, fmt.Errorf("unknown agent route %q", route)
	}
	entry.StateDefaults = cloneMap(entry.StateDefaults)
	return entry, nil
}

func (r *Registry) Entries() []Entry {
	return r.All()
}

// All returns every explicit registry entry in stable route order. Registry
// construction remains filesystem-independent; this method only enumerates
// entries that callers supplied to NewRegistry.
func (r *Registry) All() []Entry {
	if r == nil {
		return nil
	}
	routes := make([]string, 0, len(r.entries))
	for route := range r.entries {
		routes = append(routes, route)
	}
	sort.Strings(routes)
	entries := make([]Entry, 0, len(routes))
	for _, route := range routes {
		entry, _ := r.Lookup(route)
		entries = append(entries, entry)
	}
	return entries
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
