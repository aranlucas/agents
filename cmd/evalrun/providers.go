package main

import (
	"context"
	"os"

	"github.com/aranlucas/agents/internal/config"
)

// noopLimiter satisfies openai.Limiter without any real rate limiting —
// eval runs are a handful of local calls, not production traffic.
type noopLimiter struct{}

func (noopLimiter) Acquire(context.Context, string, int) error { return nil }

// loadEvalProviders reads provider API keys directly from the environment,
// independent of agents/internal/config.Load (which also requires
// Cloudflare D1/R2 credentials that eval does not need).
func loadEvalProviders() map[string]config.Provider {
	return config.LoadProviders(os.Getenv)
}
