// Package rate implements distributed provider request limits backed by D1.
package rate

import (
	"context"
	json "encoding/json/v2"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/aranlucas/agents/internal/cloudflare"
)

// ErrLimitReached indicates that the provider's current minute window is full.
var ErrLimitReached = errors.New("provider rate limit reached")

type limitRow struct {
	RequestCount int `json:"request_count"`
}

// Clock returns the current time and allows deterministic window tests.
type Clock func() time.Time

// ProviderLimiter coordinates limits across gateway instances through D1.
type ProviderLimiter struct {
	d1    *cloudflare.D1
	clock Clock
}

// NewProviderLimiter constructs a distributed fixed-window limiter.
func NewProviderLimiter(d1 *cloudflare.D1, clock Clock) *ProviderLimiter {
	if clock == nil {
		clock = time.Now
	}
	return &ProviderLimiter{d1: d1, clock: clock}
}

// Acquire atomically consumes one request from the provider's minute window.
// It never sleeps: callers can immediately choose a configured fallback.
func (l *ProviderLimiter) Acquire(ctx context.Context, provider string, maximum int) error {
	provider = strings.TrimSpace(provider)
	if provider == "" || len(provider) > 128 {
		return errors.New("provider name is required")
	}
	if maximum <= 0 {
		return errors.New("provider limit must be positive")
	}
	if l == nil || l.d1 == nil {
		return errors.New("D1 provider limiter is required")
	}
	now := l.clock().UTC()
	window := now.Truncate(time.Minute).Unix()
	results, err := l.d1.Run(
		ctx,
		cloudflare.Statement{SQL: "DELETE FROM provider_limits WHERE expires_at <= ?", Params: []any{now.Unix()}},
		cloudflare.Statement{
			SQL: `INSERT INTO provider_limits (provider, minute_window, request_count, expires_at)
				VALUES (?, ?, 1, ?)
				ON CONFLICT(provider, minute_window) DO UPDATE SET request_count = request_count + 1
				WHERE request_count < ? RETURNING request_count`,
			Params: []any{provider, window, now.Add(2 * time.Minute).Unix(), maximum},
		},
	)
	if err != nil {
		return fmt.Errorf("acquire provider limit: %w", err)
	}
	if len(results) < 2 || len(results[1].Rows) == 0 {
		return ErrLimitReached
	}
	var row limitRow
	if err := json.Unmarshal(results[1].Rows[0], &row); err != nil || row.RequestCount <= 0 || row.RequestCount > maximum {
		return errors.New("decode provider limit")
	}
	return nil
}
