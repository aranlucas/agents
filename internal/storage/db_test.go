package storage

import (
	"errors"
	"path/filepath"
	"testing"

	json "encoding/json/v2"

	"github.com/aranlucas/agents/internal/agui"
	"google.golang.org/adk/v2/session"
)

func newTestDB(t *testing.T) *DB {
	t.Helper()
	db, err := Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.Migrate(t.Context()); err != nil {
		t.Fatal(err)
	}
	return db
}

func TestRunReturnsRowsAndDirectChangesPerStatement(t *testing.T) {
	db := newTestDB(t)
	results, err := db.Run(t.Context(),
		Statement{SQL: "CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, note TEXT)"},
		Statement{SQL: "INSERT INTO items (id, name, note) VALUES (?, ?, ?), (?, ?, ?)", Params: []any{1, "a", nil, 2, "b", "x"}},
		Statement{SQL: "SELECT id, name, note FROM items ORDER BY id"},
		Statement{SQL: "UPDATE items SET name = ? WHERE id = ?", Params: []any{"c", 99}},
		Statement{SQL: "DELETE FROM items WHERE id = ? RETURNING id", Params: []any{2}},
	)
	if err != nil {
		t.Fatal(err)
	}
	if got := results[1].Meta.Changes; got != 2 {
		t.Fatalf("insert changes = %d, want 2", got)
	}
	// A read after a write must not inherit the previous statement's count.
	if got := results[2].Meta.Changes; got != 0 {
		t.Fatalf("select changes = %d, want 0", got)
	}
	if got := results[3].Meta.Changes; got != 0 {
		t.Fatalf("no-op update changes = %d, want 0", got)
	}
	if got := results[4].Meta.Changes; got != 1 || len(results[4].Rows) != 1 {
		t.Fatalf("delete returning = %d changes, %d rows", got, len(results[4].Rows))
	}
	var rows []struct {
		ID   int64   `json:"id"`
		Name string  `json:"name"`
		Note *string `json:"note"`
	}
	if err := decodeRows(results, 2, &rows); err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 || rows[0].Name != "a" || rows[0].Note != nil || rows[1].Note == nil || *rows[1].Note != "x" {
		t.Fatalf("rows = %+v", rows)
	}
}

func TestRunRollsBackTheWholeBatchOnFailure(t *testing.T) {
	db := newTestDB(t)
	if _, err := db.Run(t.Context(), Statement{SQL: "CREATE TABLE items (id INTEGER PRIMARY KEY)"}); err != nil {
		t.Fatal(err)
	}
	_, err := db.Run(t.Context(),
		Statement{SQL: "INSERT INTO items (id) VALUES (1)"},
		Statement{SQL: "INSERT INTO items (id) VALUES (1)"},
	)
	if err == nil {
		t.Fatal("duplicate insert succeeded")
	}
	results, err := db.Run(t.Context(), Statement{SQL: "SELECT COUNT(*) AS n FROM items"})
	if err != nil {
		t.Fatal(err)
	}
	var count []struct {
		N int `json:"n"`
	}
	if err := decodeRows(results, 0, &count); err != nil || count[0].N != 0 {
		t.Fatalf("rows after rollback = %+v, %v", count, err)
	}
}

func TestRunEnforcesForeignKeys(t *testing.T) {
	db := newTestDB(t)
	_, err := db.Run(t.Context(), Statement{
		SQL:    "INSERT INTO grocery_list_items (id, list_id, name, quantity, position, added_by, updated_at) VALUES ('i', 'missing', 'milk', '1', 0, 'u', 0)",
		Params: nil,
	})
	if err == nil {
		t.Fatal("insert referencing a missing list succeeded")
	}
}

func TestMigrateIsIdempotentAndSchemaIsHealthy(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "agents.db")
	db, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()
	if err := db.SchemaHealth(t.Context()); !errors.Is(err, ErrSchemaNotReady) {
		t.Fatalf("empty schema health = %v", err)
	}
	for range 2 {
		if err := db.Migrate(t.Context()); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Health(t.Context()); err != nil {
		t.Fatal(err)
	}
	if LatestMigrationVersion != migrations[len(migrations)-1].version || len(migrations) < 10 {
		t.Fatalf("latest = %q of %d migrations", LatestMigrationVersion, len(migrations))
	}
	if _, err := db.Run(t.Context(), Statement{SQL: "DELETE FROM schema_migrations WHERE version = ?", Params: []any{LatestMigrationVersion}}); err != nil {
		t.Fatal(err)
	}
	if err := db.SchemaHealth(t.Context()); !errors.Is(err, ErrSchemaNotReady) {
		t.Fatalf("schema health with a missing version = %v", err)
	}
}

func TestMigrationVersionsAreSortedFileNames(t *testing.T) {
	for index, item := range migrations {
		if index > 0 && migrations[index-1].version >= item.version {
			t.Fatalf("migration %q is not after %q", item.version, migrations[index-1].version)
		}
		if len(splitMigrationStatements(item.source)) == 0 {
			t.Fatalf("migration %q has no statements", item.version)
		}
	}
}

func TestSessionServicePersistsEventsAndExposesActiveRuns(t *testing.T) {
	db := newTestDB(t)
	service, err := db.NewSessionService()
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := any(service).(agui.ActiveRunStore); !ok {
		t.Fatal("session service does not implement agui.ActiveRunStore")
	}
	created, err := service.Create(t.Context(), &session.CreateRequest{AppName: "resume_agent", UserID: "user-1", SessionID: "thread-1", State: map[string]any{"step": "intro"}})
	if err != nil {
		t.Fatal(err)
	}
	event := session.NewEvent(t.Context(), "invocation-1")
	event.Author = "resume_agent"
	event.Actions.StateDelta = map[string]any{"step": "done"}
	if err := service.AppendEvent(t.Context(), created.Session, event); err != nil {
		t.Fatal(err)
	}

	reopened, err := db.NewSessionService()
	if err != nil {
		t.Fatal(err)
	}
	got, err := reopened.Get(t.Context(), &session.GetRequest{AppName: "resume_agent", UserID: "user-1", SessionID: "thread-1"})
	if err != nil {
		t.Fatal(err)
	}
	step, err := got.Session.State().Get("step")
	if err != nil || step != "done" || got.Session.Events().Len() != 1 {
		encoded, _ := json.Marshal(step)
		t.Fatalf("session step = %s (%v), events = %d", encoded, err, got.Session.Events().Len())
	}
	if _, err := reopened.Get(t.Context(), &session.GetRequest{AppName: "resume_agent", UserID: "user-2", SessionID: "thread-1"}); err == nil {
		t.Fatal("another user's session was readable")
	}
}
