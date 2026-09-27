package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/aranlucas/agents/internal/common"
	"github.com/aranlucas/agents/internal/config"
	"github.com/aranlucas/agents/internal/providerpolicy"
	"github.com/aranlucas/agents/internal/providers/openai"

	"github.com/aranlucas/agents/internal/agents/expense"
	"github.com/aranlucas/agents/internal/agents/fitness"
	"github.com/aranlucas/agents/internal/agents/grocery"
	"github.com/aranlucas/agents/internal/agents/interview"
	"github.com/aranlucas/agents/internal/agents/presentation"
	"github.com/aranlucas/agents/internal/agents/research"
	"github.com/aranlucas/agents/internal/agents/spreadsheet"
	"github.com/aranlucas/agents/internal/agents/travel"
	"github.com/aranlucas/agents/internal/agents/wellness"

	"google.golang.org/adk/v2/agent"
)

// Built is one constructed agent ready for eval, plus any provider
// substitutions made because a production key was unavailable locally.
type Built struct {
	Name          string
	Agent         agent.Agent
	StateDefaults func() map[string]any
	Notes         []string
}

func newModel(providers map[string]config.Provider, policy providerpolicy.Policy, notes *[]string) (*openai.Model, error) {
	provider, note, err := providerpolicy.ResolveEval(providers, policy)
	if err != nil {
		return nil, err
	}
	if note != "" {
		*notes = append(*notes, note)
	}
	return openai.New(provider, nil, noopLimiter{}), nil
}

func newAgentModel(providers map[string]config.Provider, workload providerpolicy.Workload, notes *[]string) (*openai.Model, error) {
	policy, err := providerpolicy.Agent(workload)
	if err != nil {
		return nil, err
	}
	return newModel(providers, policy, notes)
}

func buildAgent(ctx context.Context, name string, providers map[string]config.Provider) (Built, error) {
	var notes []string
	integrations, err := config.LoadIntegrations(os.Getenv)
	if err != nil {
		return Built{}, err
	}
	switch name {
	case "expense":
		m, err := newAgentModel(providers, providerpolicy.Expense, &notes)
		if err != nil {
			return Built{}, err
		}
		built, err := expense.New(m)
		return Built{Name: name, Agent: built, StateDefaults: expense.StateDefaults, Notes: notes}, err

	case "research":
		m, err := newAgentModel(providers, providerpolicy.Research, &notes)
		if err != nil {
			return Built{}, err
		}
		built, err := research.New(m)
		return Built{Name: name, Agent: built, StateDefaults: research.StateDefaults, Notes: notes}, err

	case "travel":
		m, err := newAgentModel(providers, providerpolicy.Travel, &notes)
		if err != nil {
			return Built{}, err
		}
		built, err := travel.New(m, travel.NewTRVL(integrations.TRVLMCPURL, &http.Client{Timeout: 20 * time.Second}))
		return Built{Name: name, Agent: built, StateDefaults: travel.StateDefaults, Notes: notes}, err

	case "interview":
		m, err := newAgentModel(providers, providerpolicy.Career, &notes)
		if err != nil {
			return Built{}, err
		}
		built, err := interview.New(m)
		return Built{Name: name, Agent: built, StateDefaults: interview.StateDefaults, Notes: notes}, err

	case "presentation":
		m, err := newAgentModel(providers, providerpolicy.Presentation, &notes)
		if err != nil {
			return Built{}, err
		}
		built, err := presentation.New(m, nil)
		return Built{Name: name, Agent: built, StateDefaults: presentation.StateDefaults, Notes: notes}, err

	case "spreadsheet":
		m, err := newAgentModel(providers, providerpolicy.Spreadsheet, &notes)
		if err != nil {
			return Built{}, err
		}
		built, err := spreadsheet.New(m)
		return Built{Name: name, Agent: built, StateDefaults: spreadsheet.StateDefaults, Notes: notes}, err

	case "fitness":
		m, err := newAgentModel(providers, providerpolicy.Fitness, &notes)
		if err != nil {
			return Built{}, err
		}
		built, err := fitness.New(m, nil, nil)
		return Built{Name: name, Agent: built, StateDefaults: fitness.StateDefaults, Notes: notes}, err

	case "grocery":
		m, err := newAgentModel(providers, providerpolicy.Grocery, &notes)
		if err != nil {
			return Built{}, err
		}
		kroger := grocery.NewKroger(common.NewHTTPClient(30*time.Second, 8<<20).Client, integrations.KrogerMCPURL)
		loader := common.NewWebLoader(common.NewHTTPClient(20*time.Second, 4<<20), 100_000)
		built, err := grocery.New(m, kroger, nil, loader)
		return Built{Name: name, Agent: built, StateDefaults: grocery.StateDefaults, Notes: notes}, err

	case "wellness":
		fm, err := newAgentModel(providers, providerpolicy.Wellness, &notes)
		if err != nil {
			return Built{}, err
		}
		fitnessTask, err := fitness.NewTask(fm, nil, nil)
		if err != nil {
			return Built{}, fmt.Errorf("build fitness task agent: %w", err)
		}
		gm, err := newAgentModel(providers, providerpolicy.Grocery, &notes)
		if err != nil {
			return Built{}, err
		}
		kroger := grocery.NewKroger(common.NewHTTPClient(30*time.Second, 8<<20).Client, integrations.KrogerMCPURL)
		loader := common.NewWebLoader(common.NewHTTPClient(20*time.Second, 4<<20), 100_000)
		groceryTask, err := grocery.NewTask(gm, kroger, nil, loader)
		if err != nil {
			return Built{}, fmt.Errorf("build grocery task agent: %w", err)
		}
		built, err := wellness.New(wellness.ModelSet{Coordinator: fm}, fitnessTask, groceryTask)
		return Built{Name: name, Agent: built, StateDefaults: wellness.StateDefaults, Notes: notes}, err

	}
	return Built{}, fmt.Errorf("unknown agent %q", name)
}
