package main

import (
	"context"
	"errors"
	"os"
	"strings"

	"agents/internal/config"
)

// noopLimiter satisfies openai.Limiter without any real rate limiting —
// eval runs are a handful of local calls, not production traffic.
type noopLimiter struct{}

func (noopLimiter) Acquire(context.Context, string, int) error { return nil }

var providerEnvs = []struct{ name, key, baseURL string }{
	{"cerebras", "CEREBRAS_API_KEY", "https://api.cerebras.ai/v1"},
	{"groq", "GROQ_API_KEY", "https://api.groq.com/openai/v1"},
	{"nvidia", "NVIDIA_NIM_API_KEY", "https://integrate.api.nvidia.com/v1"},
	{"mistral", "MISTRAL_API_KEY", "https://api.mistral.ai/v1"},
	{"openrouter", "OPENROUTER_API_KEY", "https://openrouter.ai/api/v1"},
}

// evalDefaultModels gives each substitutable provider a reasonable
// free/cheap-tier model when it is used as an eval-only stand-in for a
// production provider whose key is unavailable locally.
var evalDefaultModels = map[string]string{
	"openrouter": "tencent/hy3:free",
	"mistral":    "mistral-large-latest",
	"nvidia":     "nvidia/nemotron-3-super-120b-a12b",
	"cerebras":   "gpt-oss-120b",
}

// substitutionPriority is the order eval falls back through when an
// agent's designated production provider key is not configured locally.
var substitutionPriority = []string{"openrouter", "mistral", "nvidia", "cerebras"}

// loadEvalProviders reads provider API keys directly from the environment,
// independent of agents/internal/config.Load (which also requires
// Cloudflare D1/R2 credentials that eval does not need).
func loadEvalProviders() map[string]config.Provider {
	providers := make(map[string]config.Provider)
	for _, item := range providerEnvs {
		key := strings.TrimSpace(os.Getenv(item.key))
		if key == "" {
			continue
		}
		providers[item.name] = config.Provider{Name: item.name, BaseURL: item.baseURL, APIKey: key}
	}
	return providers
}

// resolveProvider returns the named provider configured with model/rpm/rpd
// if its key is present locally. Otherwise it substitutes the first
// available provider from substitutionPriority and reports the swap so
// callers can surface it in the eval report.
func resolveProvider(providers map[string]config.Provider, preferred, model string, rpm, rpd int) (config.Provider, string, error) {
	if p, ok := providers[preferred]; ok {
		p.Model, p.RequestsPerMinute, p.RequestsPerDay = model, rpm, rpd
		return p, "", nil
	}
	for _, name := range substitutionPriority {
		if name == preferred {
			continue
		}
		if p, ok := providers[name]; ok {
			p.Model = evalDefaultModels[name]
			p.RequestsPerMinute, p.RequestsPerDay = rpm, rpd
			note := preferred + " unavailable locally; substituted " + name + "/" + p.Model + " for eval"
			return p, note, nil
		}
	}
	return config.Provider{}, "", errors.New("no provider available to substitute for " + preferred)
}
