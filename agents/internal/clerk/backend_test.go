package clerk

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestBackendResolvesLinkedUserAndConnections(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bearer secret" {
			t.Fatal("missing authorization")
		}
		switch {
		case request.URL.Path == "/users":
			if request.URL.Query().Get("external_id") != "42" {
				t.Fatalf("query=%s", request.URL.RawQuery)
			}
			_ = json.NewEncoder(w).Encode([]any{map[string]any{"id": "shadow", "private_metadata": map[string]any{"linked_clerk_user_id": "real-user"}}})
		case request.URL.Path == "/users/count":
			_ = json.NewEncoder(w).Encode(map[string]any{"total_count": 1})
		case strings.Contains(request.URL.Path, "oauth_custom_shopping"):
			_ = json.NewEncoder(w).Encode(map[string]any{"data": []any{map[string]any{"token": "redacted"}}, "total_count": 1})
		case strings.Contains(request.URL.Path, "oauth_custom_strava"):
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
	linked, err := backend.LinkedUserID(t.Context(), 42)
	if err != nil || linked != "real-user" {
		t.Fatalf("linked=%q err=%v", linked, err)
	}
	state, err := backend.OAuthConnections(t.Context(), "real-user")
	if err != nil || !state.Kroger || !state.Strava {
		t.Fatalf("state=%#v err=%v", state, err)
	}
}

func TestBackendRejectsInsecureBaseURL(t *testing.T) {
	if _, err := NewBackend(nil, "http://clerk.example", "secret"); err == nil {
		t.Fatal("insecure URL accepted")
	}
}
