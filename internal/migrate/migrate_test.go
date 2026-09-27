package migrate

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/aranlucas/agents/internal/cloudflare"
	"github.com/aranlucas/agents/internal/config"
)

type fakeMigrator struct {
	migrateErr, healthErr error
	migrations, health    int
}

func (f *fakeMigrator) RunMigrations(context.Context) error {
	f.migrations++
	return f.migrateErr
}

func (f *fakeMigrator) SchemaHealth(context.Context) error {
	f.health++
	return f.healthErr
}

func TestRunMigratesThenVerifiesSchema(t *testing.T) {
	env := migrationEnv()
	fake := &fakeMigrator{}
	err := run(t.Context(), func(key string) string { return env[key] }, func(cfg config.Cloudflare) (migrator, error) {
		if cfg.D1DatabaseID != "database" || cfg.R2Bucket != "" {
			t.Fatalf("Cloudflare config = %#v", cfg)
		}
		return fake, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if fake.migrations != 1 || fake.health != 1 {
		t.Fatalf("calls = migrations:%d health:%d", fake.migrations, fake.health)
	}
}

func TestRunFailsClosed(t *testing.T) {
	for name, testCase := range map[string]struct {
		fake        *fakeMigrator
		want        string
		healthCalls int
	}{
		"migration failure": {fake: &fakeMigrator{migrateErr: errors.New("unavailable")}, want: "apply migrations", healthCalls: 0},
		"schema failure":    {fake: &fakeMigrator{healthErr: cloudflare.ErrSchemaNotReady}, want: cloudflare.LatestMigrationVersion, healthCalls: 1},
	} {
		t.Run(name, func(t *testing.T) {
			env := migrationEnv()
			err := run(t.Context(), func(key string) string { return env[key] }, func(config.Cloudflare) (migrator, error) {
				return testCase.fake, nil
			})
			if err == nil || !strings.Contains(err.Error(), testCase.want) {
				t.Fatalf("run() error = %v", err)
			}
			if testCase.fake.migrations != 1 || testCase.fake.health != testCase.healthCalls {
				t.Fatalf("calls = migrations:%d health:%d", testCase.fake.migrations, testCase.fake.health)
			}
		})
	}
}

func TestRunValidatesConfigurationBeforeBuildingClient(t *testing.T) {
	called := false
	err := run(t.Context(), func(string) string { return "" }, func(config.Cloudflare) (migrator, error) {
		called = true
		return &fakeMigrator{}, nil
	})
	if err == nil || !strings.Contains(err.Error(), "APP_ENV") || called {
		t.Fatalf("run() error = %v, factory called = %v", err, called)
	}
}

func migrationEnv() map[string]string {
	return map[string]string{
		"APP_ENV":           "test",
		"CF_ACCOUNT_ID":     "account",
		"CF_API_TOKEN":      "token",
		"CF_D1_DATABASE_ID": "database",
	}
}
