package openai

import (
	"context"
	json "encoding/json/v2"
	"errors"
	"fmt"
	"iter"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/aranlucas/agents/internal/config"
	"github.com/aranlucas/agents/internal/rate"
	"github.com/google/jsonschema-go/jsonschema"
	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.MarshalWrite(w, v)
}

func writeSSE(w http.ResponseWriter, events []string) {
	w.Header().Set("Content-Type", "text/event-stream")
	flusher, _ := w.(http.Flusher)
	for _, event := range events {
		_, _ = fmt.Fprintf(w, "data: %s\n\n", event)
		if flusher != nil {
			flusher.Flush()
		}
	}
}

func textResponse(text string) map[string]any {
	return map[string]any{
		"id":     "resp-1",
		"model":  "test-model",
		"status": "completed",
		"output": []map[string]any{{
			"id": "msg-1", "type": "message", "role": "assistant",
			"content": []map[string]any{{"type": "output_text", "text": text}},
		}},
		"usage": map[string]any{
			"input_tokens": 3, "input_tokens_details": map[string]any{"cached_tokens": 1},
			"output_tokens": 5, "output_tokens_details": map[string]any{"reasoning_tokens": 2},
			"total_tokens": 8,
		},
	}
}

func TestGenerateContentUsesADKResponsesProvider(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("path = %q", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer provider-secret" {
			t.Fatalf("authorization = %q", r.Header.Get("Authorization"))
		}
		var request map[string]any
		if err := json.UnmarshalRead(r.Body, &request); err != nil {
			t.Fatal(err)
		}
		if request["model"] != "test-model" {
			t.Fatalf("model = %#v", request["model"])
		}
		reasoning, _ := request["reasoning"].(map[string]any)
		if reasoning["effort"] != "low" {
			t.Fatalf("reasoning = %#v", request["reasoning"])
		}
		if request["instructions"] != "system" {
			t.Fatalf("instructions = %#v", request["instructions"])
		}
		input, _ := request["input"].([]any)
		if len(input) != 3 {
			t.Fatalf("input = %#v", input)
		}
		tools, _ := request["tools"].([]any)
		if len(tools) != 1 {
			t.Fatalf("tools = %#v", tools)
		}
		textConfig, _ := request["text"].(map[string]any)
		format, _ := textConfig["format"].(map[string]any)
		schema, _ := format["schema"].(map[string]any)
		if schema["additionalProperties"] != false {
			t.Fatalf("strict response schema = %#v", schema)
		}
		writeJSON(w, textResponse("complete"))
	}))
	defer server.Close()

	provider := testProvider("primary", server.URL+"/v1")
	provider.ReasoningEffort = "low"
	request := toolRequest()
	request.Model = "must-not-override-provider-policy"
	request.Config.SystemInstruction = genai.NewContentFromText("system", "system")
	request.Config.ResponseJsonSchema = &jsonschema.Schema{
		Type:       "object",
		Properties: map[string]*jsonschema.Schema{"answer": {Type: "string"}},
	}
	request.Contents = append(
		request.Contents,
		&genai.Content{Role: "model", Parts: []*genai.Part{{
			FunctionCall: &genai.FunctionCall{ID: "call-1", Name: "lookup", Args: map[string]any{"q": "x"}},
		}}},
		&genai.Content{Role: "user", Parts: []*genai.Part{{
			FunctionResponse: &genai.FunctionResponse{ID: "call-1", Name: "lookup", Response: map[string]any{"result": "y"}},
		}}},
	)

	originalConfig, err := json.Marshal(request.Config, json.Deterministic(true))
	if err != nil {
		t.Fatal(err)
	}
	responses, errs := collect(New(provider, server.Client(), allowLimiter{}).GenerateContent(t.Context(), request, false))
	afterConfig, err := json.Marshal(request.Config, json.Deterministic(true))
	if err != nil || string(afterConfig) != string(originalConfig) {
		t.Fatalf("provider mutated caller-owned config: before=%s after=%s err=%v", originalConfig, afterConfig, err)
	}
	if len(errs) != 0 || len(responses) != 1 {
		t.Fatalf("responses/errors = %#v/%v", responses, errs)
	}
	response := responses[0]
	if response.Content.Parts[0].Text != "complete" {
		t.Fatalf("response = %#v", response)
	}
	if response.CustomMetadata["openai_response_id"] != "resp-1" || response.CustomMetadata["openai_model"] != "test-model" {
		t.Fatalf("metadata = %#v", response.CustomMetadata)
	}
	if response.UsageMetadata.TotalTokenCount != 8 ||
		response.UsageMetadata.CachedContentTokenCount != 1 ||
		response.UsageMetadata.ThoughtsTokenCount != 2 {
		t.Fatalf("usage = %#v", response.UsageMetadata)
	}
}

func TestGenerateContentStreamsTextReasoningAndToolCall(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/responses" {
			t.Fatalf("path = %q", r.URL.Path)
		}
		writeSSE(w, []string{
			`{"type":"response.created","response":{"id":"resp-stream","model":"test-model"}}`,
			`{"type":"response.reasoning_text.delta","delta":"checking "}`,
			`{"type":"response.output_text.delta","delta":"hello "}`,
			`{"type":"response.output_item.added","item":{"type":"function_call","id":"fc-1","call_id":"call-1","name":"lookup"}}`,
			`{"type":"response.function_call_arguments.delta","item_id":"fc-1","delta":"{\"q\":\"Paris\"}"}`,
			`{"type":"response.function_call_arguments.done","item_id":"fc-1","arguments":""}`,
			`{"type":"response.completed","response":{"id":"resp-stream","model":"test-model","status":"completed","usage":{"input_tokens":10,"output_tokens":4,"total_tokens":14}}}`,
			`[DONE]`,
		})
	}))
	defer server.Close()

	adapter := New(testProvider("primary", server.URL+"/v1"), server.Client(), allowLimiter{})
	responses, errs := collect(adapter.GenerateContent(t.Context(), toolRequest(), true))
	if len(errs) != 0 {
		t.Fatalf("errors = %v", errs)
	}
	var streamedText, streamedReasoning string
	var call *genai.FunctionCall
	for _, response := range responses {
		if response.CustomMetadata["openai_response_id"] != "resp-stream" {
			t.Fatalf("metadata = %#v", response.CustomMetadata)
		}
		for _, part := range response.Content.Parts {
			switch {
			case part.FunctionCall != nil:
				call = part.FunctionCall
			case part.Thought && response.Partial:
				streamedReasoning += part.Text
			case response.Partial:
				streamedText += part.Text
			}
		}
	}
	if streamedText != "hello " || streamedReasoning != "checking " {
		t.Fatalf("streamed text/reasoning = %q/%q", streamedText, streamedReasoning)
	}
	if call == nil || call.ID != "call-1" || call.Name != "lookup" || call.Args["q"] != "Paris" {
		t.Fatalf("function call = %#v", call)
	}
	final := responses[len(responses)-1]
	if final.Partial || final.UsageMetadata.TotalTokenCount != 14 {
		t.Fatalf("final = %#v", final)
	}
}

func TestNilHTTPClientUsesSharedSafeClient(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, textResponse("complete"))
	}))
	t.Cleanup(server.Close)
	adapter := New(testProvider("primary", server.URL), nil, allowLimiter{})
	responses, errs := collect(adapter.GenerateContent(t.Context(), &model.LLMRequest{Contents: genai.Text("prompt-secret")}, false))
	if len(errs) != 0 || len(responses) != 1 {
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
		writeJSON(w, textResponse("fallback"))
	}))
	defer fallback.Close()
	first := testProvider("primary", primary.URL)
	first.Fallbacks = []string{"fallback"}
	adapter, err := NewMulti(first, map[string]config.Provider{"fallback": testProvider("fallback", fallback.URL)}, primary.Client(), allowLimiter{})
	if err != nil {
		t.Fatal(err)
	}
	responses, errs := collect(adapter.GenerateContent(t.Context(), &model.LLMRequest{Contents: genai.Text("hello")}, false))
	if len(errs) != 0 || responses[0].Content.Parts[0].Text != "fallback" || primaryCalls.Load() != 1 || fallbackCalls.Load() != 1 {
		t.Fatalf("retryable result = %#v %v calls=%d/%d", responses, errs, primaryCalls.Load(), fallbackCalls.Load())
	}

	primaryStatus.Store(http.StatusRequestEntityTooLarge)
	responses, errs = collect(adapter.GenerateContent(t.Context(), &model.LLMRequest{Contents: genai.Text("oversized")}, false))
	if len(errs) != 0 || responses[0].Content.Parts[0].Text != "fallback" || primaryCalls.Load() != 2 || fallbackCalls.Load() != 2 {
		t.Fatalf("payload fallback result = %#v %v calls=%d/%d", responses, errs, primaryCalls.Load(), fallbackCalls.Load())
	}

	primaryStatus.Store(http.StatusUnauthorized)
	_, errs = collect(adapter.GenerateContent(t.Context(), &model.LLMRequest{Contents: genai.Text("secret prompt")}, false))
	if len(errs) != 1 || fallbackCalls.Load() != 2 {
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
		writeJSON(w, textResponse("ok"))
	}))
	defer fallback.Close()
	first := testProvider("primary", primary.URL)
	first.Fallbacks = []string{"fallback"}
	adapter, _ := NewMulti(first, map[string]config.Provider{"fallback": testProvider("fallback", fallback.URL)}, primary.Client(), allowLimiter{})
	for range 4 {
		_, errs := collect(adapter.GenerateContent(t.Context(), &model.LLMRequest{Contents: genai.Text("hello")}, false))
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
		writeJSON(w, textResponse("ok"))
	}))
	defer server.Close()
	primary := testProvider("primary", server.URL)
	primary.Fallbacks = []string{"fallback"}
	adapter, _ := NewMulti(primary, map[string]config.Provider{"fallback": testProvider("fallback", server.URL)}, server.Client(), selectiveLimiter{})
	responses, errs := collect(adapter.GenerateContent(t.Context(), &model.LLMRequest{Contents: genai.Text("hello")}, false))
	if len(errs) != 0 || responses[0].Content.Parts[0].Text != "ok" {
		t.Fatalf("responses/errors = %#v/%v", responses, errs)
	}
}

func TestLimiterFailuresRemainStorageOrContextErrors(t *testing.T) {
	for _, cause := range []error{errors.New("D1 query failed (HTTP 503)"), context.Canceled, context.DeadlineExceeded} {
		t.Run(cause.Error(), func(t *testing.T) {
			limiterError := fmt.Errorf("acquire provider limit: %w", cause)
			adapter := newModel([]config.Provider{
				testProvider("primary", "https://example.invalid"),
				testProvider("fallback", "https://example.invalid"),
			}, nil, failingLimiter{limiterError})
			for i := range adapter.providers {
				adapter.providers[i].model = scriptedModel(func(context.Context) iter.Seq2[*model.LLMResponse, error] {
					t.Fatal("model called without acquiring a quota slot")
					return nil
				})
			}
			responses, errs := collect(adapter.GenerateContent(t.Context(), &model.LLMRequest{Contents: genai.Text("hello")}, false))
			if len(responses) != 0 || len(errs) != 1 || !errors.Is(errs[0], cause) {
				t.Fatalf("responses/errors = %#v/%v", responses, errs)
			}
			if _, ok := errors.AsType[*ProviderError](errs[0]); ok {
				t.Fatalf("limiter failure incorrectly classified as a provider error: %v", errs[0])
			}
			if len(adapter.circuits) != 0 {
				t.Fatalf("limiter failure changed provider circuits: %#v", adapter.circuits)
			}
		})
	}
}

func TestStreamErrorDoesNotFallbackAfterEmission(t *testing.T) {
	var fallbackCalls atomic.Int32
	primary := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeSSE(w, []string{
			`{"type":"response.created","response":{"id":"resp-stream","model":"test-model"}}`,
			`{"type":"response.output_text.delta","delta":"partial"}`,
			`{"type":"error","message":"stream failed"}`,
			`[DONE]`,
		})
	}))
	defer primary.Close()
	fallback := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		fallbackCalls.Add(1)
		writeJSON(w, textResponse("fallback"))
	}))
	defer fallback.Close()
	first := testProvider("primary", primary.URL)
	first.Fallbacks = []string{"fallback"}
	first.FirstContentTimeout = time.Second
	adapter, _ := NewMulti(first, map[string]config.Provider{"fallback": testProvider("fallback", fallback.URL)}, primary.Client(), allowLimiter{})
	responses, errs := collect(adapter.GenerateContent(t.Context(), &model.LLMRequest{Contents: genai.Text("hello")}, true))
	if len(responses) != 1 || len(errs) != 1 || fallbackCalls.Load() != 0 {
		t.Fatalf("responses/errors/fallback = %d/%v/%d", len(responses), errs, fallbackCalls.Load())
	}
	if responses[0].Content.Parts[0].Text != "partial" {
		t.Fatalf("first response = %#v", responses[0])
	}
}

func TestGenerateContentRejectsMalformedToolArguments(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{
			"id": "resp-1", "model": "test-model", "status": "completed",
			"output": []map[string]any{{
				"type": "function_call", "id": "fc-1", "call_id": "call-1",
				"name": "lookup", "arguments": "not-json",
			}},
		})
	}))
	defer server.Close()

	responses, errs := collect(New(testProvider("primary", server.URL), server.Client(), allowLimiter{}).GenerateContent(t.Context(), toolRequest(), false))
	if len(responses) != 0 || len(errs) != 1 {
		t.Fatalf("responses/errors = %#v/%v", responses, errs)
	}
	providerErr, ok := errors.AsType[*ProviderError](errs[0])
	if !ok || providerErr.Kind != ProviderErrorResponseSchema {
		t.Fatalf("error = %#v", errs[0])
	}
}

func TestGenerateContentClassifiesProviderNotFound(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		writeJSON(w, map[string]any{"error": map[string]any{
			"message": "model slug is unavailable", "type": "invalid_request_error", "code": "model_not_found",
		}})
	}))
	defer server.Close()

	_, errs := collect(New(testProvider("openrouter", server.URL), server.Client(), allowLimiter{}).GenerateContent(t.Context(), &model.LLMRequest{Contents: genai.Text("hello")}, false))
	if len(errs) != 1 {
		t.Fatalf("errors = %#v, want one", errs)
	}
	providerError, ok := errors.AsType[*ProviderError](errs[0])
	if !ok {
		t.Fatalf("error = %T, want ProviderError", errs[0])
	}
	if providerError.Provider != "openrouter" || providerError.Model != "test-model" || providerError.Status != http.StatusNotFound || providerError.Kind != ProviderErrorNotFound || providerError.Retryable {
		t.Fatalf("provider error = %#v", providerError)
	}
	if got := providerError.Error(); got != "provider openrouter could not find model test-model (HTTP 404)" {
		t.Fatalf("error text = %q", got)
	}
}

func TestSanitizeRequestDropsThoughtArtifacts(t *testing.T) {
	request := &model.LLMRequest{
		Model: "upstream-model",
		Contents: []*genai.Content{{
			Role: "user",
			Parts: []*genai.Part{
				{Text: "hidden", Thought: true},
				{ThoughtSignature: []byte{1, 2, 3}},
				{Text: "visible"},
			},
		}},
	}
	got := sanitizeRequest(request, "provider-model")
	if got.Model != "provider-model" || len(got.Contents) != 1 || len(got.Contents[0].Parts) != 1 || got.Contents[0].Parts[0].Text != "visible" {
		t.Fatalf("sanitized request = %#v", got)
	}
	if request.Model != "upstream-model" || len(request.Contents[0].Parts) != 3 {
		t.Fatalf("source request was mutated = %#v", request)
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

type failingLimiter struct{ err error }

func (l failingLimiter) Acquire(context.Context, string, int) error { return l.err }

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

// scriptedModel exercises startup cancellation without depending on network timing.
type scriptedModel func(context.Context) iter.Seq2[*model.LLMResponse, error]

func (scriptedModel) Name() string { return "scripted" }

func (s scriptedModel) GenerateContent(ctx context.Context, _ *model.LLMRequest, _ bool) iter.Seq2[*model.LLMResponse, error] {
	return s(ctx)
}

func TestFirstContentTimeoutFallsBackWithoutLeakingReasoning(t *testing.T) {
	for _, reasoning := range []bool{false, true} {
		t.Run(fmt.Sprint("reasoning=", reasoning), func(t *testing.T) {
			primary := testProvider("primary", "https://example.invalid")
			primary.FirstContentTimeout = 20 * time.Millisecond
			adapter := newModel([]config.Provider{primary, testProvider("fallback", "https://example.invalid")}, nil, allowLimiter{})
			adapter.providers[0].model = scriptedModel(func(ctx context.Context) iter.Seq2[*model.LLMResponse, error] {
				return func(yield func(*model.LLMResponse, error) bool) {
					if reasoning && !yield(&model.LLMResponse{Content: &genai.Content{Parts: []*genai.Part{{Text: "thinking", Thought: true}}}}, nil) {
						return
					}
					<-ctx.Done()
					yield(nil, ctx.Err())
				}
			})
			adapter.providers[1].model = scriptedModel(func(context.Context) iter.Seq2[*model.LLMResponse, error] {
				return func(yield func(*model.LLMResponse, error) bool) {
					yield(&model.LLMResponse{Content: genai.NewContentFromText("fallback", genai.RoleModel)}, nil)
				}
			})
			responses, errs := collect(adapter.GenerateContent(t.Context(), &model.LLMRequest{Contents: genai.Text("hello")}, true))
			if len(errs) != 0 || len(responses) != 1 || responses[0].Content.Parts[0].Text != "fallback" {
				t.Fatalf("responses/errors = %#v/%v", responses, errs)
			}
		})
	}
}

func TestFirstContentDeadlineStopsAfterTextOrTool(t *testing.T) {
	for _, part := range []*genai.Part{{Text: "hello"}, {FunctionCall: &genai.FunctionCall{Name: "lookup"}}} {
		t.Run(fmt.Sprint("tool=", part.FunctionCall != nil), func(t *testing.T) {
			provider := testProvider("primary", "https://example.invalid")
			provider.FirstContentTimeout = 100 * time.Millisecond
			adapter := New(provider, nil, allowLimiter{})
			adapter.providers[0].model = scriptedModel(func(ctx context.Context) iter.Seq2[*model.LLMResponse, error] {
				return func(yield func(*model.LLMResponse, error) bool) {
					if !yield(&model.LLMResponse{Content: &genai.Content{Parts: []*genai.Part{{Text: "thinking", Thought: true}}}}, nil) {
						return
					}
					if !yield(&model.LLMResponse{Content: &genai.Content{Parts: []*genai.Part{part}}}, nil) {
						return
					}
					select {
					case <-ctx.Done():
						yield(nil, ctx.Err())
					case <-time.After(2 * provider.FirstContentTimeout):
						yield(&model.LLMResponse{TurnComplete: true}, nil)
					}
				}
			})
			responses, errs := collect(adapter.GenerateContent(t.Context(), &model.LLMRequest{Contents: genai.Text("hello")}, true))
			if len(errs) != 0 || len(responses) != 3 || !responses[2].TurnComplete {
				t.Fatalf("responses/errors = %#v/%v", responses, errs)
			}
		})
	}
}

func TestFirstContentTimeoutDoesNotFallbackOnCallerCancellation(t *testing.T) {
	primary := testProvider("primary", "https://example.invalid")
	primary.FirstContentTimeout = time.Second
	adapter := newModel([]config.Provider{primary, testProvider("fallback", "https://example.invalid")}, nil, allowLimiter{})
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	adapter.providers[0].model = scriptedModel(func(ctx context.Context) iter.Seq2[*model.LLMResponse, error] {
		return func(yield func(*model.LLMResponse, error) bool) {
			cancel()
			<-ctx.Done()
			yield(nil, ctx.Err())
		}
	})
	adapter.providers[1].model = scriptedModel(func(context.Context) iter.Seq2[*model.LLMResponse, error] {
		t.Fatal("fallback called after cancellation")
		return nil
	})
	responses, errs := collect(adapter.GenerateContent(ctx, &model.LLMRequest{Contents: genai.Text("hello")}, true))
	if len(responses) != 0 || len(errs) != 1 || !errors.Is(errs[0], context.Canceled) {
		t.Fatalf("responses/errors = %#v/%v", responses, errs)
	}
	if len(adapter.circuits) != 0 {
		t.Fatalf("caller cancellation changed provider circuits: %#v", adapter.circuits)
	}
}

func TestGenerateContentRequestsNoReasoning(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request map[string]any
		if err := json.UnmarshalRead(r.Body, &request); err != nil {
			t.Fatal(err)
		}
		reasoning, _ := request["reasoning"].(map[string]any)
		if reasoning["effort"] != "none" || reasoning["exclude"] == true {
			t.Fatalf("reasoning = %#v; want reasoning disabled, not hidden", reasoning)
		}
		writeJSON(w, textResponse("hello"))
	}))
	defer server.Close()
	provider := testProvider("openrouter", server.URL)
	provider.ReasoningEffort = "none"
	responses, errs := collect(New(provider, server.Client(), allowLimiter{}).GenerateContent(t.Context(), &model.LLMRequest{Contents: genai.Text("hello")}, false))
	if len(errs) != 0 || len(responses) != 1 {
		t.Fatalf("responses/errors = %#v/%v", responses, errs)
	}
}
