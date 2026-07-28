package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"agents/internal/common"
	"agents/internal/config"
	"agents/internal/providerpolicy"
	"agents/internal/providers/openai"

	"agents/expense"
	"agents/fitness"
	"agents/grocery"
	"agents/interview"
	"agents/oralboards"
	"agents/presentation"
	"agents/research"
	"agents/resume"
	"agents/spreadsheet"
	"agents/travel"
	"agents/wellness"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/model/gemini"
	"google.golang.org/genai"
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
		trvlEndpoint := strings.TrimSpace(os.Getenv("TRVL_MCP_URL"))
		if trvlEndpoint == "" {
			trvlEndpoint = "https://trvl-production.up.railway.app/mcp"
		}
		built, err := travel.New(m, travel.NewTRVL(trvlEndpoint, &http.Client{Timeout: 20 * time.Second}))
		return Built{Name: name, Agent: built, StateDefaults: travel.StateDefaults, Notes: notes}, err

	case "resume":
		m, err := newAgentModel(providers, providerpolicy.Resume, &notes)
		if err != nil {
			return Built{}, err
		}
		built, err := resume.New(m)
		return Built{Name: name, Agent: built, StateDefaults: resume.StateDefaults, Notes: notes}, err

	case "interview":
		m, err := newAgentModel(providers, providerpolicy.Resume, &notes)
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
		krogerEndpoint := strings.TrimSpace(os.Getenv("KROGER_MCP_URL"))
		if krogerEndpoint == "" {
			krogerEndpoint = "https://ai-meal-planner-mcp.aranlucas.workers.dev/mcp"
		}
		kroger := grocery.NewKroger(common.NewHTTPClient(30*time.Second, 8<<20).Client, krogerEndpoint)
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
		krogerEndpoint := strings.TrimSpace(os.Getenv("KROGER_MCP_URL"))
		if krogerEndpoint == "" {
			krogerEndpoint = "https://ai-meal-planner-mcp.aranlucas.workers.dev/mcp"
		}
		kroger := grocery.NewKroger(common.NewHTTPClient(30*time.Second, 8<<20).Client, krogerEndpoint)
		loader := common.NewWebLoader(common.NewHTTPClient(20*time.Second, 4<<20), 100_000)
		groceryTask, err := grocery.NewTask(gm, kroger, nil, loader)
		if err != nil {
			return Built{}, fmt.Errorf("build grocery task agent: %w", err)
		}
		built, err := wellness.New(wellness.ModelSet{Coordinator: fm}, fitnessTask, groceryTask)
		return Built{Name: name, Agent: built, StateDefaults: wellness.StateDefaults, Notes: notes}, err

	case "oralboards":
		policy := providerpolicy.EvalOralBoards()
		questioner, err := newModel(providers, policy.Questioner, &notes)
		if err != nil {
			return Built{}, err
		}
		evaluator, err := newModel(providers, policy.Evaluator, &notes)
		if err != nil {
			return Built{}, err
		}
		scorer, err := newModel(providers, policy.Scorer, &notes)
		if err != nil {
			return Built{}, err
		}
		var caseBuilder model.LLM = questioner
		if key := strings.TrimSpace(os.Getenv("GEMINI_API_KEY")); key != "" {
			gm, err := gemini.NewModel(ctx, policy.GeminiModel, &genai.ClientConfig{APIKey: key, Backend: genai.BackendGeminiAPI})
			if err != nil {
				return Built{}, err
			}
			caseBuilder = gm
		} else if policy.AllowQuestionerCaseBuilderFallback {
			notes = append(notes, "GEMINI_API_KEY unavailable locally; substituted questioner's provider for oralboards' case builder")
		} else {
			return Built{}, fmt.Errorf("GEMINI_API_KEY is required to configure oralboards case builder")
		}
		corpusPath := strings.TrimSpace(os.Getenv("ORALBOARDS_CORPUS_PATH"))
		if corpusPath == "" {
			// Unlike the gateway (WORKDIR agents/ in production), evalrun
			// runs from the repo root so its dataset paths resolve —
			// see datasetFileName / runAgentEval in main.go.
			corpusPath = "agents/assets/oralboards/search.sqlite"
		}
		corpus, err := oralboards.OpenCorpus(corpusPath)
		if err != nil {
			return Built{}, err
		}
		built, err := oralboards.New(oralboards.PhaseModels{
			CaseBuilder: caseBuilder, Questioner: questioner, Evaluator: evaluator, Scorer: scorer,
		}, corpus)
		return Built{Name: name, Agent: built, StateDefaults: oralboards.StateDefaults, Notes: notes}, err
	}
	return Built{}, fmt.Errorf("unknown agent %q", name)
}
