// Package cloudflare implements the gateway's mandatory D1 and R2 services.
package cloudflare

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"agents/internal/config"
)

const (
	defaultD1Timeout = 10 * time.Second
	maxD1Body        = 8 << 20
)

// Statement is one parameterized D1 SQL statement.
type Statement struct {
	SQL    string `json:"sql"`
	Params []any  `json:"params,omitempty"`
}

type d1BatchRequest struct {
	Batch []Statement `json:"batch"`
}

// Result contains rows and mutation metadata returned for a statement.
type Result struct {
	Rows    []map[string]any `json:"results"`
	Success bool             `json:"success"`
	Meta    struct {
		Changes int64 `json:"changes"`
	} `json:"meta"`
}

// D1 is a bounded client for Cloudflare's D1 SQL API.
type D1 struct {
	client   *http.Client
	endpoint string
	token    string
}

// NewD1 creates a D1 client using Cloudflare's production API endpoint.
func NewD1(cfg config.Cloudflare, client *http.Client) (*D1, error) {
	endpoint := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/d1/database/%s/query", url.PathEscape(cfg.AccountID), url.PathEscape(cfg.D1DatabaseID))
	return newD1(cfg, client, endpoint)
}

func newD1(cfg config.Cloudflare, client *http.Client, endpoint string) (*D1, error) {
	if strings.TrimSpace(cfg.AccountID) == "" || strings.TrimSpace(cfg.D1DatabaseID) == "" || strings.TrimSpace(cfg.APIToken) == "" {
		return nil, errors.New("D1 account, database, and API token are required")
	}
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme != "https" && parsed.Scheme != "http" || parsed.Host == "" {
		return nil, errors.New("invalid D1 endpoint")
	}
	if client == nil {
		client = &http.Client{Timeout: defaultD1Timeout}
	} else if client.Timeout <= 0 {
		bounded := *client
		bounded.Timeout = defaultD1Timeout
		client = &bounded
	}
	return &D1{client: client, endpoint: endpoint, token: cfg.APIToken}, nil
}

// Run executes one or more parameterized statements as a single D1 request.
func (d *D1) Run(ctx context.Context, statements ...Statement) ([]Result, error) {
	if len(statements) == 0 {
		return nil, errors.New("at least one D1 statement is required")
	}
	body, err := json.Marshal(d1BatchRequest{Batch: statements})
	if err != nil {
		return nil, fmt.Errorf("encode D1 request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create D1 request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+d.token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := d.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("D1 request failed: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	limited := io.LimitReader(resp.Body, maxD1Body+1)
	payload, err := io.ReadAll(limited)
	if err != nil {
		return nil, errors.New("read D1 response")
	}
	if len(payload) > maxD1Body {
		return nil, errors.New("D1 response exceeds size limit")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("D1 request returned HTTP %d", resp.StatusCode)
	}
	var envelope struct {
		Success bool     `json:"success"`
		Result  []Result `json:"result"`
		Errors  []struct {
			Code int `json:"code"`
		} `json:"errors"`
	}
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return nil, errors.New("decode D1 response")
	}
	if !envelope.Success {
		code := 0
		if len(envelope.Errors) > 0 {
			code = envelope.Errors[0].Code
		}
		return nil, fmt.Errorf("D1 query failed (code %d)", code)
	}
	for _, result := range envelope.Result {
		if !result.Success {
			return nil, errors.New("D1 statement failed")
		}
	}
	return envelope.Result, nil
}

// Health verifies that D1 accepts a bounded trivial query.
func (d *D1) Health(ctx context.Context) error {
	_, err := d.Run(ctx, Statement{SQL: "SELECT 1 AS ok"})
	return err
}
