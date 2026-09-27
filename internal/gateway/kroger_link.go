package gateway

import (
	"context"
	json "encoding/json/v2"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/aranlucas/agents/internal/auth"
	"github.com/aranlucas/agents/internal/grocerystore"
)

const (
	krogerLinkAttemptInterval = time.Hour
	maxKrogerUserinfoBody     = 64 << 10
	maxKrogerBearerToken      = 16 << 10
)

type krogerTokenVerifier struct {
	repo        grocerystore.ShoppingRepository
	userinfoURL string
	client      *http.Client
}

func newKrogerTokenVerifier(repo grocerystore.ShoppingRepository, krogerMCPURL string, client *http.Client) *krogerTokenVerifier {
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	} else if client.Timeout <= 0 {
		clone := *client
		clone.Timeout = 10 * time.Second
		client = &clone
	}
	return &krogerTokenVerifier{
		repo: repo, userinfoURL: krogerUserinfoURL(krogerMCPURL), client: client,
	}
}

func (v *krogerTokenVerifier) Verify(ctx context.Context, token string) (auth.Identity, error) {
	if v == nil || v.repo == nil {
		return auth.Identity{}, errors.New("kroger identity verifier is unavailable")
	}
	subject, err := loadKrogerSubject(ctx, v.client, v.userinfoURL, token)
	if err != nil {
		return auth.Identity{}, err
	}
	userID, err := v.repo.ResolveShopper(ctx, subject)
	if err != nil {
		return auth.Identity{}, fmt.Errorf("resolve Kroger shopper: %w", err)
	}
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return auth.Identity{}, errors.New("resolved Kroger shopper is empty")
	}
	return auth.Identity{UserID: userID}, nil
}

// krogerLinker joins Clerk and Kroger identities lazily. Linking is
// deliberately best-effort: Ensure logs and drops every failure so it cannot
// fail the chat request that discovered the Kroger connection.
type krogerLinker struct {
	repo        grocerystore.ShoppingRepository
	userinfoURL string
	client      *http.Client
	now         func() time.Time

	mu     sync.Mutex
	linked map[string]time.Time
}

func newKrogerLinker(repo grocerystore.ShoppingRepository, krogerMCPURL string, client *http.Client) *krogerLinker {
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	} else if client.Timeout <= 0 {
		clone := *client
		clone.Timeout = 10 * time.Second
		client = &clone
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
	subject, err := loadKrogerSubject(ctx, l.client, l.userinfoURL, krogerToken)
	if err != nil {
		return err
	}
	if err := l.repo.LinkKrogerAccount(ctx, subject, clerkUserID, now); err != nil {
		return fmt.Errorf("persist account link: %w", err)
	}
	return nil
}

func loadKrogerSubject(ctx context.Context, client *http.Client, userinfoURL, token string) (string, error) {
	token = strings.TrimSpace(token)
	if client == nil || strings.TrimSpace(userinfoURL) == "" {
		return "", errors.New("kroger userinfo is unavailable")
	}
	if token == "" || len(token) > maxKrogerBearerToken {
		return "", errors.New("invalid Kroger bearer token")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, userinfoURL, nil)
	if err != nil {
		return "", fmt.Errorf("build userinfo request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	response, err := client.Do(request)
	if err != nil {
		return "", fmt.Errorf("load userinfo: %w", err)
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, maxKrogerUserinfoBody))
		return "", fmt.Errorf("load userinfo: status %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maxKrogerUserinfoBody+1))
	if err != nil {
		return "", fmt.Errorf("read userinfo: %w", err)
	}
	if len(body) > maxKrogerUserinfoBody {
		return "", fmt.Errorf("read userinfo: response exceeds %d bytes", maxKrogerUserinfoBody)
	}
	var userinfo struct {
		Subject string `json:"sub"`
	}
	if err := json.Unmarshal(body, &userinfo); err != nil {
		return "", fmt.Errorf("decode userinfo: %w", err)
	}
	userinfo.Subject = strings.TrimSpace(userinfo.Subject)
	if userinfo.Subject == "" {
		return "", fmt.Errorf("decode userinfo: sub is required")
	}
	return userinfo.Subject, nil
}
