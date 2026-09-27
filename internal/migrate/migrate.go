// Package migrate applies the embedded SQLite migrations and verifies the
// resulting schema. `agents serve` also migrates at startup; this command
// exists for inspecting or preparing a database file directly.
package migrate

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/aranlucas/agents/internal/config"
	"github.com/aranlucas/agents/internal/storage"
)

const migrationTimeout = 2 * time.Minute

type migrator interface {
	Migrate(context.Context) error
	SchemaHealth(context.Context) error
	Close() error
}

type migratorFactory func(path string) (migrator, error)

// Run migrates the database named by DATABASE_PATH.
func Run(ctx context.Context) error {
	return run(ctx, os.Getenv, func(path string) (migrator, error) { return storage.Open(path) })
}

func run(ctx context.Context, getenv func(string) string, open migratorFactory) error {
	_, path, err := config.LoadDatabase(getenv)
	if err != nil {
		return fmt.Errorf("load configuration: %w", err)
	}
	db, err := open(path)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer func() { _ = db.Close() }()
	ctx, cancel := context.WithTimeout(ctx, migrationTimeout)
	defer cancel()
	if err := db.Migrate(ctx); err != nil {
		return fmt.Errorf("apply migrations: %w", err)
	}
	if err := db.SchemaHealth(ctx); err != nil {
		return fmt.Errorf("verify schema %s: %w", storage.LatestMigrationVersion, err)
	}
	slog.Info("database schema is ready", "path", path, "version", storage.LatestMigrationVersion)
	return nil
}
