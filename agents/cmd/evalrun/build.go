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
	"agents/internal/providers/openai"

	"agents/expense"
	"agents/fitness"
	"agents/grocery"
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

func newModel(providers map[string]config.Provider, preferred, model string, rpm, rpd int, notes *[]string) (*openai.Model, error) {
	provider, note, err := resolveProvider(providers, preferred, model, rpm, rpd)
	if err != nil {
		return nil, err
	}
	if note != "" {
		*notes = append(*notes, note)
	}
	return openai.New(provider, nil, noopLimiter{}), nil
}

func buildAgent(ctx context.Context, name string, providers map[string]config.Provider) (Built, error) {
	var notes []string
	switch name {
	case "expense":
		m, err := newModel(providers, "openrouter", "tencent/hy3:free", 20, 1000, &notes)
		if err != nil {
			return Built{}, err
		}
		built, err := expense.New(m)
		return Built{Name: name, Agent: built, StateDefaults: expense.StateDefaults, Notes: notes}, err

	case "research":
		m, err := newModel(providers, "openrouter", "tencent/hy3:free", 20, 1000, &notes)
		if err != nil {
			return Built{}, err
		}
		built, err := research.New(m)
		return Built{Name: name, Agent: built, StateDefaults: research.StateDefaults, Notes: notes}, err

	case "travel":
		m, err := newModel(providers, "openrouter", "tencent/hy3:free", 20, 1000, &notes)
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
		m, err := newModel(providers, "openrouter", "tencent/hy3:free", 20, 1000, &notes)
		if err != nil {
			return Built{}, err
		}
		built, err := resume.New(m)
		return Built{Name: name, Agent: built, StateDefaults: resume.StateDefaults, Notes: notes}, err

	case "presentation":
		m, err := newModel(providers, "groq", "llama-3.3-70b-versatile", 30, 0, &notes)
		if err != nil {
			return Built{}, err
		}
		built, err := presentation.New(m)
		return Built{Name: name, Agent: built, StateDefaults: presentation.StateDefaults, Notes: notes}, err

	case "spreadsheet":
		m, err := newModel(providers, "groq", "llama-3.3-70b-versatile", 30, 0, &notes)
		if err != nil {
			return Built{}, err
		}
		built, err := spreadsheet.New(m)
		return Built{Name: name, Agent: built, StateDefaults: spreadsheet.StateDefaults, Notes: notes}, err

	case "fitness":
		m, err := newModel(providers, "groq", "llama-3.3-70b-versatile", 30, 0, &notes)
		if err != nil {
			return Built{}, err
		}
		built, err := fitness.New(m, nil, nil)
		return Built{Name: name, Agent: built, StateDefaults: fitness.StateDefaults, Notes: notes}, err

	case "grocery":
		m, err := newModel(providers, "nvidia", "nvidia/nemotron-3-super-120b-a12b", 20, 0, &notes)
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
		fm, err := newModel(providers, "groq", "llama-3.3-70b-versatile", 30, 0, &notes)
		if err != nil {
			return Built{}, err
		}
		fitnessTask, err := fitness.NewTask(fm, nil, nil)
		if err != nil {
			return Built{}, fmt.Errorf("build fitness task agent: %w", err)
		}
		gm, err := newModel(providers, "nvidia", "nvidia/nemotron-3-super-120b-a12b", 20, 0, &notes)
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
		questioner, err := newModel(providers, "openrouter", "tencent/hy3:free", 20, 1000, &notes)
		if err != nil {
			return Built{}, err
		}
		evaluator, err := newModel(providers, "mistral", "mistral-large-latest", 20, 0, &notes)
		if err != nil {
			return Built{}, err
		}
		scorer, err := newModel(providers, "mistral", "mistral-medium-latest", 20, 0, &notes)
		if err != nil {
			return Built{}, err
		}
		var caseBuilder model.LLM = questioner
		if key := strings.TrimSpace(os.Getenv("GEMINI_API_KEY")); key != "" {
			gm, err := gemini.NewModel(ctx, "gemini-3.1-flash-lite", &genai.ClientConfig{APIKey: key, Backend: genai.BackendGeminiAPI})
			if err != nil {
				return Built{}, err
			}
			caseBuilder = gm
		} else {
			notes = append(notes, "GEMINI_API_KEY unavailable locally; substituted questioner's provider for oralboards' case builder")
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
