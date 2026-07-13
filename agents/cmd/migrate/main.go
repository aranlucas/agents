// Command migrate applies the embedded D1 migration history and verifies the
// resulting schema before a gateway or Telegram deployment is started.
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"agents/internal/cloudflare"
	"agents/internal/config"
)

const migrationTimeout = 2 * time.Minute

type migrator interface {
	RunMigrations(context.Context) error
	SchemaHealth(context.Context) error
}

type migratorFactory func(config.Cloudflare) (migrator, error)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, os.Getenv, func(cfg config.Cloudflare) (migrator, error) {
		return cloudflare.NewD1(cfg, nil)
	}); err != nil {
		log.Fatalf("migrate D1: %v", err)
	}
	log.Printf("D1 schema is ready at %s", cloudflare.LatestMigrationVersion)
}

func run(ctx context.Context, getenv func(string) string, newMigrator migratorFactory) error {
	if newMigrator == nil {
		return fmt.Errorf("migrator factory is required")
	}
	_, cloudflareConfig, err := config.LoadD1(getenv)
	if err != nil {
		return fmt.Errorf("load configuration: %w", err)
	}
	client, err := newMigrator(cloudflareConfig)
	if err != nil {
		return fmt.Errorf("configure D1: %w", err)
	}
	migrationCtx, cancel := context.WithTimeout(ctx, migrationTimeout)
	defer cancel()
	if err := client.RunMigrations(migrationCtx); err != nil {
		return fmt.Errorf("apply migrations: %w", err)
	}
	if err := client.SchemaHealth(migrationCtx); err != nil {
		return fmt.Errorf("verify schema %s: %w", cloudflare.LatestMigrationVersion, err)
	}
	return nil
}
