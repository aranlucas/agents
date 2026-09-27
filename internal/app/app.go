// Package app is the composition root shared by every process mode. It opens
// persistence once and builds the authored agents from one validated
// config.Config, so the gateway and the Telegram worker cannot drift apart.
package app

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/aranlucas/agents/internal/bravesearch"
	"github.com/aranlucas/agents/internal/common"
	"github.com/aranlucas/agents/internal/config"
	"github.com/aranlucas/agents/internal/fitnessdata"
	"github.com/aranlucas/agents/internal/groceries"
	"github.com/aranlucas/agents/internal/providerpolicy"
	"github.com/aranlucas/agents/internal/rate"
	"github.com/aranlucas/agents/internal/storage"
	"github.com/aranlucas/agents/internal/telegram"

	"google.golang.org/adk/v2/artifact"
	"google.golang.org/adk/v2/session"
)

// Runtime holds the process-wide collaborators every mode shares.
type Runtime struct {
	Config    config.Config
	DB        *storage.DB
	Sessions  session.Service
	Artifacts artifact.Service
	Pending   *storage.PendingStore
	Limiter   *rate.ProviderLimiter
	Groceries *groceries.Store
	Fitness   *fitnessdata.Store
	Links     *telegram.LinkStore
	// ModelHTTP is shared by every OpenAI-compatible model client.
	ModelHTTP *http.Client
	// Brave is nil when BRAVE_API_KEY is unset; agents degrade to no search.
	Brave *bravesearch.Client
}

// Open opens and migrates the database, then constructs the shared stores.
// Migrations run here because Railway does not mount volumes during
// pre-deploy; they are idempotent and fast on a local file.
func Open(ctx context.Context, cfg config.Config) (*Runtime, error) {
	db, err := storage.Open(cfg.DatabasePath)
	if err != nil {
		return nil, err
	}
	rt, err := newRuntime(ctx, cfg, db)
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	return rt, nil
}

func newRuntime(ctx context.Context, cfg config.Config, db *storage.DB) (*Runtime, error) {
	if err := db.Migrate(ctx); err != nil {
		return nil, fmt.Errorf("migrate database: %w", err)
	}
	sessions, err := db.NewSessionService()
	if err != nil {
		return nil, err
	}
	var brave *bravesearch.Client
	if cfg.Integrations.BraveAPIKey != "" {
		brave, err = bravesearch.New(common.NewHTTPClient(15*time.Second, 4<<20).Client, "https://api.search.brave.com/res/v1/web/search", cfg.Integrations.BraveAPIKey, 10)
		if err != nil {
			return nil, fmt.Errorf("configure Brave search: %w", err)
		}
	}
	artifacts := storage.NewArtifactService(db)
	return &Runtime{
		Config:    cfg,
		DB:        db,
		Sessions:  sessions,
		Artifacts: artifacts,
		Pending:   storage.NewPendingStore(db, time.Now),
		Limiter:   rate.NewProviderLimiter(db, time.Now),
		Groceries: groceries.NewStoreWithArtifacts(db, artifacts),
		Fitness:   fitnessdata.NewStore(db),
		Links:     telegram.NewLinkStore(db, time.Now),
		ModelHTTP: common.NewHTTPClient(180*time.Second, 32<<20).Client,
		Brave:     brave,
	}, nil
}

// Close stops background work and releases the database.
func (rt *Runtime) Close() error {
	return errors.Join(rt.Groceries.Close(), rt.DB.Close())
}

// ValidateProviders resolves every agent's model policy against the
// configured provider keys without any network call, so a missing key fails
// startup instead of the first request that needs that agent.
func ValidateProviders(providers map[string]config.Provider) error {
	if _, _, err := resumeProviders(providers); err != nil {
		return fmt.Errorf("resume: %w", err)
	}
	for _, workload := range []providerpolicy.Workload{
		providerpolicy.Presentation, providerpolicy.Research, providerpolicy.Spreadsheet,
		providerpolicy.Expense, providerpolicy.Travel, providerpolicy.Fitness,
		providerpolicy.Grocery, providerpolicy.Trends,
	} {
		if _, err := providerpolicy.ResolveAgent(providers, workload); err != nil {
			return fmt.Errorf("%s: %w", workload, err)
		}
	}
	return nil
}
