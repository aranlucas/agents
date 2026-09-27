package storage

import (
	"context"
	json "encoding/json/v2"
	"fmt"
	"io/fs"
	"path"
	"slices"
	"strings"
	"time"

	sqlmigrations "github.com/aranlucas/agents/migrations/sqlite"
	"google.golang.org/adk/v2/session/database"
)

type migration struct {
	version string
	source  string
}

// migrations are the embedded *.sql files in filename order. A file's version
// is its name without the extension; append new files, never edit applied ones.
var migrations = func() []migration {
	names, err := fs.Glob(sqlmigrations.FS, "*.sql")
	if err != nil || len(names) == 0 {
		panic(fmt.Sprintf("no embedded migrations: %v", err))
	}
	slices.Sort(names)
	result := make([]migration, 0, len(names))
	for _, name := range names {
		source, err := fs.ReadFile(sqlmigrations.FS, name)
		if err != nil {
			panic(fmt.Sprintf("read migration %s: %v", name, err))
		}
		result = append(result, migration{version: strings.TrimSuffix(path.Base(name), ".sql"), source: string(source)})
	}
	return result
}()

// LatestMigrationVersion is the newest embedded schema version.
var LatestMigrationVersion = migrations[len(migrations)-1].version

// adkSessionTables are owned by ADK's session service, not by migrations.
var adkSessionTables = []string{"sessions", "events", "app_states", "user_states"}

// Migrate applies the embedded migrations and ADK's session schema. It is
// idempotent and runs at every gateway start.
func (d *DB) Migrate(ctx context.Context) error {
	for _, item := range migrations {
		if err := d.runMigration(ctx, item.version, item.source); err != nil {
			return err
		}
	}
	service, err := d.adkSessionService()
	if err != nil {
		return err
	}
	if err := database.AutoMigrate(service); err != nil {
		return fmt.Errorf("migrate session tables: %w", err)
	}
	return nil
}

func (d *DB) runMigration(ctx context.Context, version, source string) error {
	statements := make([]Statement, 0)
	for _, sql := range splitMigrationStatements(source) {
		statements = append(statements, Statement{SQL: sql})
	}
	statements = append(statements, Statement{
		SQL:    "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)",
		Params: []any{version, time.Now().UTC().UnixMilli()},
	})
	if _, err := d.Run(ctx, statements...); err != nil {
		return fmt.Errorf("apply migration %s: %w", version, err)
	}
	return nil
}

// SchemaHealth verifies every migration marker and the ADK session tables. It
// reads SQLite metadata only, never tenant data.
func (d *DB) SchemaHealth(ctx context.Context) error {
	versions := make([]any, 0, len(migrations))
	for _, item := range migrations {
		versions = append(versions, item.version)
	}
	tables := make([]any, 0, len(adkSessionTables))
	for _, table := range adkSessionTables {
		tables = append(tables, table)
	}
	results, err := d.Run(ctx,
		Statement{SQL: "SELECT COUNT(*) AS present FROM schema_migrations WHERE version IN (" + placeholders(len(versions)) + ")", Params: versions},
		Statement{SQL: "SELECT COUNT(*) AS present FROM sqlite_schema WHERE type = 'table' AND name IN (" + placeholders(len(tables)) + ")", Params: tables},
	)
	if err != nil || len(results) != 2 {
		return ErrSchemaNotReady
	}
	for index, want := range []int{len(versions), len(tables)} {
		if len(results[index].Rows) != 1 {
			return ErrSchemaNotReady
		}
		var row struct {
			Present int `json:"present"`
		}
		if json.Unmarshal(results[index].Rows[0], &row) != nil || row.Present != want {
			return ErrSchemaNotReady
		}
	}
	return nil
}

func placeholders(count int) string {
	return strings.TrimSuffix(strings.Repeat("?,", count), ",")
}

// splitMigrationStatements preserves CREATE TRIGGER bodies, whose internal
// semicolons are not statement terminators. Migrations keep one top-level
// statement terminator at the end of a line.
func splitMigrationStatements(source string) []string {
	var statements []string
	var current strings.Builder
	inTrigger := false
	flush := func() {
		statement := strings.TrimSpace(current.String())
		statement = strings.TrimSpace(strings.TrimSuffix(statement, ";"))
		if statement != "" {
			statements = append(statements, statement)
		}
		current.Reset()
	}
	for line := range strings.SplitSeq(source, "\n") {
		trimmed := strings.TrimSpace(line)
		if !inTrigger && strings.HasPrefix(strings.ToUpper(trimmed), "CREATE TRIGGER ") {
			inTrigger = true
		}
		current.WriteString(line)
		current.WriteByte('\n')
		if inTrigger {
			if strings.EqualFold(trimmed, "END;") {
				flush()
				inTrigger = false
			}
			continue
		}
		if strings.HasSuffix(trimmed, ";") {
			flush()
		}
	}
	flush()
	return statements
}
