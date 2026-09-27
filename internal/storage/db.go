// Package storage implements the service's SQLite persistence: application
// tables behind the Statement batch seam, ADK sessions through ADK's own
// GORM session service, and versioned ADK artifacts.
package storage

import (
	"context"
	"database/sql"
	"encoding/json/jsontext"
	json "encoding/json/v2"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/glebarez/sqlite"
	"google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/session/database"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// ErrSchemaNotReady means the database is reachable but does not have the
// complete migration history and tables required by this binary.
var ErrSchemaNotReady = errors.New("database schema is not ready")

// Statement is one parameterized SQL statement.
type Statement struct {
	SQL    string
	Params []any
}

// Result contains the rows (one JSON object per row, keyed by column name)
// and the number of rows the statement itself changed.
type Result struct {
	Rows    []jsontext.Value
	Success bool
	Meta    struct {
		Changes int64
	}
}

// StatementRunner is the batch-query seam used by stores and tests.
type StatementRunner interface {
	Run(context.Context, ...Statement) ([]Result, error)
}

// DB is the process's single SQLite database.
type DB struct {
	sql *sql.DB
}

var _ StatementRunner = (*DB)(nil)

// Open opens (creating if needed) the SQLite database at path. Use ":memory:"
// for an ephemeral database in tests.
func Open(path string) (*DB, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil, errors.New("database path is required")
	}
	dsn := ":memory:"
	if path != ":memory:" {
		if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
			return nil, fmt.Errorf("create database directory: %w", err)
		}
		dsn = "file:" + path
	}
	dsn += "?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)"
	if path != ":memory:" {
		dsn += "&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)"
	}
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	// One connection serializes writers, so batches never race each other into
	// SQLITE_BUSY and an in-memory database is shared by every caller. Queries
	// are short; Run always drains and closes its rows before returning.
	db.SetMaxOpenConns(1)
	db.SetConnMaxIdleTime(0)
	return &DB{sql: db}, nil
}

// Close releases the database.
func (d *DB) Close() error { return d.sql.Close() }

// SQL exposes the underlying handle for tests that seed fixtures directly.
func (d *DB) SQL() *sql.DB { return d.sql }

// Run executes the statements in order inside one transaction and commits only
// if all succeed, matching the batch semantics the stores were written for.
func (d *DB) Run(ctx context.Context, statements ...Statement) ([]Result, error) {
	if len(statements) == 0 {
		return nil, errors.New("at least one statement is required")
	}
	tx, err := d.sql.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	var total int64
	if err := tx.QueryRowContext(ctx, "SELECT total_changes()").Scan(&total); err != nil {
		return nil, fmt.Errorf("read change counter: %w", err)
	}
	results := make([]Result, len(statements))
	for index, statement := range statements {
		rows, err := queryRows(ctx, tx, statement)
		if err != nil {
			return nil, fmt.Errorf("statement %d: %w", index, err)
		}
		results[index].Rows = rows
		results[index].Success = true
		// changes() still reports the last write after a read, so only trust
		// it when the connection's total moved during this statement.
		var nextTotal, changes int64
		if err := tx.QueryRowContext(ctx, "SELECT total_changes(), changes()").Scan(&nextTotal, &changes); err != nil {
			return nil, fmt.Errorf("read change counter: %w", err)
		}
		if nextTotal != total {
			results[index].Meta.Changes = changes
		}
		total = nextTotal
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit transaction: %w", err)
	}
	return results, nil
}

func queryRows(ctx context.Context, tx *sql.Tx, statement Statement) ([]jsontext.Value, error) {
	rows, err := tx.QueryContext(ctx, statement.SQL, statement.Params...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	columns, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	var encoded []jsontext.Value
	values := make([]any, len(columns))
	pointers := make([]any, len(columns))
	for index := range values {
		pointers[index] = &values[index]
	}
	for rows.Next() {
		if err := rows.Scan(pointers...); err != nil {
			return nil, err
		}
		row := make(map[string]any, len(columns))
		for index, column := range columns {
			if raw, ok := values[index].([]byte); ok {
				row[column] = string(raw)
				continue
			}
			row[column] = values[index]
		}
		value, err := json.Marshal(row)
		if err != nil {
			return nil, err
		}
		encoded = append(encoded, value)
	}
	return encoded, rows.Err()
}

// SessionService is ADK's GORM session service on this database, extended
// with the AG-UI active-run store (agui.ActiveRunStore) that the gateway's
// runner discovers by type assertion.
type SessionService struct {
	session.Service
	db  StatementRunner
	now func() time.Time
}

// NewSessionService returns the session service. Its ADK tables (sessions,
// events, app_states, user_states) are created by Migrate.
func (d *DB) NewSessionService() (*SessionService, error) {
	adk, err := d.adkSessionService()
	if err != nil {
		return nil, err
	}
	return &SessionService{Service: adk, db: d, now: time.Now}, nil
}

func (d *DB) adkSessionService() (session.Service, error) {
	gormDB, err := d.gorm()
	if err != nil {
		return nil, err
	}
	return database.NewSessionServiceFromDB(gormDB)
}

func (d *DB) gorm() (*gorm.DB, error) {
	gormDB, err := gorm.Open(sqlite.Dialector{Conn: d.sql}, &gorm.Config{
		Logger: logger.New(gormLogWriter{}, logger.Config{
			SlowThreshold:             time.Second,
			LogLevel:                  logger.Warn,
			IgnoreRecordNotFoundError: true,
		}),
	})
	if err != nil {
		return nil, fmt.Errorf("open session store: %w", err)
	}
	return gormDB, nil
}

type gormLogWriter struct{}

func (gormLogWriter) Printf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
}

// Liveness verifies that the database accepts a bounded query.
func (d *DB) Liveness(ctx context.Context) error {
	_, err := d.Run(ctx, Statement{SQL: "SELECT 1 AS ok"})
	return err
}

// Health is the readiness check: every migration applied and every required
// table present.
func (d *DB) Health(ctx context.Context) error { return d.SchemaHealth(ctx) }
