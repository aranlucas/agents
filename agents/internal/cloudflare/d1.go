// Package cloudflare implements the gateway's mandatory D1 and R2 services.
package cloudflare

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"agents/internal/config"
	cfapi "github.com/cloudflare/cloudflare-go/v7"
	"github.com/cloudflare/cloudflare-go/v7/d1"
	"github.com/cloudflare/cloudflare-go/v7/option"
)

const (
	defaultD1Timeout = 10 * time.Second
)

// Statement is one parameterized D1 SQL statement.
type Statement struct {
	SQL    string `json:"sql"`
	Params []any  `json:"params,omitempty"`
}

// Result contains rows and mutation metadata returned for a statement.
type Result struct {
	Rows    []json.RawMessage `json:"results"`
	Success bool              `json:"success"`
	Meta    struct {
		Changes int64 `json:"changes"`
	} `json:"meta"`
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
		// The SDK error can include the response body. Do not risk reflecting
		// provider-controlled content or credentials into gateway logs.
		return nil, errors.New("D1 query failed")
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

// Health verifies that D1 accepts a bounded trivial query.
func (d *D1) Health(ctx context.Context) error {
	_, err := d.Run(ctx, Statement{SQL: "SELECT 1 AS ok"})
	return err
}
