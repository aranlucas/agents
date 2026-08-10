// Package auth implements Clerk identity verification and browser-origin policy.
package auth

import (
	"context"
	"crypto/rsa"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/clerk/clerk-sdk-go/v2"
	clerkjwt "github.com/clerk/clerk-sdk-go/v2/jwt"
)

const (
	defaultJWKSMaxAge = 5 * time.Minute
	maximumJWKSMaxAge = time.Hour
	maximumJWKSBody   = 1 << 20
	maximumTokenBytes = 16 << 10
)

// Identity is the verified request principal.
type Identity struct {
	UserID string
	Public bool
}

// TokenVerifier verifies a bearer token and returns its immutable identity.
type TokenVerifier interface {
	Verify(context.Context, string) (Identity, error)
}

// ClerkVerifier delegates JWT parsing and validation to Clerk's SDK while
// retaining bounded, rotation-aware caching around the configured JWKS URL.
type ClerkVerifier struct {
	url, issuer, audience string
	client                *http.Client
	now                   func() time.Time
	mu                    sync.Mutex
	keys                  map[string]*clerk.JSONWebKey
	expires               time.Time
	refreshed             time.Time
}

// NewClerkVerifier builds a verifier. Production JWKS endpoints must use HTTPS;
// loopback HTTP is accepted only to support deterministic local fixtures.
func NewClerkVerifier(jwksURL, issuer, audience string, client *http.Client) (*ClerkVerifier, error) {
	parsed, err := url.Parse(strings.TrimSpace(jwksURL))
	if err != nil || parsed.Host == "" || (parsed.Scheme != "https" && (parsed.Scheme != "http" || !isLoopbackHost(parsed.Hostname()))) {
		return nil, errors.New("invalid Clerk JWKS URL")
	}
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	} else if client.Timeout <= 0 {
		clone := *client
		clone.Timeout = 10 * time.Second
		client = &clone
	}
	return &ClerkVerifier{url: parsed.String(), issuer: strings.TrimSpace(issuer), audience: strings.TrimSpace(audience), client: client, now: time.Now}, nil
}

// Verify validates the session JWT through Clerk's SDK, then projects only the
// immutable subject into the gateway identity.
func (v *ClerkVerifier) Verify(ctx context.Context, token string) (Identity, error) {
	token = strings.TrimSpace(token)
	if token == "" || len(token) > maximumTokenBytes {
		return Identity{}, errors.New("invalid bearer token")
	}
	decoded, err := clerkjwt.Decode(ctx, &clerkjwt.DecodeParams{Token: token})
	if err != nil || decoded.KeyID == "" {
		return Identity{}, errors.New("invalid bearer token")
	}
	key, err := v.key(ctx, decoded.KeyID)
	if err != nil {
		return Identity{}, errors.New("invalid bearer token")
	}
	params := &clerkjwt.VerifyParams{
		Token:  token,
		JWK:    key,
		Clock:  clockFunc(v.now),
		Leeway: 5 * time.Second,
	}
	if v.issuer != "" {
		params.ProxyURL = &v.issuer
	}
	claims, err := clerkjwt.Verify(ctx, params)
	if err != nil || claims.Expiry == nil {
		return Identity{}, errors.New("invalid bearer token")
	}
	if v.audience != "" && !slices.Contains(claims.Audience, v.audience) {
		return Identity{}, errors.New("invalid bearer token")
	}
	subject := strings.TrimSpace(claims.Subject)
	if subject == "" || len(subject) > 256 {
		return Identity{}, errors.New("token has no valid subject")
	}
	return Identity{UserID: subject}, nil
}

type clockFunc func() time.Time

func (f clockFunc) Now() time.Time { return f() }

func (v *ClerkVerifier) key(ctx context.Context, kid string) (*clerk.JSONWebKey, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	now := v.now()
	if now.Before(v.expires) {
		if key := v.keys[kid]; key != nil {
			return key, nil
		}
		// An attacker controls kid before signature verification. Bound forced
		// refreshes so arbitrary values cannot amplify requests to Clerk.
		if now.Sub(v.refreshed) < 30*time.Second {
			return nil, errors.New("unknown signing key")
		}
	}
	if err := v.refreshLocked(ctx, now); err != nil {
		return nil, err
	}
	key := v.keys[kid]
	if key == nil {
		return nil, errors.New("unknown signing key")
	}
	return key, nil
}

func (v *ClerkVerifier) refreshLocked(ctx context.Context, now time.Time) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, v.url, nil)
	if err != nil {
		return errors.New("create JWKS request")
	}
	resp, err := v.client.Do(req)
	if err != nil {
		return errors.New("fetch JWKS")
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("JWKS returned HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maximumJWKSBody+1))
	if err != nil || len(body) > maximumJWKSBody {
		return errors.New("invalid JWKS response")
	}
	document := clerk.JSONWebKeySet{}
	if json.Unmarshal(body, &document) != nil {
		return errors.New("invalid JWKS response")
	}
	keys := make(map[string]*clerk.JSONWebKey)
	for _, key := range document.Keys {
		if key == nil || key.KeyID == "" || key.Algorithm != "RS256" || (key.Use != "" && key.Use != "sig") {
			continue
		}
		if _, ok := key.Key.(*rsa.PublicKey); ok {
			keys[key.KeyID] = key
		}
	}
	if len(keys) == 0 {
		return errors.New("JWKS has no usable signing keys")
	}
	v.keys = keys
	v.refreshed = now
	v.expires = now.Add(cacheMaxAge(resp.Header.Get("Cache-Control")))
	return nil
}

func cacheMaxAge(value string) time.Duration {
	for directive := range strings.SplitSeq(value, ",") {
		name, raw, found := strings.Cut(strings.TrimSpace(directive), "=")
		if !found || strings.ToLower(name) != "max-age" {
			continue
		}
		seconds, err := strconv.Atoi(strings.Trim(raw, `"`))
		if err == nil && seconds > 0 {
			return min(time.Duration(seconds)*time.Second, maximumJWKSMaxAge)
		}
	}
	return defaultJWKSMaxAge
}

func isLoopbackHost(host string) bool {
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}
