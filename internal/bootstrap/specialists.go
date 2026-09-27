// Package bootstrap joins explicitly constructed ADK agents to the static
// catalog used by each process surface. It deliberately does not construct
// agents or wrap tools; those responsibilities stay in the authored packages.
package bootstrap

import (
	"context"
	"fmt"

	"github.com/aranlucas/agents/internal/agentruntime"
	"github.com/aranlucas/agents/internal/catalog"
	"google.golang.org/adk/v2/agent"
)

// Binding contains the runtime-only parts of one catalog entry.
type Binding struct {
	Agent         agent.Agent
	StateDefaults func() map[string]any
	Health        func(context.Context) error
}

// Specialists is the compile-time inventory of authored agents. Adding an
// agent requires an explicit field here and a catalog spec, while consumers
// iterate catalog order instead of maintaining their own route lists.
type Specialists struct {
	Travel       Binding
	Grocery      Binding
	Fitness      Binding
	Wellness     Binding
	Expense      Binding
	OralBoards   Binding
	Trends       Binding
	Jobs         Binding
	Interview    Binding
	Research     Binding
	Spreadsheet  Binding
	Presentation Binding
}

// BindingFor returns the explicitly typed binding for one catalog route.
func (s Specialists) BindingFor(route string) (Binding, bool) {
	switch route {
	case "travel":
		return s.Travel, true
	case "grocery":
		return s.Grocery, true
	case "fitness":
		return s.Fitness, true
	case "wellness":
		return s.Wellness, true
	case "expense":
		return s.Expense, true
	case "oralboards":
		return s.OralBoards, true
	case "trends":
		return s.Trends, true
	case "jobs":
		return s.Jobs, true
	case "interview":
		return s.Interview, true
	case "research":
		return s.Research, true
	case "spreadsheet":
		return s.Spreadsheet, true
	case "presentation":
		return s.Presentation, true
	default:
		return Binding{}, false
	}
}

// Registry builds gateway runtime entries from canonical catalog metadata.
func (s Specialists) Registry() (*agentruntime.Registry, error) {
	return s.RegistryFor(catalog.All())
}

// RegistryFor builds entries for one explicitly selected catalog surface.
// This lets a process expose a latency-critical public agent before optional
// private agents finish hydrating, while preserving the same canonical
// metadata and binding validation as Registry.
func (s Specialists) RegistryFor(specs []catalog.Spec) (*agentruntime.Registry, error) {
	entries := make([]agentruntime.Entry, 0, len(specs))
	for _, spec := range specs {
		binding, err := s.require(spec)
		if err != nil {
			return nil, err
		}
		if binding.StateDefaults == nil {
			return nil, fmt.Errorf("state defaults for gateway catalog route %q are required", spec.Route)
		}
		entries = append(entries, agentruntime.Entry{
			Route: spec.Route, AppName: spec.AppName, Agent: binding.Agent,
			StateDefaults: binding.StateDefaults, Public: spec.Public,
			Timeout: spec.Timeout, Health: binding.Health,
		})
	}
	return agentruntime.NewRegistry(entries...)
}

// Agents returns the agents enabled for a surface, keyed by canonical route.
func (s Specialists) Agents(specs []catalog.Spec) (map[string]agent.Agent, error) {
	result := make(map[string]agent.Agent, len(specs))
	for _, spec := range specs {
		binding, err := s.require(spec)
		if err != nil {
			return nil, err
		}
		result[spec.Route] = binding.Agent
	}
	return result, nil
}

func (s Specialists) require(spec catalog.Spec) (Binding, error) {
	binding, ok := s.BindingFor(spec.Route)
	if !ok || binding.Agent == nil {
		return Binding{}, fmt.Errorf("agent binding for catalog route %q is required", spec.Route)
	}
	if binding.Agent.Name() != spec.AppName {
		return Binding{}, fmt.Errorf("agent binding %q has app name %q, want %q", spec.Route, binding.Agent.Name(), spec.AppName)
	}
	return binding, nil
}
