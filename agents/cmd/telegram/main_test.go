package main

import (
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
)

func TestHealthHandler(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	recorder := httptest.NewRecorder()
	healthHandler().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || recorder.Body.String() != `{"status":"ok"}` {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestParseChatIDsIgnoresInvalidValues(t *testing.T) {
	if got := parseChatIDs("1, -100, nope"); !slices.Equal(got, []int64{1, -100}) {
		t.Fatalf("ids=%#v", got)
	}
}
