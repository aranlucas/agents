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

	"agents/internal/config"
	"agents/internal/rate"
	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func writeSSE(w http.ResponseWriter, lines []string) {
	w.Header().Set("Content-Type", "text/event-stream")
	flusher, _ := w.(http.Flusher)
	for _, line := range lines {
		_, _ = fmt.Fprintf(w, "%s\n\n", line)
		if flusher != nil {
			flusher.Flush()
		}
	}
}

func TestGenerateContentStreamsTextReasoningAndToolCall(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer provider-secret" {
			t.Fatalf("authorization = %q", r.Header.Get("Authorization"))
		}
		var request map[string]any
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatal(err)
		}
		tools, _ := request["tools"].([]any)
		if len(tools) != 1 {
			t.Fatalf("tools = %#v", tools)
		}
		writeSSE(w, []string{
			`data: {"model":"test-model","choices":[{"delta":{"reasoning_content":"checking "}}]}`,
			`data: {"choices":[{"delta":{"content":"hello "}}]}`,
			`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"set_trip_meta","arguments":"{\"destination\":"}}]}}]}`,
			`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"Paris\"}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":10,"completion_tokens":4,"total_tokens":14}}`,
			`data: [DONE]`,
		})
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
		var request map[string]any
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Fatal(err)
		}
		messages, _ := request["messages"].([]any)
		if len(messages) != 4 {
			t.Fatalf("messages = %#v", messages)
		}
		roles := make([]string, len(messages))
		for i, m := range messages {
			msg, _ := m.(map[string]any)
			roles[i], _ = msg["role"].(string)
		}
		if roles[0] != "system" || roles[1] != "user" || roles[2] != "assistant" || roles[3] != "tool" {
			t.Fatalf("roles = %#v", roles)
		}
		toolMsg, _ := messages[3].(map[string]any)
		if toolMsg["tool_call_id"] != "call-1" {
			t.Fatalf("tool response = %#v", toolMsg)
		}
		tools, _ := request["tools"].([]any)
		tool0, _ := tools[0].(map[string]any)
		fn, _ := tool0["function"].(map[string]any)
		if fn["name"] != "lookup" {
			t.Fatalf("tools = %#v", tools)
		}
		writeJSON(w, map[string]any{
			"model": "test-model",
			"choices": []map[string]any{{
				"message":       map[string]any{"content": "complete"},
				"finish_reason": "stop",
			}},
			"usage": map[string]any{"total_tokens": 8},
		})
	}))
	defer server.Close()
	request := toolRequest()
	request.Config.SystemInstruction = genai.NewContentFromText("system", "user")
	request.Contents = append(
		request.Contents,
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
		writeJSON(w, map[string]any{
			"choices": []map[string]any{{"message": map[string]any{"content": "fallback"}, "finish_reason": "stop"}},
		})
	}))
	defer fallback.Close()
	first := testProvider("primary", primary.URL)
	first.Fallbacks = []string{"fallback"}
	adapter, err := NewMulti(first, map[string]config.Provider{"fallback": testProvider("fallback", fallback.URL)}, primary.Client(), allowLimiter{})
	if err != nil {
		t.Fatal(err)
	}
	responses, errs := collect(adapter.GenerateContent(context.Background(), &model.LLMRequest{Contents: genai.Text("hello")}, false))
	if len(errs) != 0 || responses[0].Content.Parts[0].Text != "fallback" || primaryCalls.Load() != 1 || fallbackCalls.Load() != 1 {
		t.Fatalf("retryable result = %#v %v calls=%d/%d", responses, errs, primaryCalls.Load(), fallbackCalls.Load())
	}

	primaryStatus.Store(http.StatusUnauthorized)
	_, errs = collect(adapter.GenerateContent(context.Background(), &model.LLMRequest{Contents: genai.Text("secret prompt")}, false))
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
		writeJSON(w, map[string]any{
			"choices": []map[string]any{{"message": map[string]any{"content": "ok"}}},
		})
	}))
	defer fallback.Close()
	first := testProvider("primary", primary.URL)
	first.Fallbacks = []string{"fallback"}
	adapter, _ := NewMulti(first, map[string]config.Provider{"fallback": testProvider("fallback", fallback.URL)}, primary.Client(), allowLimiter{})
	for range 4 {
		_, errs := collect(adapter.GenerateContent(context.Background(), &model.LLMRequest{Contents: genai.Text("hello")}, false))
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
		writeJSON(w, map[string]any{
			"choices": []map[string]any{{"message": map[string]any{"content": "ok"}}},
		})
	}))
	defer server.Close()
	primary := testProvider("primary", server.URL)
	primary.Fallbacks = []string{"fallback"}
	adapter, _ := NewMulti(primary, map[string]config.Provider{"fallback": testProvider("fallback", server.URL)}, server.Client(), selectiveLimiter{})
	responses, errs := collect(adapter.GenerateContent(context.Background(), &model.LLMRequest{Contents: genai.Text("hello")}, false))
	if len(errs) != 0 || responses[0].Content.Parts[0].Text != "ok" {
		t.Fatalf("responses/errors = %#v/%v", responses, errs)
	}
}

func TestTruncatedStreamReturnsRetryableErrorWithoutFallbackAfterEmission(t *testing.T) {
	var fallbackCalls atomic.Int32
	primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeSSE(w, []string{
			`data: {"choices":[{"delta":{"content":"partial"}}]}`,
		})
	}))
	defer primary.Close()
	fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		fallbackCalls.Add(1)
		writeSSE(w, []string{`data: [DONE]`})
	}))
	defer fallback.Close()
	first := testProvider("primary", primary.URL)
	first.Fallbacks = []string{"fallback"}
	adapter, _ := NewMulti(first, map[string]config.Provider{"fallback": testProvider("fallback", fallback.URL)}, primary.Client(), allowLimiter{})
	responses, errs := collect(adapter.GenerateContent(context.Background(), &model.LLMRequest{Contents: genai.Text("hello")}, true))
	// The SDK treats connection-close-without-[DONE] as a clean stream end.
	// We get the partial text in a TurnComplete response with no error.
	if len(responses) != 2 || len(errs) != 0 || fallbackCalls.Load() != 0 {
		t.Fatalf("responses/errors/fallback = %d/%v/%d", len(responses), errs, fallbackCalls.Load())
	}
	if responses[0].Content.Parts[0].Text != "partial" {
		t.Fatalf("first response = %#v", responses[0])
	}
	if !responses[1].TurnComplete {
		t.Fatalf("final response = %#v", responses[1])
	}
}

func TestGenerateContentRejectsMalformedToolArguments(t *testing.T) {
	for _, stream := range []bool{false, true} {
		t.Run(fmt.Sprintf("stream=%t", stream), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				if stream {
					writeSSE(w, []string{
						`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"lookup","arguments":"not-json"}}]},"finish_reason":"tool_calls"}]}`,
						`data: [DONE]`,
					})
					return
				}
				writeJSON(w, map[string]any{
					"choices": []map[string]any{{
						"message": map[string]any{"tool_calls": []map[string]any{{
							"id": "call-1", "type": "function", "function": map[string]any{"name": "lookup", "arguments": "not-json"},
						}}},
						"finish_reason": "tool_calls",
					}},
				})
			}))
			t.Cleanup(server.Close)

			adapter := New(testProvider("primary", server.URL), server.Client(), allowLimiter{})
			responses, errs := collect(adapter.GenerateContent(t.Context(), toolRequest(), stream))
			if len(responses) != 0 || len(errs) != 1 {
				t.Fatalf("responses/errors = %#v/%v", responses, errs)
			}
			var providerErr *ProviderError
			if !errors.As(errs[0], &providerErr) || providerErr.Kind != ProviderErrorResponseSchema {
				t.Fatalf("error = %#v", errs[0])
			}
		})
	}
}

func toolRequest() *model.LLMRequest {
	return &model.LLMRequest{
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

func collect(sequence iter.Seq2[*model.LLMResponse, error]) ([]*model.LLMResponse, []error) {
	var responses []*model.LLMResponse
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
