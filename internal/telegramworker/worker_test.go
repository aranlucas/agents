package telegramworker

import (
	"context"
	json "encoding/json/v2"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

type stubHealthChecker struct{ err error }

func (checker stubHealthChecker) Health(context.Context) error { return checker.err }

func TestHealthHandlerSeparatesLivenessAndReadiness(t *testing.T) {
	handler := healthHandler(stubHealthChecker{})

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
			if path != "/live" {
				response := decodeHealthResponse(t, recorder)
				if response.Status != "ok" || response.Service != "agents-telegram" || response.Checks["database"] != "ok" {
					t.Fatalf("response=%#v", response)
				}
			}
		})
	}
}

func TestHealthHandlerKeepsLivenessHealthyWhenDependencyIsDown(t *testing.T) {
	handler := healthHandler(stubHealthChecker{err: errors.New("database unavailable")})

	ready := httptest.NewRecorder()
	handler.ServeHTTP(ready, httptest.NewRequest(http.MethodGet, "/ready", nil))
	readyResponse := decodeHealthResponse(t, ready)
	if ready.Code != http.StatusServiceUnavailable || readyResponse.Status != "degraded" || readyResponse.Service != "agents-telegram" || readyResponse.Checks["database"] != "unavailable" {
		t.Fatalf("ready status=%d body=%s", ready.Code, ready.Body.String())
	}

	live := httptest.NewRecorder()
	handler.ServeHTTP(live, httptest.NewRequest(http.MethodGet, "/live", nil))
	liveResponse := decodeHealthResponse(t, live)
	if live.Code != http.StatusOK || liveResponse.Status != "ok" || liveResponse.Service != "agents-telegram" || liveResponse.Checks != nil {
		t.Fatalf("live status=%d body=%s", live.Code, live.Body.String())
	}
}

func decodeHealthResponse(t *testing.T, recorder *httptest.ResponseRecorder) healthResponse {
	t.Helper()
	var response healthResponse
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode health response: %v", err)
	}
	return response
}
