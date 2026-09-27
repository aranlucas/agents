package app

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/aranlucas/agents/internal/bootstrap"
	"github.com/aranlucas/agents/internal/common"
	"github.com/aranlucas/agents/internal/config"
	"github.com/aranlucas/agents/internal/expense"
	"github.com/aranlucas/agents/internal/fitness"
	"github.com/aranlucas/agents/internal/grocery"
	"github.com/aranlucas/agents/internal/interview"
	"github.com/aranlucas/agents/internal/jobs"
	"github.com/aranlucas/agents/internal/oralboards"
	"github.com/aranlucas/agents/internal/presentation"
	"github.com/aranlucas/agents/internal/providerpolicy"
	"github.com/aranlucas/agents/internal/providers/openai"
	"github.com/aranlucas/agents/internal/research"
	"github.com/aranlucas/agents/internal/resume"
	"github.com/aranlucas/agents/internal/spreadsheet"
	"github.com/aranlucas/agents/internal/travel"
	"github.com/aranlucas/agents/internal/trends"
	"github.com/aranlucas/agents/internal/wellness"

	"cloud.google.com/go/bigquery"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/model/gemini"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/api/option"
	"google.golang.org/genai"
)

// BuildResume builds the public Resume agent. The gateway serves it before
// the other agents finish building, so it is constructed separately.
func BuildResume(rt *Runtime, toolsets ...tool.Toolset) (bootstrap.Binding, error) {
	primary, fallbacks, err := resumeProviders(rt.Config.Providers)
	if err != nil {
		return bootstrap.Binding{}, fmt.Errorf("configure resume model: %w", err)
	}
	resumeModel, err := openai.NewMulti(primary, fallbacks, rt.ModelHTTP, rt.Limiter)
	if err != nil {
		return bootstrap.Binding{}, fmt.Errorf("configure resume fallback: %w", err)
	}
	built, err := resume.New(resumeModel, toolsets...)
	if err != nil {
		return bootstrap.Binding{}, fmt.Errorf("build resume agent: %w", err)
	}
	return bootstrap.Binding{Agent: built, StateDefaults: resume.StateDefaults, Health: ResumeHealth(resumeModel)}, nil
}

// Specialists holds every built agent plus resources that must be released
// when the process stops.
type Specialists struct {
	bootstrap.Specialists
	corpus *oralboards.Corpus
}

// Close releases the oral-boards corpus.
func (s *Specialists) Close() error {
	if s == nil || s.corpus == nil {
		return nil
	}
	return s.corpus.Close()
}

// BuildSpecialists builds every agent other than Resume concurrently. The
// toolsets (for example the AG-UI client-tool bridge) are attached to each.
func BuildSpecialists(ctx context.Context, rt *Runtime, resumeBinding bootstrap.Binding, toolsets ...tool.Toolset) (*Specialists, error) {
	cfg := rt.Config
	integrations := cfg.Integrations
	availableProviders := providerpolicy.FallbackProviders(cfg.Providers)
	jobsWebLoader := common.NewWebLoader(common.NewHTTPClient(20*time.Second, 4<<20), 100_000)
	webLoader := common.NewWebLoader(common.NewHTTPClient(20*time.Second, 4<<20), 100_000)
	krogerClient := grocery.NewKroger(common.NewHTTPClient(30*time.Second, 8<<20).Client, integrations.KrogerMCPURL)

	// Jobs and interview share the Resume provider without its public
	// startup deadline or overflow policy.
	careerProvider, _, err := resumeProviders(cfg.Providers)
	if err != nil {
		return nil, fmt.Errorf("configure career model: %w", err)
	}
	careerProvider.ReasoningEffort = ""
	careerProvider.FirstContentTimeout = 0
	careerProvider.Fallbacks = nil
	careerModel := openai.New(careerProvider, rt.ModelHTTP, rt.Limiter)

	agentModel := func(workload providerpolicy.Workload) (model.LLM, error) {
		provider, err := providerpolicy.ResolveAgent(cfg.Providers, workload)
		if err != nil {
			return nil, fmt.Errorf("configure %s model: %w", workload, err)
		}
		built, err := openai.NewMulti(provider, availableProviders, rt.ModelHTTP, rt.Limiter)
		if err != nil {
			return nil, fmt.Errorf("configure %s fallbacks: %w", workload, err)
		}
		return built, nil
	}

	var (
		jobsAgent, interviewAgent, presentationAgent, researchAgent agent.Agent
		spreadsheetAgent, expenseAgent, travelAgent, fitnessAgent   agent.Agent
		fitnessTaskAgent, groceryAgent, groceryTaskAgent            agent.Agent
		trendsAgent, oralboardsAgent                                agent.Agent
		fitnessModel                                                model.LLM
		corpus                                                      *oralboards.Corpus
	)
	var builds buildGroup
	builds.Go("jobs agent", func() (err error) {
		jobsAgent, err = jobs.New(careerModel, rt.Brave, jobsWebLoader, toolsets...)
		return err
	})
	builds.Go("interview agent", func() (err error) {
		interviewAgent, err = interview.New(careerModel, toolsets...)
		return err
	})
	builds.Go("presentation agent", func() error {
		m, err := agentModel(providerpolicy.Presentation)
		if err != nil {
			return err
		}
		presentationAgent, err = presentation.New(m, rt.Brave, toolsets...)
		return err
	})
	builds.Go("research agent", func() error {
		m, err := agentModel(providerpolicy.Research)
		if err != nil {
			return err
		}
		researchAgent, err = research.New(m, toolsets...)
		return err
	})
	builds.Go("spreadsheet agent", func() error {
		m, err := agentModel(providerpolicy.Spreadsheet)
		if err != nil {
			return err
		}
		spreadsheetAgent, err = spreadsheet.New(m, toolsets...)
		return err
	})
	builds.Go("expense agent", func() error {
		m, err := agentModel(providerpolicy.Expense)
		if err != nil {
			return err
		}
		expenseAgent, err = expense.New(m, toolsets...)
		return err
	})
	builds.Go("travel agent", func() error {
		m, err := agentModel(providerpolicy.Travel)
		if err != nil {
			return err
		}
		trvl := travel.NewTRVL(integrations.TRVLMCPURL, common.NewHTTPClient(20*time.Second, 8<<20).Client)
		travelAgent, err = travel.New(m, append(append([]tool.Toolset{}, toolsets...), trvl)...)
		return err
	})
	builds.Go("fitness agents", func() error {
		m, err := agentModel(providerpolicy.Fitness)
		if err != nil {
			return err
		}
		fitnessModel = m
		if fitnessAgent, err = fitness.New(m, rt.Fitness, rt.Brave, toolsets...); err != nil {
			return err
		}
		fitnessTaskAgent, err = fitness.NewTask(m, rt.Fitness, rt.Brave, toolsets...)
		return err
	})
	builds.Go("grocery agents", func() error {
		m, err := agentModel(providerpolicy.Grocery)
		if err != nil {
			return err
		}
		if groceryAgent, err = grocery.NewWithLibrary(m, krogerClient, rt.Brave, webLoader, rt.Groceries, toolsets...); err != nil {
			return err
		}
		groceryTaskAgent, err = grocery.NewTaskWithLibrary(m, krogerClient, rt.Brave, webLoader, rt.Groceries, toolsets...)
		return err
	})
	builds.Go("trends agent", func() error {
		m, err := agentModel(providerpolicy.Trends)
		if err != nil {
			return err
		}
		client, err := trendsBigQueryClient(ctx, integrations)
		if err != nil {
			return err
		}
		executor, err := trends.NewBigQueryExecutor(client, "bigquery-public-data", "google_trends", trends.DefaultMaxBytesBilled, 30*time.Second)
		if err != nil {
			return fmt.Errorf("configure trends BigQuery executor: %w", err)
		}
		generator, err := trends.NewGenerator(m)
		if err != nil {
			return fmt.Errorf("build trends generator agent: %w", err)
		}
		trendsAgent, err = trends.New(m, generator, executor, rt.Brave, toolsets...)
		return err
	})
	builds.Go("oralboards agent", func() error {
		phaseModels, err := oralboardsModels(ctx, integrations.GeminiAPIKey)
		if err != nil {
			return err
		}
		if corpus, err = oralboards.OpenCorpus(integrations.OralBoardsCorpusPath); err != nil {
			return fmt.Errorf("open oralboards corpus: %w", err)
		}
		oralboardsAgent, err = oralboards.New(phaseModels, corpus, toolsets...)
		return err
	})
	err = builds.Wait()
	// Read corpus only after Wait: the oralboards goroutine assigns it.
	result := &Specialists{corpus: corpus}
	if err != nil {
		_ = result.Close()
		return nil, err
	}
	wellnessAgent, err := wellness.New(wellness.ModelSet{Coordinator: fitnessModel}, fitnessTaskAgent, groceryTaskAgent, toolsets...)
	if err != nil {
		_ = result.Close()
		return nil, fmt.Errorf("build wellness agent: %w", err)
	}
	result.Specialists = bootstrap.Specialists{
		Travel:       bootstrap.Binding{Agent: travelAgent, StateDefaults: travel.StateDefaults},
		Grocery:      bootstrap.Binding{Agent: groceryAgent, StateDefaults: grocery.StateDefaults},
		Fitness:      bootstrap.Binding{Agent: fitnessAgent, StateDefaults: fitness.StateDefaults},
		Wellness:     bootstrap.Binding{Agent: wellnessAgent, StateDefaults: wellness.StateDefaults},
		Expense:      bootstrap.Binding{Agent: expenseAgent, StateDefaults: expense.StateDefaults},
		OralBoards:   bootstrap.Binding{Agent: oralboardsAgent, StateDefaults: oralboards.StateDefaults},
		Trends:       bootstrap.Binding{Agent: trendsAgent, StateDefaults: trends.StateDefaults},
		Resume:       resumeBinding,
		Jobs:         bootstrap.Binding{Agent: jobsAgent, StateDefaults: jobs.StateDefaults},
		Interview:    bootstrap.Binding{Agent: interviewAgent, StateDefaults: interview.StateDefaults},
		Research:     bootstrap.Binding{Agent: researchAgent, StateDefaults: research.StateDefaults},
		Spreadsheet:  bootstrap.Binding{Agent: spreadsheetAgent, StateDefaults: spreadsheet.StateDefaults},
		Presentation: bootstrap.Binding{Agent: presentationAgent, StateDefaults: presentation.StateDefaults},
	}
	return result, nil
}

// buildGroup runs independent constructors concurrently and keeps the first
// error, labelled with the component that failed.
type buildGroup struct {
	wg   sync.WaitGroup
	once sync.Once
	err  error
}

func (group *buildGroup) Go(label string, build func() error) {
	group.wg.Go(func() {
		if err := build(); err != nil {
			group.once.Do(func() { group.err = fmt.Errorf("build %s: %w", label, err) })
		}
	})
}

func (group *buildGroup) Wait() error {
	group.wg.Wait()
	return group.err
}

// trendsBigQueryClient builds the BigQuery client billed to the service
// account's own project. The queried dataset
// (bigquery-public-data.google_trends) is a separate, hardcoded allowlist
// enforced by trends.NewBigQueryExecutor.
func trendsBigQueryClient(ctx context.Context, integrations config.Integrations) (*bigquery.Client, error) {
	if integrations.GoogleCredentialsJSON == "" {
		return nil, errors.New("GOOGLE_APPLICATION_CREDENTIALS_JSON is required to configure the trends agent's BigQuery client")
	}
	client, err := bigquery.NewClient(ctx, integrations.GoogleProjectID, option.WithAuthCredentialsJSON(option.ServiceAccount, []byte(integrations.GoogleCredentialsJSON)))
	if err != nil {
		return nil, fmt.Errorf("configure BigQuery client: %w", err)
	}
	return client, nil
}

func oralboardsModels(ctx context.Context, apiKey string) (oralboards.PhaseModels, error) {
	if apiKey == "" {
		return oralboards.PhaseModels{}, errors.New("GEMINI_API_KEY is required to configure oralboards case builder")
	}
	caseBuilder, err := gemini.NewModel(ctx, providerpolicy.GatewayOralBoards().GeminiModel, oralboardsGeminiClientConfig(apiKey))
	if err != nil {
		return oralboards.PhaseModels{}, err
	}
	// Every phase is a separate agent node, so sharing the official Gemini client
	// does not couple their conversations. A single provider also avoids losing
	// an in-progress examination to cross-provider response incompatibilities.
	return oralboards.PhaseModels{CaseBuilder: caseBuilder, Questioner: caseBuilder, Evaluator: caseBuilder, Scorer: caseBuilder}, nil
}

// oralboardsGeminiClientConfig keeps transient provider failures inside the
// model request that encountered them. ADK's workflow RetryConfig reactivates
// an entire node; that is unsafe for oral-board phases whose agents may already
// have mutated examination state through tools before a later model call fails.
//
// The Gen AI SDK documents HTTPRetryOptions as the request-level retry seam.
// A non-nil empty policy enables its maintained defaults: five total attempts,
// an approximately one-second initial delay, exponential backoff with jitter,
// and retries limited to transport failures plus 408, 429, and selected 5xx
// responses. Keep those defaults centralized in the provider SDK rather than
// copying values here and allowing the policies to drift.
func oralboardsGeminiClientConfig(apiKey string) *genai.ClientConfig {
	return &genai.ClientConfig{
		APIKey:      apiKey,
		Backend:     genai.BackendGeminiAPI,
		HTTPOptions: genai.HTTPOptions{RetryOptions: &genai.HTTPRetryOptions{}},
	}
}

// ResumeHealth reports the resume agent's readiness from local state only
// (embedded grounding present, model wired at startup) — it never issues a
// model request, so GET /resume/health cannot burn provider quota or block
// on an upstream outage.
func ResumeHealth(m model.LLM) func(context.Context) error {
	return func(context.Context) error {
		if strings.TrimSpace(resume.Instruction) == "" {
			return errors.New("resume instruction is empty")
		}
		if m == nil || strings.TrimSpace(m.Name()) == "" {
			return errors.New("resume model is not configured")
		}
		return nil
	}
}

// resumeProviders keeps the public introduction's startup policy compatible
// with the dynamic free router, whose selected model may require reasoning.
func resumeProviders(providers map[string]config.Provider) (config.Provider, map[string]config.Provider, error) {
	primary, err := providerpolicy.ResolveAgent(providers, providerpolicy.Resume)
	if err != nil {
		return config.Provider{}, nil, err
	}
	fallbacks := providerpolicy.FallbackProviders(providers)
	if len(primary.Fallbacks) > 0 {
		// Bound time to usable content without disabling mandatory reasoning.
		primary.FirstContentTimeout = 2 * time.Second
	}
	if groq, ok := fallbacks["groq"]; ok {
		groq.ReasoningEffort = "low"
		fallbacks["groq"] = groq
	}
	return primary, fallbacks, nil
}
