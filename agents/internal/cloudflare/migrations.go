package cloudflare

import (
	"context"
	"fmt"
	"strings"
	"time"

	d1migrations "github.com/aranlucas/agents/agents/migrations/d1"
)

// RunMigrations applies the embedded idempotent D1 schema.
func (d *D1) RunMigrations(ctx context.Context) error {
	var statements []Statement
	for sql := range strings.SplitSeq(d1migrations.Initial, ";") {
		if sql = strings.TrimSpace(sql); sql != "" {
			statements = append(statements, Statement{SQL: sql})
		}
	}
	statements = append(statements, Statement{
		SQL:    "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)",
		Params: []any{"001_initial", time.Now().UTC().UnixMilli()},
	})
	if _, err := d.Run(ctx, statements...); err != nil {
		return fmt.Errorf("apply D1 migrations: %w", err)
	}
	return nil
}
