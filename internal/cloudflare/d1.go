// Package cloudflare implements the gateway's mandatory D1 and R2 services.
package cloudflare

import (
	"context"
	"encoding/json/jsontext"
	json "encoding/json/v2"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/aranlucas/agents/internal/config"
	cfapi "github.com/cloudflare/cloudflare-go/v7"
	"github.com/cloudflare/cloudflare-go/v7/d1"
	"github.com/cloudflare/cloudflare-go/v7/option"
)

const (
	defaultD1Timeout = 10 * time.Second
)

// ErrSchemaNotReady means D1 is reachable but does not have the complete
// migration history and tables required by this binary.
var ErrSchemaNotReady = errors.New("D1 schema is not ready")

// Statement is one parameterized D1 SQL statement.
type Statement struct {
	SQL    string `json:"sql"`
	Params []any  `json:"params,omitempty"`
}

// Result contains rows and mutation metadata returned for a statement.
type Result struct {
	Rows    []jsontext.Value `json:"results"`
	Success bool             `json:"success"`
	Meta    struct {
		Changes int64 `json:"changes"`
	} `json:"meta"`
}

// StatementRunner is the D1 batch-query seam used by stores and tests.
type StatementRunner interface {
	Run(context.Context, ...Statement) ([]Result, error)
}

// D1 is a bounded client for Cloudflare's D1 SQL API.
type D1 struct {
	client     *cfapi.Client
	accountID  string
	databaseID string
}

// NewD1 creates a D1 client using Cloudflare's production API endpoint.
func NewD1(cfg config.Cloudflare, client *http.Client) (*D1, error) {
	return newD1(cfg, client, "")
}

func newD1(cfg config.Cloudflare, client *http.Client, baseURL string) (*D1, error) {
	if strings.TrimSpace(cfg.AccountID) == "" || strings.TrimSpace(cfg.D1DatabaseID) == "" || strings.TrimSpace(cfg.APIToken) == "" {
		return nil, errors.New("D1 account, database, and API token are required")
	}
	if client == nil {
		client = &http.Client{Timeout: defaultD1Timeout}
	} else if client.Timeout <= 0 {
		bounded := *client
		bounded.Timeout = defaultD1Timeout
		client = &bounded
	}
	// A D1 batch may commit even when its HTTP response is lost. Retrying that
	// request can replay non-idempotent event inserts, so keep retry ownership
	// at higher-level operations that can reload session state safely.
	opts := []option.RequestOption{option.WithAPIToken(cfg.APIToken), option.WithHTTPClient(client), option.WithMaxRetries(0)}
	if baseURL != "" {
		opts = append(opts, option.WithBaseURL(baseURL))
	}
	return &D1{client: cfapi.NewClient(opts...), accountID: cfg.AccountID, databaseID: cfg.D1DatabaseID}, nil
}

var _ StatementRunner = (*D1)(nil)

// Run executes one or more parameterized statements as a single D1 request.
func (d *D1) Run(ctx context.Context, statements ...Statement) ([]Result, error) {
	if len(statements) == 0 {
		return nil, errors.New("at least one D1 statement is required")
	}
	page, err := d.client.D1.Database.Query(ctx, d.databaseID, d1.DatabaseQueryParams{
		AccountID: cfapi.F(d.accountID),
		Body:      d1.DatabaseQueryParamsBody{Batch: cfapi.F[any](statements)},
	})
	if err != nil {
		return nil, safeD1QueryError(err)
	}
	results := make([]Result, len(page.Result))
	for i, sdkResult := range page.Result {
		if !sdkResult.Success {
			return nil, errors.New("D1 statement failed")
		}
		rowsJSON, err := json.Marshal(sdkResult.Results)
		if err != nil || json.Unmarshal(rowsJSON, &results[i].Rows) != nil {
			return nil, errors.New("decode D1 rows")
		}
		results[i].Success = sdkResult.Success
		results[i].Meta.Changes = int64(sdkResult.Meta.Changes)
	}
	return results, nil
}

// safeD1QueryError preserves cancellation and safe failure metadata without
// retaining SDK errors, which can expose SQL, credentials, or response bodies.
func safeD1QueryError(err error) error {
	switch {
	case errors.Is(err, context.Canceled):
		return fmt.Errorf("D1 query canceled: %w", context.Canceled)
	case errors.Is(err, context.DeadlineExceeded):
		return fmt.Errorf("D1 query timed out: %w", context.DeadlineExceeded)
	}
	if apiErr, ok := errors.AsType[*cfapi.Error](err); ok {
		if len(apiErr.Errors) > 0 {
			return fmt.Errorf("D1 query failed (HTTP %d, code %d)", apiErr.StatusCode, apiErr.Errors[0].Code)
		}
		return fmt.Errorf("D1 query failed (HTTP %d)", apiErr.StatusCode)
	}
	if networkErr, ok := errors.AsType[net.Error](err); ok {
		if networkErr.Timeout() {
			return fmt.Errorf("D1 query timed out: %w", context.DeadlineExceeded)
		}
		return errors.New("D1 query failed (network)")
	}
	return errors.New("D1 query failed")
}

// Liveness verifies that the configured D1 database accepts a bounded query.
// Process liveness endpoints should normally avoid remote dependencies; this
// method is provided for diagnostics while SchemaHealth is the readiness gate.
func (d *D1) Liveness(ctx context.Context) error {
	_, err := d.Run(ctx, Statement{SQL: "SELECT 1 AS ok"})
	return err
}

// SchemaHealth verifies every migration marker plus the tables, columns, and
// indexes the current runtime requires. It inspects SQLite metadata rather
// than tenant data, so it cannot expose or mutate persisted application state.
func (d *D1) SchemaHealth(ctx context.Context) error {
	type check struct {
		statement Statement
		want      int
	}
	versions := migrationVersions()
	versionParams := make([]any, 0, len(versions))
	for _, version := range versions {
		versionParams = append(versionParams, version)
	}
	checks := []check{{
		statement: Statement{
			SQL:    "SELECT COUNT(*) AS present FROM schema_migrations WHERE version IN (" + placeholders(len(versions)) + ")",
			Params: versionParams,
		},
		want: len(versions),
	}}
	for _, table := range requiredSchemaTables {
		params := make([]any, 0, len(table.columns)+1)
		params = append(params, table.name)
		for _, column := range table.columns {
			params = append(params, column)
		}
		checks = append(checks, check{
			statement: Statement{
				SQL:    "SELECT COUNT(*) AS present FROM pragma_table_info(?) WHERE name IN (" + placeholders(len(table.columns)) + ")",
				Params: params,
			},
			want: len(table.columns),
		})
	}
	indexParams := make([]any, 0, len(requiredSchemaIndexes))
	for _, index := range requiredSchemaIndexes {
		indexParams = append(indexParams, index)
	}
	checks = append(checks, check{
		statement: Statement{
			SQL:    "SELECT COUNT(*) AS present FROM sqlite_schema WHERE type = 'index' AND name IN (" + placeholders(len(requiredSchemaIndexes)) + ")",
			Params: indexParams,
		},
		want: len(requiredSchemaIndexes),
	})
	triggerParams := make([]any, 0, len(requiredSchemaTriggers))
	for _, trigger := range requiredSchemaTriggers {
		triggerParams = append(triggerParams, trigger)
	}
	checks = append(checks, check{
		statement: Statement{
			SQL:    "SELECT COUNT(*) AS present FROM sqlite_schema WHERE type = 'trigger' AND name IN (" + placeholders(len(requiredSchemaTriggers)) + ")",
			Params: triggerParams,
		},
		want: len(requiredSchemaTriggers),
	})

	statements := make([]Statement, 0, len(checks))
	for _, item := range checks {
		statements = append(statements, item.statement)
	}
	results, err := d.Run(ctx, statements...)
	if err != nil || len(results) != len(checks) {
		return ErrSchemaNotReady
	}
	for index, result := range results {
		if len(result.Rows) != 1 {
			return ErrSchemaNotReady
		}
		var row struct {
			Present int `json:"present"`
		}
		if err := json.Unmarshal(result.Rows[0], &row); err != nil || row.Present != checks[index].want {
			return ErrSchemaNotReady
		}
	}
	return nil
}

func placeholders(count int) string {
	return strings.TrimSuffix(strings.Repeat("?,", count), ",")
}

// Health is the readiness-compatible health contract used by existing
// gateway wiring. Use Liveness for a connectivity-only diagnostic.
func (d *D1) Health(ctx context.Context) error { return d.SchemaHealth(ctx) }
