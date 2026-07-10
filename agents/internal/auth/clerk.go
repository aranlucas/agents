// Package auth implements Clerk identity verification and browser-origin policy.
package auth

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
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

// ClerkVerifier caches Clerk RSA keys and validates session JWTs.
type ClerkVerifier struct {
	url, issuer, audience string
	client                *http.Client
	now                   func() time.Time
	mu                    sync.Mutex
	keys                  map[string]*rsa.PublicKey
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

// Verify validates signature, expiry, optional issuer/audience, and subject.
func (v *ClerkVerifier) Verify(ctx context.Context, token string) (Identity, error) {
	token = strings.TrimSpace(token)
	if token == "" || len(token) > maximumTokenBytes {
		return Identity{}, errors.New("invalid bearer token")
	}
	options := []jwt.ParserOption{jwt.WithValidMethods([]string{"RS256"}), jwt.WithExpirationRequired(), jwt.WithLeeway(5 * time.Second), jwt.WithTimeFunc(v.now)}
	if v.issuer != "" {
		options = append(options, jwt.WithIssuer(v.issuer))
	}
	if v.audience != "" {
		options = append(options, jwt.WithAudience(v.audience))
	}
	claims := jwt.MapClaims{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(parsed *jwt.Token) (any, error) {
		kid, _ := parsed.Header["kid"].(string)
		if kid == "" {
			return nil, errors.New("token has no key ID")
		}
		return v.key(ctx, kid)
	}, options...)
	if err != nil || !parsed.Valid {
		return Identity{}, errors.New("invalid bearer token")
	}
	subject, err := claims.GetSubject()
	if err != nil || strings.TrimSpace(subject) == "" || len(subject) > 256 {
		return Identity{}, errors.New("token has no valid subject")
	}
	return Identity{UserID: subject}, nil
}

func (v *ClerkVerifier) key(ctx context.Context, kid string) (*rsa.PublicKey, error) {
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
	var document struct {
		Keys []struct{ Kty, Kid, Use, Alg, N, E string } `json:"keys"`
	}
	if json.Unmarshal(body, &document) != nil {
		return errors.New("invalid JWKS response")
	}
	keys := make(map[string]*rsa.PublicKey)
	for _, jwk := range document.Keys {
		if jwk.Kty != "RSA" || jwk.Alg != "RS256" || jwk.Kid == "" || (jwk.Use != "" && jwk.Use != "sig") {
			continue
		}
		key, err := decodeRSAKey(jwk.N, jwk.E)
		if err == nil {
			keys[jwk.Kid] = key
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

func decodeRSAKey(modulus, exponent string) (*rsa.PublicKey, error) {
	n, err := base64.RawURLEncoding.DecodeString(modulus)
	if err != nil || len(n) < 128 {
		return nil, errors.New("invalid RSA modulus")
	}
	e, err := base64.RawURLEncoding.DecodeString(exponent)
	if err != nil || len(e) == 0 || len(e) > 4 {
		return nil, errors.New("invalid RSA exponent")
	}
	exponentValue := 0
	for _, value := range e {
		exponentValue = exponentValue<<8 | int(value)
	}
	if exponentValue < 3 || exponentValue%2 == 0 {
		return nil, errors.New("invalid RSA exponent")
	}
	return &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: exponentValue}, nil
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
