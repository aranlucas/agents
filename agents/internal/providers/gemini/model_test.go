package gemini

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

func TestNewRejectsMissingAPIKeyOrModel(t *testing.T) {
	if _, err := New(context.Background(), "", "gemini-2.5-flash", nil, ""); err == nil {
		t.Fatal("New with empty API key succeeded unexpectedly")
	}
	if _, err := New(context.Background(), "test-key", "", nil, ""); err == nil {
		t.Fatal("New with empty model name succeeded unexpectedly")
	}
}

func TestGenerateContentNonStreamingRoundTripsReasoning(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "streamGenerateContent") {
			t.Fatalf("unexpected streaming request for non-streaming call: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"candidates": [{
				"content": {
					"role": "model",
					"parts": [
						{"text": "the user wants trending terms", "thought": true},
						{"text": "SELECT term FROM trends LIMIT 10"}
					]
				},
				"finishReason": "STOP"
			}],
			"modelVersion": "gemini-2.5-flash-001"
		}`))
	}))
	defer server.Close()

	m, err := New(context.Background(), "test-key", "gemini-2.5-flash", nil, server.URL)
	if err != nil {
		t.Fatalf("New() failed: %v", err)
	}
	if m.Name() != "gemini/gemini-2.5-flash" {
		t.Fatalf("Name() = %q", m.Name())
	}

	var got *model.LLMResponse
	var gotErr error
	for response, err := range m.GenerateContent(context.Background(), &model.LLMRequest{Contents: []*genai.Content{genai.NewContentFromText("top trends?", "user")}}, false) {
		got, gotErr = response, err
	}
	if gotErr != nil {
		t.Fatalf("GenerateContent() error = %v", gotErr)
	}
	if got == nil || got.Content == nil || len(got.Content.Parts) != 2 {
		t.Fatalf("GenerateContent() = %#v", got)
	}
	if !got.Content.Parts[0].Thought || got.Content.Parts[0].Text != "the user wants trending terms" {
		t.Fatalf("reasoning part not round-tripped: %#v", got.Content.Parts[0])
	}
	if got.Content.Parts[1].Thought || got.Content.Parts[1].Text != "SELECT term FROM trends LIMIT 10" {
		t.Fatalf("text part not round-tripped: %#v", got.Content.Parts[1])
	}
	if !got.TurnComplete {
		t.Fatalf("TurnComplete = false, want true")
	}
}

func TestGenerateContentStreamingYieldsPartialThenFinalChunk(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		chunks := []string{
			`{"candidates":[{"content":{"role":"model","parts":[{"text":"thinking...","thought":true}]}}]}`,
			`{"candidates":[{"content":{"role":"model","parts":[{"text":"SELECT 1"}]},"finishReason":"STOP"}]}`,
		}
		for _, chunk := range chunks {
			_, _ = w.Write([]byte("data: " + chunk + "\n\n"))
		}
	}))
	defer server.Close()

	m, err := New(context.Background(), "test-key", "gemini-2.5-flash", nil, server.URL)
	if err != nil {
		t.Fatalf("New() failed: %v", err)
	}

	var responses []*model.LLMResponse
	for response, err := range m.GenerateContent(context.Background(), &model.LLMRequest{Contents: []*genai.Content{genai.NewContentFromText("top trends?", "user")}}, true) {
		if err != nil {
			t.Fatalf("GenerateContent() streaming error = %v", err)
		}
		responses = append(responses, response)
	}
	if len(responses) != 2 {
		t.Fatalf("got %d responses, want 2: %#v", len(responses), responses)
	}
	if !responses[0].Partial || !responses[0].Content.Parts[0].Thought {
		t.Fatalf("first chunk = %#v, want partial reasoning", responses[0])
	}
	if responses[1].Partial || !responses[1].TurnComplete || responses[1].Content.Parts[0].Text != "SELECT 1" {
		t.Fatalf("final chunk = %#v, want complete text", responses[1])
	}
}

func TestGenerateContentPropagatesProviderError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"code": 429, "message": "rate limited", "status": "RESOURCE_EXHAUSTED"}})
	}))
	defer server.Close()

	m, err := New(context.Background(), "test-key", "gemini-2.5-flash", nil, server.URL)
	if err != nil {
		t.Fatalf("New() failed: %v", err)
	}
	var gotErr error
	for _, err := range m.GenerateContent(context.Background(), &model.LLMRequest{Contents: []*genai.Content{genai.NewContentFromText("hi", "user")}}, false) {
		gotErr = err
	}
	if gotErr == nil {
		t.Fatal("GenerateContent() succeeded unexpectedly against a 429 response")
	}
}

func TestGenerateContentRejectsNilRequest(t *testing.T) {
	m, err := New(context.Background(), "test-key", "gemini-2.5-flash", nil, "https://example.invalid")
	if err != nil {
		t.Fatalf("New() failed: %v", err)
	}
	var gotErr error
	for _, err := range m.GenerateContent(context.Background(), nil, false) {
		gotErr = err
	}
	if gotErr == nil {
		t.Fatal("GenerateContent(nil) succeeded unexpectedly")
	}
}
