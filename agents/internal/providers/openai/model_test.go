package openai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"iter"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/aranlucas/agents/agents/internal/config"
	"github.com/aranlucas/agents/agents/internal/rate"
	adkmodel "google.golang.org/adk/model"
	"google.golang.org/genai"
)

func TestGenerateContentStreamsTextReasoningAndToolCall(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer provider-secret" {
			t.Fatalf("authorization = %q", r.Header.Get("Authorization"))
		}
		var request chatRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatal(err)
		}
		if !request.Stream || request.Model != "test-model" || len(request.Tools) != 1 {
			t.Fatalf("request = %#v", request)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		for _, line := range []string{
			`data: {"model":"test-model","choices":[{"delta":{"reasoning_content":"checking "}}]}`,
			`data: {"choices":[{"delta":{"content":"hello "}}]}`,
			`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"set_trip_meta","arguments":"{\"destination\":"}}]}}]}`,
			`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"Paris\"}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":10,"completion_tokens":4,"total_tokens":14}}`,
			`data: [DONE]`,
		} {
			_, _ = fmt.Fprintln(w, line)
		}
	}))
	defer server.Close()

	adapter := New(testProvider("primary", server.URL), server.Client(), allowLimiter{})
	responses, errs := collect(adapter.GenerateContent(context.Background(), toolRequest(), true))
	if len(errs) != 0 {
		t.Fatalf("errors = %v", errs)
	}
	var streamedText, streamedReasoning string
	for _, response := range responses {
		if !response.Partial {
			continue
		}
		for _, part := range response.Content.Parts {
			if part.Thought {
				streamedReasoning += part.Text
			} else {
				streamedText += part.Text
			}
		}
	}
	if streamedText != "hello " || streamedReasoning != "checking " {
		t.Fatalf("streamed text/reasoning = %q/%q", streamedText, streamedReasoning)
	}
	final := responses[len(responses)-1]
	if !final.TurnComplete || final.Partial || final.UsageMetadata.TotalTokenCount != 14 {
		t.Fatalf("final = %#v", final)
	}
	var call *genai.FunctionCall
	for _, part := range final.Content.Parts {
		if part.FunctionCall != nil {
			call = part.FunctionCall
		}
	}
	if call == nil || call.ID != "call-1" || call.Name != "set_trip_meta" || call.Args["destination"] != "Paris" {
		t.Fatalf("function call = %#v", call)
	}
}

func TestGenerateContentMapsMessagesToolsAndNonStreamingResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request chatRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatal(err)
		}
		if len(request.Messages) != 4 {
			t.Fatalf("messages = %#v", request.Messages)
		}
		if request.Messages[0].Role != "system" || request.Messages[1].Role != "user" || request.Messages[2].Role != "assistant" || request.Messages[3].Role != "tool" {
			t.Fatalf("roles = %#v", request.Messages)
		}
		if request.Messages[3].ToolCallID != "call-1" || request.Messages[3].Name != "lookup" {
			t.Fatalf("tool response = %#v", request.Messages[3])
		}
		if request.Tools[0].Function.Name != "lookup" {
			t.Fatalf("tools = %#v", request.Tools)
		}
		_ = json.NewEncoder(w).Encode(chatResponse{Model: "test-model", Choices: []chatChoice{{Message: chatDelta{Content: "complete"}, FinishReason: "stop"}}, Usage: &chatUsage{TotalTokens: 8}})
	}))
	defer server.Close()
	request := toolRequest()
	request.Config.SystemInstruction = genai.NewContentFromText("system", "user")
	request.Contents = append(request.Contents,
		&genai.Content{Role: "model", Parts: []*genai.Part{{FunctionCall: &genai.FunctionCall{ID: "call-1", Name: "lookup", Args: map[string]any{"q": "x"}}}}},
		&genai.Content{Role: "user", Parts: []*genai.Part{{FunctionResponse: &genai.FunctionResponse{ID: "call-1", Name: "lookup", Response: map[string]any{"result": "y"}}}}},
	)
	adapter := New(testProvider("primary", server.URL), server.Client(), allowLimiter{})
	responses, errs := collect(adapter.GenerateContent(context.Background(), request, false))
	if len(errs) != 0 || len(responses) != 1 || responses[0].Content.Parts[0].Text != "complete" || responses[0].UsageMetadata.TotalTokenCount != 8 {
		t.Fatalf("responses/errors = %#v/%v", responses, errs)
	}
}

func TestGenerateContentFallsBackOnlyForRetryableFailure(t *testing.T) {
	var primaryStatus atomic.Int32
	primaryStatus.Store(http.StatusTooManyRequests)
	var primaryCalls, fallbackCalls atomic.Int32
	primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		primaryCalls.Add(1)
		w.WriteHeader(int(primaryStatus.Load()))
	}))
	defer primary.Close()
	fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		fallbackCalls.Add(1)
		_ = json.NewEncoder(w).Encode(chatResponse{Choices: []chatChoice{{Message: chatDelta{Content: "fallback"}, FinishReason: "stop"}}})
	}))
	defer fallback.Close()
	first := testProvider("primary", primary.URL)
	first.Fallbacks = []string{"fallback"}
	adapter, err := NewMulti(first, map[string]config.Provider{"fallback": testProvider("fallback", fallback.URL)}, primary.Client(), allowLimiter{})
	if err != nil {
		t.Fatal(err)
	}
	responses, errs := collect(adapter.GenerateContent(context.Background(), &adkmodel.LLMRequest{Contents: genai.Text("hello")}, false))
	if len(errs) != 0 || responses[0].Content.Parts[0].Text != "fallback" || primaryCalls.Load() != 1 || fallbackCalls.Load() != 1 {
		t.Fatalf("retryable result = %#v %v calls=%d/%d", responses, errs, primaryCalls.Load(), fallbackCalls.Load())
	}

	primaryStatus.Store(http.StatusUnauthorized)
	_, errs = collect(adapter.GenerateContent(context.Background(), &adkmodel.LLMRequest{Contents: genai.Text("secret prompt")}, false))
	if len(errs) != 1 || fallbackCalls.Load() != 1 {
		t.Fatalf("terminal errors/calls = %v/%d", errs, fallbackCalls.Load())
	}
	if strings.Contains(errs[0].Error(), "secret prompt") || strings.Contains(errs[0].Error(), "provider-secret") {
		t.Fatalf("secret leaked: %v", errs[0])
	}
}

func TestCircuitBreakerSkipsRepeatedlyFailingPrimary(t *testing.T) {
	var primaryCalls atomic.Int32
	primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		primaryCalls.Add(1)
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer primary.Close()
	fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(chatResponse{Choices: []chatChoice{{Message: chatDelta{Content: "ok"}}}})
	}))
	defer fallback.Close()
	first := testProvider("primary", primary.URL)
	first.Fallbacks = []string{"fallback"}
	adapter, _ := NewMulti(first, map[string]config.Provider{"fallback": testProvider("fallback", fallback.URL)}, primary.Client(), allowLimiter{})
	for range 4 {
		_, errs := collect(adapter.GenerateContent(context.Background(), &adkmodel.LLMRequest{Contents: genai.Text("hello")}, false))
		if len(errs) != 0 {
			t.Fatal(errs)
		}
	}
	if primaryCalls.Load() != circuitThreshold {
		t.Fatalf("primary calls = %d", primaryCalls.Load())
	}
}

func TestLimiterOverflowUsesFallback(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(chatResponse{Choices: []chatChoice{{Message: chatDelta{Content: "ok"}}}})
	}))
	defer server.Close()
	primary := testProvider("primary", server.URL)
	primary.Fallbacks = []string{"fallback"}
	adapter, _ := NewMulti(primary, map[string]config.Provider{"fallback": testProvider("fallback", server.URL)}, server.Client(), selectiveLimiter{})
	responses, errs := collect(adapter.GenerateContent(context.Background(), &adkmodel.LLMRequest{Contents: genai.Text("hello")}, false))
	if len(errs) != 0 || responses[0].Content.Parts[0].Text != "ok" {
		t.Fatalf("responses/errors = %#v/%v", responses, errs)
	}
}

func TestTruncatedStreamReturnsRetryableErrorWithoutFallbackAfterEmission(t *testing.T) {
	var fallbackCalls atomic.Int32
	primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = fmt.Fprintln(w, `data: {"choices":[{"delta":{"content":"partial"}}]}`)
	}))
	defer primary.Close()
	fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		fallbackCalls.Add(1)
		_, _ = fmt.Fprintln(w, `data: [DONE]`)
	}))
	defer fallback.Close()
	first := testProvider("primary", primary.URL)
	first.Fallbacks = []string{"fallback"}
	adapter, _ := NewMulti(first, map[string]config.Provider{"fallback": testProvider("fallback", fallback.URL)}, primary.Client(), allowLimiter{})
	responses, errs := collect(adapter.GenerateContent(context.Background(), &adkmodel.LLMRequest{Contents: genai.Text("hello")}, true))
	if len(responses) != 1 || len(errs) != 1 || fallbackCalls.Load() != 0 {
		t.Fatalf("responses/errors/fallback = %d/%v/%d", len(responses), errs, fallbackCalls.Load())
	}
	var providerError *ProviderError
	if !errors.As(errs[0], &providerError) || !providerError.Retryable {
		t.Fatalf("error = %v", errs[0])
	}
}

func toolRequest() *adkmodel.LLMRequest {
	return &adkmodel.LLMRequest{
		Contents: genai.Text("plan a trip"),
		Config: &genai.GenerateContentConfig{
			Tools: []*genai.Tool{{
				FunctionDeclarations: []*genai.FunctionDeclaration{{
					Name: "lookup", Description: "look up a place",
					Parameters: &genai.Schema{Type: genai.TypeObject, Properties: map[string]*genai.Schema{"q": {Type: genai.TypeString}}, Required: []string{"q"}},
				}},
			}},
		},
	}
}

func testProvider(name, endpoint string) config.Provider {
	return config.Provider{Name: name, BaseURL: endpoint, APIKey: "provider-secret", Model: "test-model", RequestsPerMinute: 100}
}

type allowLimiter struct{}

func (allowLimiter) Acquire(context.Context, string, int) error { return nil }

type selectiveLimiter struct{}

func (selectiveLimiter) Acquire(_ context.Context, provider string, _ int) error {
	if provider == "primary" {
		return rate.ErrLimitReached
	}
	return nil
}

func collect(sequence iter.Seq2[*adkmodel.LLMResponse, error]) ([]*adkmodel.LLMResponse, []error) {
	var responses []*adkmodel.LLMResponse
	var errs []error
	for response, err := range sequence {
		if response != nil {
			responses = append(responses, response)
		}
		if err != nil {
			errs = append(errs, err)
		}
	}
	return responses, errs
}
