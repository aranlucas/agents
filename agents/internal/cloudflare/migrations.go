package cloudflare

import (
	"context"
	"fmt"
	"strings"
	"time"

	d1migrations "agents/migrations/d1"
)

// RunMigrations applies the embedded idempotent D1 schema.
func (d *D1) RunMigrations(ctx context.Context) error {
	if err := d.runMigration(ctx, "001_initial", d1migrations.Initial); err != nil {
		return err
	}
	if err := d.runMigration(ctx, "002_telegram_links", d1migrations.TelegramLinks); err != nil {
		return err
	}
	if err := d.runMigration(ctx, "003_fitness_activities", d1migrations.FitnessActivities); err != nil {
		return err
	}
	return nil
}

func (d *D1) runMigration(ctx context.Context, version, source string) error {
	var statements []Statement
	for sql := range strings.SplitSeq(source, ";") {
		if sql = strings.TrimSpace(sql); sql != "" {
			statements = append(statements, Statement{SQL: sql})
		}
	}
	statements = append(statements, Statement{
		SQL:    "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)",
		Params: []any{version, time.Now().UTC().UnixMilli()},
	})
	if _, err := d.Run(ctx, statements...); err != nil {
		return fmt.Errorf("apply D1 migration %s: %w", version, err)
	}
	return nil
}
