// Package providerpolicy owns the model and rate-limit choices for each
// authored agent surface. It does not construct models or agents; commands
// remain responsible for composition and transport-specific behavior.
package providerpolicy

import (
	"errors"
	"fmt"

	"agents/internal/config"
)

// Workload identifies an authored agent whose production model policy is
// shared by the gateway and local eval runner.
type Workload string

const (
	Expense      Workload = "expense"
	Fitness      Workload = "fitness"
	Grocery      Workload = "grocery"
	Presentation Workload = "presentation"
	Research     Workload = "research"
	Resume       Workload = "resume"
	Spreadsheet  Workload = "spreadsheet"
	Travel       Workload = "travel"
	Trends       Workload = "trends"
	Wellness     Workload = "wellness"
)

// Policy is one OpenAI-compatible provider selection. Fallbacks are ordered
// and optional: production resolution keeps only providers that are actually
// configured.
type Policy struct {
	Provider          string
	Model             string
	RequestsPerMinute int
	RequestsPerDay    int
	Fallbacks         []string

	missingProviderMessage string
}

// OralBoardsPolicy keeps the phase-specific production/eval differences
// explicit. A zero Scorer means the scorer reuses the Gemini case-builder
// model; eval instead supplies its distinct Mistral scorer policy.
type OralBoardsPolicy struct {
	GeminiModel                        string
	Questioner                         Policy
	Evaluator                          Policy
	Scorer                             Policy
	AllowQuestionerCaseBuilderFallback bool
}

// Agent returns the gateway policy for an authored workload.
func Agent(workload Workload) (Policy, error) {
	switch workload {
	case Expense:
		return openRouterLight("OPENROUTER_API_KEY is required to configure the expense agent", "mistral"), nil
	case Fitness:
		return groqStandard("GROQ_API_KEY is required to configure the fitness agent"), nil
	case Grocery:
		return Policy{
			Provider: "nvidia", Model: "nvidia/nemotron-3-super-120b-a12b", RequestsPerMinute: 20,
			Fallbacks:              []string{"mistral", "openrouter"},
			missingProviderMessage: "NVIDIA_NIM_API_KEY is required to configure the grocery agent",
		}, nil
	case Presentation:
		return groqStandard("GROQ_API_KEY is required to configure the presentation agent"), nil
	case Research:
		return openRouterLight("OPENROUTER_API_KEY is required to configure the research agent", "mistral"), nil
	case Resume:
		return openRouterLight("OPENROUTER_API_KEY is required to configure the resume agent"), nil
	case Spreadsheet:
		return groqStandard("GROQ_API_KEY is required to configure the spreadsheet agent"), nil
	case Travel:
		return openRouterLight("OPENROUTER_API_KEY is required to configure the travel agent", "mistral"), nil
	case Trends:
		return groqStandard("GROQ_API_KEY is required to configure the trends agent"), nil
	case Wellness:
		return groqStandard("GROQ_API_KEY is required to configure the wellness agent"), nil
	default:
		return Policy{}, fmt.Errorf("unknown provider-policy workload %q", workload)
	}
}

// ResolveAgent resolves one authored workload directly from the configured
// production providers.
func ResolveAgent(providers map[string]config.Provider, workload Workload) (config.Provider, error) {
	policy, err := Agent(workload)
	if err != nil {
		return config.Provider{}, err
	}
	return ResolveRequired(providers, policy)
}

// GatewayOralBoards returns the gateway's phase policies. Case construction
// and scoring share Gemini; the questioner and evaluator use separate
// OpenAI-compatible chains.
func GatewayOralBoards() OralBoardsPolicy {
	return OralBoardsPolicy{
		GeminiModel: "gemini-3.1-flash-lite",
		Questioner:  openRouterLight("OPENROUTER_API_KEY is required to configure oralboards", "mistral"),
		Evaluator: Policy{
			Provider: "mistral", Model: "mistral-large-latest", RequestsPerMinute: 20,
			Fallbacks:              []string{"groq", "openrouter"},
			missingProviderMessage: "MISTRAL_API_KEY is required to configure oralboards",
		},
	}
}

// EvalOralBoards returns local-eval phase policies. Eval preserves its
// distinct Mistral medium scorer and may reuse the questioner when Gemini is
// unavailable locally.
func EvalOralBoards() OralBoardsPolicy {
	policy := GatewayOralBoards()
	policy.Scorer = Policy{
		Provider: "mistral", Model: "mistral-medium-latest", RequestsPerMinute: 20,
		missingProviderMessage: "MISTRAL_API_KEY is required to configure oralboards",
	}
	policy.AllowQuestionerCaseBuilderFallback = true
	return policy
}

// Telegram returns the intentionally separate all-Mistral policy used for
// every Telegram specialist and the routing orchestrator.
func Telegram() Policy {
	return Policy{
		Provider: "mistral", Model: "mistral-medium-latest", RequestsPerMinute: 20,
		missingProviderMessage: "MISTRAL_API_KEY is required for Telegram",
	}
}

// ResolveRequired applies a production policy to configured providers. Its
// fallback list is filtered without reordering so optional provider keys stay
// optional and openai.NewMulti never receives an unavailable fallback name.
func ResolveRequired(providers map[string]config.Provider, policy Policy) (config.Provider, error) {
	provider, ok := providers[policy.Provider]
	if !ok {
		if policy.missingProviderMessage != "" {
			return config.Provider{}, errors.New(policy.missingProviderMessage)
		}
		return config.Provider{}, fmt.Errorf("provider %q is required", policy.Provider)
	}
	provider.Model = policy.Model
	provider.RequestsPerMinute = policy.RequestsPerMinute
	provider.RequestsPerDay = policy.RequestsPerDay
	provider.Fallbacks = configuredFallbacks(providers, policy.Fallbacks)
	return provider, nil
}

// FallbackProviders clones the configured provider map and assigns the exact
// fallback models used by the gateway. Primary policies still override these
// values when the same provider is selected directly.
func FallbackProviders(providers map[string]config.Provider) map[string]config.Provider {
	result := make(map[string]config.Provider, len(providers))
	for name, provider := range providers {
		provider.Fallbacks = append([]string(nil), provider.Fallbacks...)
		result[name] = provider
	}
	if provider, ok := result["mistral"]; ok {
		provider.Model, provider.RequestsPerMinute = "mistral-small-latest", 20
		result["mistral"] = provider
	}
	if provider, ok := result["groq"]; ok {
		provider.Model, provider.RequestsPerMinute = "llama-3.3-70b-versatile", 30
		result["groq"] = provider
	}
	if provider, ok := result["openrouter"]; ok {
		provider.Model, provider.RequestsPerMinute = "tencent/hy3:free", 20
		result["openrouter"] = provider
	}
	return result
}

// ResolveEval applies a policy for local evaluation. If the designated key is
// absent, it preserves evalrun's established deterministic substitution order
// and reports the substitution to the caller.
func ResolveEval(providers map[string]config.Provider, policy Policy) (config.Provider, string, error) {
	if provider, ok := providers[policy.Provider]; ok {
		provider.Model = policy.Model
		provider.RequestsPerMinute = policy.RequestsPerMinute
		provider.RequestsPerDay = policy.RequestsPerDay
		return provider, "", nil
	}
	for _, name := range []string{"openrouter", "mistral", "nvidia", "cerebras"} {
		if name == policy.Provider {
			continue
		}
		provider, ok := providers[name]
		if !ok {
			continue
		}
		provider.Model = evalDefaultModel(name)
		provider.RequestsPerMinute = policy.RequestsPerMinute
		provider.RequestsPerDay = policy.RequestsPerDay
		note := policy.Provider + " unavailable locally; substituted " + name + "/" + provider.Model + " for eval"
		return provider, note, nil
	}
	return config.Provider{}, "", errors.New("no provider available to substitute for " + policy.Provider)
}

func openRouterLight(missingProviderMessage string, fallbacks ...string) Policy {
	return Policy{
		Provider: "openrouter", Model: "tencent/hy3:free", RequestsPerMinute: 20, RequestsPerDay: 1000,
		Fallbacks: append([]string(nil), fallbacks...), missingProviderMessage: missingProviderMessage,
	}
}

func groqStandard(missingProviderMessage string) Policy {
	return Policy{
		Provider: "groq", Model: "llama-3.3-70b-versatile", RequestsPerMinute: 30,
		Fallbacks: []string{"mistral", "openrouter"}, missingProviderMessage: missingProviderMessage,
	}
}

func configuredFallbacks(providers map[string]config.Provider, fallbacks []string) []string {
	if fallbacks == nil {
		return nil
	}
	result := make([]string, 0, len(fallbacks))
	for _, name := range fallbacks {
		if _, ok := providers[name]; ok {
			result = append(result, name)
		}
	}
	return result
}

func evalDefaultModel(provider string) string {
	switch provider {
	case "openrouter":
		return "tencent/hy3:free"
	case "mistral":
		return "mistral-large-latest"
	case "nvidia":
		return "nvidia/nemotron-3-super-120b-a12b"
	case "cerebras":
		return "gpt-oss-120b"
	default:
		return ""
	}
}
