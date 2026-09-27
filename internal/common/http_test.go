package common

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type failingResponseWriter struct {
	header http.Header
}

func (w *failingResponseWriter) Header() http.Header { return w.header }
func (*failingResponseWriter) WriteHeader(int)       {}
func (*failingResponseWriter) Write([]byte) (int, error) {
	return 0, errors.New("write failed")
}

func TestWriteJSONSetsMetadataAndReturnsWriterErrors(t *testing.T) {
	recorder := httptest.NewRecorder()
	if err := WriteJSON(recorder, http.StatusCreated, map[string]bool{"ok": true}); err != nil {
		t.Fatal(err)
	}
	if recorder.Code != http.StatusCreated || recorder.Header().Get("Content-Type") != "application/json" || recorder.Body.String() != `{"ok":true}` {
		t.Fatalf("response = code:%d header:%q body:%q", recorder.Code, recorder.Header().Get("Content-Type"), recorder.Body.String())
	}

	failing := &failingResponseWriter{header: http.Header{}}
	if err := WriteJSON(failing, http.StatusOK, map[string]bool{"ok": true}); err == nil {
		t.Fatal("WriteJSON succeeded with a failing response writer")
	}
}

func TestNewHTTPClientUsesConfiguredTransport(t *testing.T) {
	client := NewHTTPClient(time.Second, 1024)
	if _, ok := client.Client.Transport.(*http.Transport); !ok {
		t.Fatalf("transport = %T", client.Client.Transport)
	}
}

func TestBoundedRedirectsKeepsCredentialsOnlyWithinExactOrigin(t *testing.T) {
	initial, err := http.NewRequest(http.MethodGet, "https://api.example.test/start", nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name       string
		target     string
		wantSecret bool
	}{
		{name: "same origin", target: "https://API.example.test:443/next", wantSecret: true},
		{name: "scheme downgrade", target: "http://api.example.test/next"},
		{name: "alternate port", target: "https://api.example.test:8443/next"},
		{name: "different host", target: "https://other.example.test/next"},
	} {
		t.Run(test.name, func(t *testing.T) {
			redirect, err := http.NewRequest(http.MethodGet, test.target, nil)
			if err != nil {
				t.Fatal(err)
			}
			redirect.Header.Set("Authorization", "Bearer provider-secret")
			redirect.Header.Set("X-Subscription-Token", "subscription-secret")
			if err := boundedRedirects(redirect, []*http.Request{initial}); err != nil {
				t.Fatal(err)
			}
			hasAuthorization := redirect.Header.Get("Authorization") != ""
			hasSubscription := redirect.Header.Get("X-Subscription-Token") != ""
			if hasAuthorization != test.wantSecret || hasSubscription != test.wantSecret {
				t.Fatalf("credential headers retained = authorization:%t subscription:%t, want %t", hasAuthorization, hasSubscription, test.wantSecret)
			}
		})
	}
}
