package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"agents/internal/auth"
	"agents/internal/clerk"
)

func TestKrogerUserinfoURLUsesMCPOrigin(t *testing.T) {
	got := krogerUserinfoURL("https://example.com/mcp?tenant=one#fragment")
	if got != "https://example.com/userinfo" {
		t.Fatalf("userinfo URL = %q", got)
	}
	for _, invalid := range []string{"", "/mcp", "ftp://example.com/mcp", "://bad"} {
		if got := krogerUserinfoURL(invalid); got != "" {
			t.Fatalf("krogerUserinfoURL(%q) = %q", invalid, got)
		}
	}
}

func TestKrogerTokenVerifierResolvesVerifiedSubject(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/userinfo" || request.Header.Get("Authorization") != "Bearer mcp-token" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte(`{"sub":"kroger-sub"}`))
	}))
	defer server.Close()
	repository := newFakeShoppingRepository()
	identity, err := newKrogerTokenVerifier(repository, server.URL+"/mcp", server.Client()).Verify(t.Context(), "mcp-token")
	if err != nil {
		t.Fatal(err)
	}
	if identity.UserID != "clerk-resolved" || repository.resolvedSubject != "kroger-sub" {
		t.Fatalf("identity = %#v, subject = %q", identity, repository.resolvedSubject)
	}
}

func TestKrogerTokenVerifierRejectsUnverifiedToken(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
	}))
	defer server.Close()
	repository := newFakeShoppingRepository()
	if _, err := newKrogerTokenVerifier(repository, server.URL+"/mcp", server.Client()).Verify(t.Context(), "invalid"); err == nil {
		t.Fatal("invalid token accepted")
	}
	if repository.resolveCalls != 0 {
		t.Fatalf("shopper resolution calls = %d", repository.resolveCalls)
	}
}

func TestKrogerLinkerLinksOncePerHour(t *testing.T) {
	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		hits.Add(1)
		if got := request.URL.Path; got != "/userinfo" {
			t.Errorf("path = %q", got)
		}
		if got := request.Header.Get("Authorization"); got != "Bearer kroger-token" {
			t.Errorf("authorization = %q", got)
		}
		_, _ = w.Write([]byte(`{"sub":"kroger-sub"}`))
	}))
	defer server.Close()

	repository := newFakeShoppingRepository()
	now := time.Unix(100, 0)
	linker := newKrogerLinker(repository, server.URL+"/mcp", server.Client())
	linker.now = func() time.Time { return now }
	linker.Ensure(t.Context(), "clerk-user", "kroger-token")
	linker.Ensure(t.Context(), "clerk-user", "kroger-token")
	if hits.Load() != 1 || repository.linkCalls != 1 {
		t.Fatalf("hits = %d, links = %d", hits.Load(), repository.linkCalls)
	}
	if repository.linkedSubject != "kroger-sub" || repository.linkedUserID != "clerk-user" || !repository.linkedAt.Equal(now) {
		t.Fatalf("link = subject:%q user:%q at:%v", repository.linkedSubject, repository.linkedUserID, repository.linkedAt)
	}

	now = now.Add(time.Hour + time.Second)
	linker.Ensure(t.Context(), "clerk-user", "kroger-token")
	if hits.Load() != 2 || repository.linkCalls != 2 {
		t.Fatalf("after one hour hits = %d, links = %d", hits.Load(), repository.linkCalls)
	}
}

func TestKrogerLinkerDropsMalformedAndNon2xxUserinfo(t *testing.T) {
	tests := []struct {
		name   string
		status int
		body   string
	}{
		{name: "malformed", status: http.StatusOK, body: `{"sub":`},
		{name: "missing subject", status: http.StatusOK, body: `{}`},
		{name: "non-2xx", status: http.StatusUnauthorized, body: `{"error":"unauthorized"}`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(test.status)
				_, _ = w.Write([]byte(test.body))
			}))
			defer server.Close()
			repository := newFakeShoppingRepository()
			newKrogerLinker(repository, server.URL+"/mcp", server.Client()).Ensure(t.Context(), "clerk-user", "kroger-token")
			if repository.linkCalls != 0 {
				t.Fatalf("link calls = %d", repository.linkCalls)
			}
		})
	}
}

func TestKrogerLinkerHonorsContextTimeout(t *testing.T) {
	requestCanceled := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		<-request.Context().Done()
		close(requestCanceled)
	}))
	defer server.Close()
	repository := newFakeShoppingRepository()
	linker := newKrogerLinker(repository, server.URL+"/mcp", server.Client())
	ctx, cancel := context.WithTimeout(t.Context(), 20*time.Millisecond)
	defer cancel()
	linker.Ensure(ctx, "clerk-user", "kroger-token")
	select {
	case <-requestCanceled:
	case <-time.After(time.Second):
		t.Fatal("userinfo request context was not canceled")
	}
	if repository.linkCalls != 0 {
		t.Fatalf("link calls = %d", repository.linkCalls)
	}
}

func TestOAuthLinkingIsDetachedAndDoesNotBlockRequest(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		close(started)
		<-release
		_, _ = w.Write([]byte(`{"sub":"kroger-sub"}`))
	}))
	defer server.Close()

	repository := newFakeShoppingRepository()
	linker := newKrogerLinker(repository, server.URL+"/mcp", server.Client())
	backend := &fakeClerkBackend{connections: clerk.ConnectionState{KrogerToken: "kroger-token"}}
	nextCalled := make(chan struct{})
	handler := auth.RequireIdentity(nil, withOAuthCredentials(backend, linker, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		close(nextCalled)
		w.WriteHeader(http.StatusNoContent)
	})), acceptingVerifier{})

	requestContext, cancelRequest := context.WithCancel(t.Context())
	request := httptest.NewRequest(http.MethodPost, "/grocery/agui", nil).WithContext(requestContext)
	request.Header.Set("Authorization", "Bearer clerk-session")
	recorder := httptest.NewRecorder()
	done := make(chan struct{})
	go func() {
		handler.ServeHTTP(recorder, request)
		close(done)
	}()

	select {
	case <-nextCalled:
	case <-time.After(time.Second):
		t.Fatal("chat request was blocked by linker")
	}
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("OAuth middleware did not return")
	}
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d", recorder.Code)
	}
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("userinfo request did not start")
	}
	cancelRequest()
	close(release)
	select {
	case <-repository.linkSignal:
	case <-time.After(time.Second):
		t.Fatal("detached linker did not persist the account link")
	}
	if repository.linkedSubject != "kroger-sub" || repository.linkedUserID != "clerk-user" {
		t.Fatalf("link = subject:%q user:%q", repository.linkedSubject, repository.linkedUserID)
	}
}

func TestKrogerLinkerRejectsOversizedUserinfo(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"sub":"` + strings.Repeat("a", maxKrogerUserinfoBody) + `"}`))
	}))
	defer server.Close()
	repository := newFakeShoppingRepository()
	newKrogerLinker(repository, server.URL+"/mcp", server.Client()).Ensure(t.Context(), "clerk-user", "kroger-token")
	if repository.linkCalls != 0 {
		t.Fatalf("link calls = %d", repository.linkCalls)
	}
}
