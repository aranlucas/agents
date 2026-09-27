// Package providerpolicy owns the model and rate-limit choices for each
// authored agent surface. It does not construct models or agents; commands
// remain responsible for composition and transport-specific behavior.
package providerpolicy

import (
	"errors"
	"fmt"

	"github.com/aranlucas/agents/internal/config"
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
	// Career is shared by the jobs and interview agents.
	Career      Workload = "career"
	Spreadsheet Workload = "spreadsheet"
	Travel      Workload = "travel"
	Trends      Workload = "trends"
	Wellness    Workload = "wellness"

	groqResponsesModel  = "openai/gpt-oss-120b"
	openRouterFreeModel = "openrouter/free"
)

// Policy is one OpenAI-compatible provider selection. Fallbacks are ordered
// and optional: production resolution keeps only providers that are actually
// configured.
type Policy struct {
	Provider          string
	Model             string
	ReasoningEffort   string
	RequestsPerMinute int
	Fallbacks         []string

	missingProviderMessage string
}

// Agent returns the gateway policy for an authored workload.
func Agent(workload Workload) (Policy, error) {
	switch workload {
	case Expense:
		return openRouterLight("OPENROUTER_API_KEY is required to configure the expense agent", "groq"), nil
	case Fitness:
		return groqStandard("GROQ_API_KEY is required to configure the fitness agent"), nil
	case Grocery:
		return Policy{
			Provider: "groq", Model: groqResponsesModel, RequestsPerMinute: 20,
			Fallbacks:              []string{"openrouter"},
			missingProviderMessage: "GROQ_API_KEY is required to configure the grocery agent",
		}, nil
	case Presentation:
		return groqStandard("GROQ_API_KEY is required to configure the presentation agent"), nil
	case Research:
		return openRouterLight("OPENROUTER_API_KEY is required to configure the research agent", "groq"), nil
	case Career:
		return openRouterLight("OPENROUTER_API_KEY is required to configure the jobs and interview agents", "groq"), nil
	case Spreadsheet:
		return groqStandard("GROQ_API_KEY is required to configure the spreadsheet agent"), nil
	case Travel:
		return openRouterLight("OPENROUTER_API_KEY is required to configure the travel agent", "groq"), nil
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

// Telegram returns the intentionally separate policy used for every Telegram
// specialist and the routing orchestrator.
func Telegram() Policy {
	return Policy{
		Provider: "groq", Model: groqResponsesModel, RequestsPerMinute: 20,
		missingProviderMessage: "GROQ_API_KEY is required for Telegram",
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
	provider.ReasoningEffort = policy.ReasoningEffort
	provider.RequestsPerMinute = policy.RequestsPerMinute
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
	if provider, ok := result["groq"]; ok {
		provider.Model, provider.RequestsPerMinute = groqResponsesModel, 30
		result["groq"] = provider
	}
	if provider, ok := result["openrouter"]; ok {
		provider.Model, provider.RequestsPerMinute = openRouterFreeModel, 20
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
		provider.ReasoningEffort = policy.ReasoningEffort
		provider.RequestsPerMinute = policy.RequestsPerMinute
		return provider, "", nil
	}
	for _, name := range []string{"openrouter", "groq"} {
		if name == policy.Provider {
			continue
		}
		provider, ok := providers[name]
		if !ok {
			continue
		}
		provider.Model = evalDefaultModel(name)
		provider.RequestsPerMinute = policy.RequestsPerMinute
		note := policy.Provider + " unavailable locally; substituted " + name + "/" + provider.Model + " for eval"
		return provider, note, nil
	}
	return config.Provider{}, "", errors.New("no provider available to substitute for " + policy.Provider)
}

func openRouterLight(missingProviderMessage string, fallbacks ...string) Policy {
	return Policy{
		Provider: "openrouter", Model: openRouterFreeModel, RequestsPerMinute: 20,
		Fallbacks: append([]string(nil), fallbacks...), missingProviderMessage: missingProviderMessage,
	}
}

func groqStandard(missingProviderMessage string) Policy {
	return Policy{
		Provider: "groq", Model: groqResponsesModel, RequestsPerMinute: 30,
		Fallbacks: []string{"openrouter"}, missingProviderMessage: missingProviderMessage,
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
		return openRouterFreeModel
	case "groq":
		return groqResponsesModel
	default:
		return ""
	}
}
