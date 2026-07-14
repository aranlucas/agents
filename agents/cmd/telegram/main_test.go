package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
)

type stubHealthChecker struct{ err error }

func (checker stubHealthChecker) Health(context.Context) error { return checker.err }

func TestHealthHandlerSeparatesLivenessAndReadiness(t *testing.T) {
	handler := healthHandler(stubHealthChecker{}, stubHealthChecker{})

	for _, path := range []string{"/live", "/ready", "/health"} {
		t.Run(path, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, path, nil)
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, request)
			if recorder.Code != http.StatusOK {
				t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
			}
			if got := recorder.Header().Get("Content-Type"); got != "application/json" {
				t.Fatalf("content type = %q", got)
			}
			if path != "/live" && recorder.Body.String() != "{\"status\":\"ok\",\"service\":\"agents-telegram\",\"checks\":{\"d1\":\"ok\",\"r2\":\"ok\"}}\n" {
				t.Fatalf("body=%s", recorder.Body.String())
			}
		})
	}
}

func TestHealthHandlerKeepsLivenessHealthyWhenDependencyIsDown(t *testing.T) {
	handler := healthHandler(stubHealthChecker{err: errors.New("D1 unavailable")}, stubHealthChecker{})

	ready := httptest.NewRecorder()
	handler.ServeHTTP(ready, httptest.NewRequest(http.MethodGet, "/ready", nil))
	if ready.Code != http.StatusServiceUnavailable || ready.Body.String() != "{\"status\":\"degraded\",\"service\":\"agents-telegram\",\"checks\":{\"d1\":\"unavailable\",\"r2\":\"ok\"}}\n" {
		t.Fatalf("ready status=%d body=%s", ready.Code, ready.Body.String())
	}

	live := httptest.NewRecorder()
	handler.ServeHTTP(live, httptest.NewRequest(http.MethodGet, "/live", nil))
	if live.Code != http.StatusOK || live.Body.String() != "{\"status\":\"ok\",\"service\":\"agents-telegram\"}\n" {
		t.Fatalf("live status=%d body=%s", live.Code, live.Body.String())
	}
}

func TestParseChatIDs(t *testing.T) {
	got, err := parseChatIDs("1, -100")
	if err != nil || !slices.Equal(got, []int64{1, -100}) {
		t.Fatalf("ids=%#v err=%v", got, err)
	}
	got, err = parseChatIDs("  ")
	if err != nil || got != nil {
		t.Fatalf("empty ids=%#v err=%v", got, err)
	}
}

func TestParseChatIDsRejectsMalformedConfiguration(t *testing.T) {
	for _, raw := range []string{"1, nope", "1,,2", "0"} {
		t.Run(raw, func(t *testing.T) {
			if ids, err := parseChatIDs(raw); err == nil || ids != nil {
				t.Fatalf("ids=%#v err=%v", ids, err)
			}
		})
	}
}
