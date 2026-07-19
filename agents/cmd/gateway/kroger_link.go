package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"agents/internal/groceries"
)

const (
	krogerLinkAttemptInterval = time.Hour
	maxKrogerUserinfoBody     = 64 << 10
)

// krogerLinker joins Clerk and Kroger identities lazily. Linking is
// deliberately best-effort: Ensure logs and drops every failure so it cannot
// fail the chat request that discovered the Kroger connection.
type krogerLinker struct {
	repo        groceries.ShoppingRepository
	userinfoURL string
	client      *http.Client
	now         func() time.Time

	mu     sync.Mutex
	linked map[string]time.Time
}

func newKrogerLinker(repo groceries.ShoppingRepository, krogerMCPURL string, client *http.Client) *krogerLinker {
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	return &krogerLinker{
		repo: repo, userinfoURL: krogerUserinfoURL(krogerMCPURL), client: client,
		now: time.Now, linked: make(map[string]time.Time),
	}
}

func krogerUserinfoURL(krogerMCPURL string) string {
	parsed, err := url.Parse(strings.TrimSpace(krogerMCPURL))
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return ""
	}
	return (&url.URL{Scheme: parsed.Scheme, Host: parsed.Host, Path: "/userinfo"}).String()
}

func (l *krogerLinker) Ensure(ctx context.Context, clerkUserID, krogerToken string) {
	if l == nil || l.repo == nil || l.client == nil || l.userinfoURL == "" {
		return
	}
	clerkUserID, krogerToken = strings.TrimSpace(clerkUserID), strings.TrimSpace(krogerToken)
	if clerkUserID == "" || krogerToken == "" {
		return
	}

	now := time.Now()
	if l.now != nil {
		now = l.now()
	}
	l.mu.Lock()
	lastAttempt, attempted := l.linked[clerkUserID]
	if attempted && now.Sub(lastAttempt) < krogerLinkAttemptInterval {
		l.mu.Unlock()
		return
	}
	l.linked[clerkUserID] = now
	l.mu.Unlock()

	if err := l.ensure(ctx, clerkUserID, krogerToken, now); err != nil {
		log.Printf("link Kroger account: user=%s err=%v", clerkUserID, err)
	}
}

func (l *krogerLinker) ensure(ctx context.Context, clerkUserID, krogerToken string, now time.Time) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, l.userinfoURL, nil)
	if err != nil {
		return fmt.Errorf("build userinfo request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+krogerToken)
	response, err := l.client.Do(request)
	if err != nil {
		return fmt.Errorf("load userinfo: %w", err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, maxKrogerUserinfoBody))
		return fmt.Errorf("load userinfo: status %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxKrogerUserinfoBody+1))
	if err != nil {
		return fmt.Errorf("read userinfo: %w", err)
	}
	if len(body) > maxKrogerUserinfoBody {
		return fmt.Errorf("read userinfo: response exceeds %d bytes", maxKrogerUserinfoBody)
	}
	var userinfo struct {
		Subject string `json:"sub"`
	}
	if err := json.Unmarshal(body, &userinfo); err != nil {
		return fmt.Errorf("decode userinfo: %w", err)
	}
	userinfo.Subject = strings.TrimSpace(userinfo.Subject)
	if userinfo.Subject == "" {
		return fmt.Errorf("decode userinfo: sub is required")
	}
	if err := l.repo.LinkKrogerAccount(ctx, userinfo.Subject, clerkUserID, now); err != nil {
		return fmt.Errorf("persist account link: %w", err)
	}
	return nil
}
