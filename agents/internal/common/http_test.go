package common

import (
	"net/http"
	"testing"
	"time"
)

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
