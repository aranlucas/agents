package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	json "encoding/json/v2"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestStateRouteRejectsUnauthenticatedRequest(t *testing.T) {
	handler := RequireIdentity(map[string]bool{"/resume/agui": true}, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/travel/agents/state", nil))
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d", recorder.Code)
	}
}

func TestPublicRouteUsesAnonymousIdentity(t *testing.T) {
	handler := RequireIdentity(map[string]bool{"/resume/agui": true}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		identity, ok := FromContext(r.Context())
		if !ok || !identity.Public || identity.UserID != "anonymous" {
			t.Fatalf("identity = %#v, %v", identity, ok)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/resume/agui", nil))
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d", recorder.Code)
	}
}

func TestPublicRoutePrefixUsesAnonymousIdentity(t *testing.T) {
	handler := RequireIdentity(map[string]bool{"/agent/resume/stop/*": true}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		identity, ok := FromContext(r.Context())
		if !ok || !identity.Public {
			t.Fatalf("identity = %#v, %v", identity, ok)
		}
		w.WriteHeader(http.StatusNoContent)
	}))

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/agent/resume/stop/thread-123", nil))
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d", recorder.Code)
	}
}

func TestPublicRouteUsesVerifiedIdentityWhenBearerTokenIsPresent(t *testing.T) {
	verifier := tokenVerifierFunc(func(context.Context, string) (Identity, error) {
		return Identity{UserID: "clerk-user"}, nil
	})
	handler := RequireIdentity(map[string]bool{"/resume/agui": true}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		identity, ok := FromContext(r.Context())
		if !ok || identity.Public || identity.UserID != "clerk-user" {
			t.Fatalf("identity = %#v, %v", identity, ok)
		}
		w.WriteHeader(http.StatusNoContent)
	}), verifier)
	request := httptest.NewRequest(http.MethodPost, "/resume/agui", nil)
	request.Header.Set("Authorization", "Bearer session-token")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d", recorder.Code)
	}
}

func TestProtectedRouteAcceptsFirstSuccessfulVerifier(t *testing.T) {
	first := tokenVerifierFunc(func(context.Context, string) (Identity, error) {
		return Identity{}, errors.New("not a Clerk token")
	})
	second := tokenVerifierFunc(func(_ context.Context, token string) (Identity, error) {
		if token != "mcp-token" {
			return Identity{}, errors.New("not an MCP token")
		}
		return Identity{UserID: "kroger:user"}, nil
	})
	handler := RequireIdentity(nil, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		identity, ok := FromContext(r.Context())
		if !ok || identity.UserID != "kroger:user" {
			t.Fatalf("identity = %#v, %v", identity, ok)
		}
		w.WriteHeader(http.StatusNoContent)
	}), first, second)
	request := httptest.NewRequest(http.MethodGet, "/agent/grocery/run", nil)
	request.Header.Set("Authorization", "Bearer mcp-token")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d", recorder.Code)
	}
}

type tokenVerifierFunc func(context.Context, string) (Identity, error)

func (f tokenVerifierFunc) Verify(ctx context.Context, token string) (Identity, error) {
	return f(ctx, token)
}

func TestVerifiedSubjectOverridesSpoofedHeaderAndCachesJWKS(t *testing.T) {
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		w.Header().Set("Cache-Control", "public, max-age=300")
		_ = json.MarshalWrite(w, jwksDocument("key-1", &privateKey.PublicKey))
	}))
	defer server.Close()
	verifier, err := NewClerkVerifier(server.URL, "https://clerk.example", "", server.Client())
	if err != nil {
		t.Fatal(err)
	}
	token := signedToken(t, privateKey, "key-1", "clerk-user", "https://clerk.example", time.Now().Add(time.Hour))
	handler := RequireIdentity(nil, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		identity, _ := FromContext(r.Context())
		if identity.UserID != "clerk-user" || r.Header.Get("x-clerk-user-id") != "clerk-user" {
			t.Fatalf("identity/header = %#v/%q", identity, r.Header.Get("x-clerk-user-id"))
		}
		w.WriteHeader(http.StatusNoContent)
	}), verifier)
	for range 2 {
		req := httptest.NewRequest(http.MethodPost, "/travel/agui", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("x-clerk-user-id", "attacker")
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, req)
		if recorder.Code != http.StatusNoContent {
			t.Fatalf("status = %d", recorder.Code)
		}
	}
	if requests.Load() != 1 {
		t.Fatalf("JWKS requests = %d", requests.Load())
	}
}

func TestVerifierRejectsExpiredWrongIssuerAndUnknownAlgorithm(t *testing.T) {
	privateKey, _ := rsa.GenerateKey(rand.Reader, 2048)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.MarshalWrite(w, jwksDocument("key", &privateKey.PublicKey))
	}))
	defer server.Close()
	verifier, err := NewClerkVerifier(server.URL, "issuer", "", server.Client())
	if err != nil {
		t.Fatal(err)
	}
	for _, token := range []string{
		signedToken(t, privateKey, "key", "user", "issuer", time.Now().Add(-time.Minute)),
		signedToken(t, privateKey, "key", "user", "wrong", time.Now().Add(time.Hour)),
		unsignedToken(t),
	} {
		if _, err := verifier.Verify(t.Context(), token); err == nil {
			t.Fatal("invalid token accepted")
		}
	}
}

func TestUnknownKeyIDCannotAmplifyJWKSRequests(t *testing.T) {
	privateKey, _ := rsa.GenerateKey(rand.Reader, 2048)
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requests.Add(1)
		w.Header().Set("Cache-Control", "max-age=300")
		_ = json.MarshalWrite(w, jwksDocument("known", &privateKey.PublicKey))
	}))
	defer server.Close()
	verifier, err := NewClerkVerifier(server.URL, "issuer", "", server.Client())
	if err != nil {
		t.Fatal(err)
	}
	known := signedToken(t, privateKey, "known", "user", "issuer", time.Now().Add(time.Hour))
	if _, err := verifier.Verify(t.Context(), known); err != nil {
		t.Fatal(err)
	}
	unknown := signedToken(t, privateKey, "attacker-controlled", "user", "issuer", time.Now().Add(time.Hour))
	for range 2 {
		if _, err := verifier.Verify(t.Context(), unknown); err == nil {
			t.Fatal("unknown key accepted")
		}
	}
	if requests.Load() != 1 {
		t.Fatalf("JWKS requests = %d", requests.Load())
	}
}

func TestCORSAllowsOnlyConfiguredOrigin(t *testing.T) {
	handler := CORS([]string{"https://app.example"}, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	allowed := httptest.NewRequest(http.MethodOptions, "/travel/agui", nil)
	allowed.Header.Set("Origin", "https://app.example")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, allowed)
	if recorder.Code != http.StatusNoContent || recorder.Header().Get("Access-Control-Allow-Origin") != "https://app.example" || recorder.Header().Get("Access-Control-Allow-Credentials") != "true" {
		t.Fatalf("allowed response = %d %#v", recorder.Code, recorder.Header())
	}
	if got := recorder.Header().Get("Access-Control-Allow-Headers"); got != "Authorization, Baggage, Content-Type, Sentry-Trace, X-Clerk-User-Id" {
		t.Fatalf("allowed headers = %q", got)
	}
	blocked := httptest.NewRequest(http.MethodOptions, "/travel/agui", nil)
	blocked.Header.Set("Origin", "https://attacker.example")
	recorder = httptest.NewRecorder()
	handler.ServeHTTP(recorder, blocked)
	if recorder.Code != http.StatusForbidden || recorder.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("blocked response = %d %#v", recorder.Code, recorder.Header())
	}
}

func TestCORSWildcardReflectsAnyOriginForCredentialedRequests(t *testing.T) {
	handler := CORS([]string{"*"}, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))

	for _, method := range []string{http.MethodOptions, http.MethodPost} {
		request := httptest.NewRequest(method, "/grocery/agui", nil)
		request.Header.Set("Origin", "https://agents-lucas.vercel.app")
		recorder := httptest.NewRecorder()

		handler.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusNoContent {
			t.Fatalf("%s status = %d", method, recorder.Code)
		}
		if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != "https://agents-lucas.vercel.app" {
			t.Fatalf("%s allow origin = %q", method, got)
		}
		if got := recorder.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
			t.Fatalf("%s allow credentials = %q", method, got)
		}
	}
}

func TestCORSPreflightAllowsPreferredStorePUT(t *testing.T) {
	handler := CORS([]string{"https://app.example"}, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	request := httptest.NewRequest(http.MethodOptions, "/grocery/agui", nil)
	request.Header.Set("Origin", "https://app.example")
	request.Header.Set("Access-Control-Request-Method", http.MethodPut)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d", recorder.Code)
	}
	if got := recorder.Header().Get("Access-Control-Allow-Methods"); got != "GET, POST, PUT, PATCH, DELETE, OPTIONS" {
		t.Fatalf("allowed methods = %q", got)
	}
}

func jwksDocument(kid string, key *rsa.PublicKey) map[string]any {
	exponent := big.NewInt(int64(key.E)).Bytes()
	return map[string]any{"keys": []any{map[string]any{"kty": "RSA", "kid": kid, "use": "sig", "alg": "RS256", "n": base64.RawURLEncoding.EncodeToString(key.N.Bytes()), "e": base64.RawURLEncoding.EncodeToString(exponent)}}}
}

func signedToken(t *testing.T, key *rsa.PrivateKey, kid, subject, issuer string, expires time.Time) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{"sub": subject, "iss": issuer, "exp": expires.Unix()})
	token.Header["kid"] = kid
	signed, err := token.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

func unsignedToken(t *testing.T) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodNone, jwt.MapClaims{"sub": "user", "exp": time.Now().Add(time.Hour).Unix()})
	token.Header["kid"] = "key"
	signed, err := token.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatal(err)
	}
	return signed
}
