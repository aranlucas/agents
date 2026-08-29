package clerk

import (
	json "encoding/json/v2"
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
			_ = json.MarshalWrite(w, map[string]any{"data": []any{map[string]any{"token": "redacted"}}, "total_count": 1})
		default:
			_ = json.MarshalWrite(w, map[string]any{"data": []any{}, "total_count": 0})
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

func TestBackendTreatsMissingOAuthGrantAsDisconnected(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.MarshalWrite(w, map[string]any{
			"errors": []any{map[string]any{
				"code":         "oauth_token_retrieval_error",
				"message":      "Token retrieval failed",
				"long_message": "Failed to retrieve a new access token from the OAuth provider",
				"meta": map[string]any{
					"provider_error": `oauth2: "invalid_grant" "Grant not found"`,
				},
			}},
			"status": http.StatusBadRequest,
		})
	}))
	defer server.Close()
	backend, err := NewBackend(server.Client(), server.URL, "secret")
	if err != nil {
		t.Fatal(err)
	}

	state, err := backend.OAuthConnections(t.Context(), "real-user")
	if err != nil {
		t.Fatalf("missing grant should be treated as disconnected: %v", err)
	}
	if state != (ConnectionState{}) {
		t.Fatalf("state=%#v", state)
	}
}

func TestBackendStillReturnsOperationalFailureAfterMissingGrant(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if strings.Contains(request.URL.Path, "oauth_custom_shopping") {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.MarshalWrite(w, map[string]any{
				"errors": []any{map[string]any{
					"code": "oauth_token_retrieval_error",
					"meta": map[string]any{"provider_error": `oauth2: "invalid_grant" "Grant not found"`},
				}},
				"status": http.StatusBadRequest,
			})

			return
		}
		http.Error(w, "Clerk unavailable", http.StatusServiceUnavailable)
	}))
	defer server.Close()
	backend, err := NewBackend(server.Client(), server.URL, "secret")
	if err != nil {
		t.Fatal(err)
	}

	if _, err := backend.OAuthConnections(t.Context(), "real-user"); err == nil {
		t.Fatal("operational OAuth lookup failure was ignored")
	}
}

func TestBackendUsesWorkingOAuthAliasAfterAnotherAliasFails(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if strings.Contains(request.URL.Path, "oauth_custom_shopping") {
			http.Error(w, "alias unavailable", http.StatusServiceUnavailable)
			return
		}
		_ = json.MarshalWrite(w, map[string]any{"data": []any{map[string]any{"token": "redacted"}}, "total_count": 1})
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
