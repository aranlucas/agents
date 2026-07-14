package clerk

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestBackendResolvesOAuthConnections(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bearer secret" {
			t.Fatal("missing authorization")
		}
		switch {
		case strings.Contains(request.URL.Path, "oauth_custom_shopping"):
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []any{map[string]any{"token": "redacted"}}, "total_count": 1})
		default:
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []any{}, "total_count": 0})
		}
	}))
	defer server.Close()
	backend, err := NewBackend(server.Client(), server.URL, "secret")
	if err != nil {
		t.Fatal(err)
	}
	state, err := backend.OAuthConnections(t.Context(), "real-user")
	if err != nil || !state.Kroger || state.KrogerToken != "redacted" {
		t.Fatalf("state=%#v err=%v", state, err)
	}
}

func TestBackendRejectsInsecureBaseURL(t *testing.T) {
	if _, err := NewBackend(nil, "http://clerk.example", "secret"); err == nil {
		t.Fatal("insecure URL accepted")
	}
}

func TestBackendReturnsOAuthLookupErrorsWhenNoAliasResolves(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "Clerk unavailable", http.StatusServiceUnavailable)
	}))
	defer server.Close()
	backend, err := NewBackend(server.Client(), server.URL, "secret")
	if err != nil {
		t.Fatal(err)
	}

	state, err := backend.OAuthConnections(t.Context(), "real-user")
	if err == nil {
		t.Fatal("OAuth lookup failure was treated as a disconnected account")
	}
	if state != (ConnectionState{}) {
		t.Fatalf("state=%#v", state)
	}
}

func TestBackendUsesWorkingOAuthAliasAfterAnotherAliasFails(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if strings.Contains(request.URL.Path, "oauth_custom_shopping") {
			http.Error(w, "alias unavailable", http.StatusServiceUnavailable)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []any{map[string]any{"token": "redacted"}}, "total_count": 1})
	}))
	defer server.Close()
	backend, err := NewBackend(server.Client(), server.URL, "secret")
	if err != nil {
		t.Fatal(err)
	}

	state, err := backend.OAuthConnections(t.Context(), "real-user")
	if err != nil || !state.Kroger || state.KrogerToken != "redacted" {
		t.Fatalf("state=%#v err=%v", state, err)
	}
}
