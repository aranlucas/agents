package app

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/model/gemini"
	"google.golang.org/genai"
)

func TestOralboardsGeminiRetryPolicyMatchesProviderGuidance(t *testing.T) {
	retry := oralboardsGeminiClientConfig("test-key").HTTPOptions.RetryOptions
	if retry == nil {
		t.Fatal("retry options are nil")
	}
	if retry.Attempts != nil || retry.InitialDelay != nil || retry.MaxDelay != nil || retry.ExpBase != nil || retry.Jitter != nil || len(retry.HTTPStatusCodes) != 0 {
		t.Fatalf("retry options override provider defaults: %#v", retry)
	}
}

func TestOralboardsGeminiRetriesTemporaryUnavailableResponse(t *testing.T) {
	for _, status := range []int{408, 429, 500, 502, 503, 504} {
		for _, stream := range []bool{false, true} {
			name := fmt.Sprintf("%d/%s", status, map[bool]string{false: "unary", true: "streaming"}[stream])
			t.Run(name, func(t *testing.T) {
				var calls atomic.Int32
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
					if calls.Add(1) == 1 {
						w.Header().Set("Content-Type", "application/json")
						w.WriteHeader(status)
						_, _ = fmt.Fprintf(w, `{"error":{"code":%d,"message":"Temporary provider failure.","status":"UNAVAILABLE"}}`, status)
						return
					}
					response := `{"candidates":[{"content":{"role":"model","parts":[{"text":"Recovered examiner response"}]},"finishReason":"STOP"}]}`
					if stream {
						w.Header().Set("Content-Type", "text/event-stream")
						_, _ = io.WriteString(w, "data: "+response+"\n\n")
						return
					}
					w.Header().Set("Content-Type", "application/json")
					_, _ = io.WriteString(w, response)
				}))
				defer server.Close()

				llm := newImmediateRetryGeminiModel(t, server.URL)
				var responseText string
				for response, generateErr := range llm.GenerateContent(t.Context(), &model.LLMRequest{
					Contents: genai.Text("Continue the oral-board examination."),
				}, stream) {
					if generateErr != nil {
						t.Fatalf("model call did not recover from HTTP %d: %v", status, generateErr)
					}
					if response != nil && response.Content != nil && len(response.Content.Parts) > 0 {
						responseText = response.Content.Parts[0].Text
					}
				}
				if calls.Load() != 2 || responseText != "Recovered examiner response" {
					t.Fatalf("calls = %d, response = %q", calls.Load(), responseText)
				}
			})
		}
	}
}

func TestOralboardsGeminiDoesNotRetryPermanentResponse(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, `{"error":{"code":400,"message":"Invalid request.","status":"INVALID_ARGUMENT"}}`)
	}))
	defer server.Close()

	llm := newImmediateRetryGeminiModel(t, server.URL)
	var modelErr error
	for _, err := range llm.GenerateContent(t.Context(), &model.LLMRequest{Contents: genai.Text("invalid")}, false) {
		modelErr = err
	}
	if modelErr == nil {
		t.Fatal("permanent response returned no error")
	}
	if calls.Load() != 1 {
		t.Fatalf("permanent response calls = %d, want 1", calls.Load())
	}
}

func TestOralboardsGeminiStopsAfterDocumentedAttemptLimit(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = io.WriteString(w, `{"error":{"code":503,"message":"High demand.","status":"UNAVAILABLE"}}`)
	}))
	defer server.Close()

	llm := newImmediateRetryGeminiModel(t, server.URL)
	var modelErr error
	for _, err := range llm.GenerateContent(t.Context(), &model.LLMRequest{Contents: genai.Text("retry")}, false) {
		modelErr = err
	}
	if modelErr == nil {
		t.Fatal("exhausted retry response returned no error")
	}
	if calls.Load() != 5 {
		t.Fatalf("exhausted retry calls = %d, want 5", calls.Load())
	}
}

func newImmediateRetryGeminiModel(t *testing.T, baseURL string) model.LLM {
	t.Helper()
	config := oralboardsGeminiClientConfig("test-key")
	config.HTTPOptions.BaseURL = baseURL
	config.HTTPOptions.RetryOptions.InitialDelay = new(0.0)
	config.HTTPOptions.RetryOptions.MaxDelay = new(0.0)
	config.HTTPOptions.RetryOptions.Jitter = new(0.0)
	llm, err := gemini.NewModel(t.Context(), "test-model", config)
	if err != nil {
		t.Fatal(err)
	}
	return llm
}
