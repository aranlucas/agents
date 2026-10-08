// Package mcpruntime owns request-scoped MCP connections and tracing metadata.
package mcpruntime

import (
	"context"
	"errors"
	"io"
	"sync"

	"google.golang.org/adk/v2/tool"
)

type scopeKey struct{}

type scope struct {
	mu     sync.Mutex
	sets   map[string]ownedToolset
	closed bool
}

type ownedToolset interface {
	tool.Toolset
	io.Closer
}

// WithScope reuses connections during one run and closes them when it ends.
// Each run gets a separate scope, including concurrent runs of the same agent.
func WithScope(ctx context.Context) (context.Context, func() error) {
	s := &scope{sets: make(map[string]ownedToolset)}
	return context.WithValue(ctx, scopeKey{}, s), s.close
}

// Toolset lazily creates a run-owned MCP connection. Keys stay in memory and
// may include authentication material to distinguish capabilities; never log them.
func Toolset(ctx context.Context, key string, create func() (tool.Toolset, error)) (tool.Toolset, error) {
	s, ok := ctx.Value(scopeKey{}).(*scope)
	if !ok {
		return nil, errors.New("MCP tool discovery requires a run scope")
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil, errors.New("MCP run scope is closed")
	}
	if set := s.sets[key]; set != nil {
		return set, nil
	}
	set, err := create()
	if err != nil {
		return nil, err
	}
	owned, ok := set.(ownedToolset)
	if !ok {
		return nil, errors.New("MCP toolset must support connection cleanup")
	}
	s.sets[key] = owned
	return set, nil
}

func (s *scope) close() error {
	s.mu.Lock()
	sets := s.sets
	s.sets = nil
	s.closed = true
	s.mu.Unlock()
	var errs []error
	for _, set := range sets {
		errs = append(errs, set.Close())
	}
	return errors.Join(errs...)
}
