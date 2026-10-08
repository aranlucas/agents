package openai

import (
	json "encoding/json/v2"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/aranlucas/agents/internal/config"
	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

func TestChatCompletionsStreamsToolsAndUsage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Errorf("path = %q", r.URL.Path)
		}
		var request map[string]any
		if err := json.UnmarshalRead(r.Body, &request); err != nil {
			t.Error(err)
			return
		}
		if request["model"] != "test-model" || request["reasoning_effort"] != "low" || request["reasoning"] != nil {
			t.Errorf("model/reasoning = %#v", request)
		}
		if len(request["messages"].([]any)) != 1 || len(request["tools"].([]any)) != 1 {
			t.Errorf("messages/tools = %#v", request)
		}
		writeSSE(w, []string{
			`{"id":"chat-1","model":"test-model","choices":[{"index":0,"delta":{"role":"assistant","content":"Checking."}}]}`,
			`{"id":"chat-1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"lookup","arguments":"{\"q\":"}}]}}]}`,
			`{"id":"chat-1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"Paris\"}"}}]},"finish_reason":"tool_calls"}]}`,
			`{"id":"chat-1","choices":[],"usage":{"prompt_tokens":3,"completion_tokens":5,"total_tokens":8}}`,
			`[DONE]`,
		})
	}))
	defer server.Close()
	provider := testProvider("chat", server.URL+"/v1")
	provider.API, provider.ReasoningEffort = config.ChatCompletionsAPI, "low"
	responses, errs := collect(New(provider, server.Client(), allowLimiter{}).GenerateContent(t.Context(), toolRequest(), true))
	if len(errs) != 0 {
		t.Fatalf("errors = %v", errs)
	}
	var toolSeen, usageSeen bool
	for _, response := range responses {
		if response.UsageMetadata != nil && response.UsageMetadata.TotalTokenCount == 8 {
			usageSeen = true
		}
		if response.Content == nil {
			continue
		}
		for _, part := range response.Content.Parts {
			if call := part.FunctionCall; call != nil && call.ID == "call-1" && call.Name == "lookup" && call.Args["q"] == "Paris" {
				toolSeen = true
			}
		}
	}
	if !toolSeen || !usageSeen {
		t.Fatalf("tool=%v usage=%v", toolSeen, usageSeen)
	}
}

func TestFallbackRetainsItsAPIAndToolHistory(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/responses":
			w.WriteHeader(http.StatusServiceUnavailable)
		case "/v1/chat/completions":
			var request map[string]any
			if err := json.UnmarshalRead(r.Body, &request); err != nil {
				t.Error(err)
				return
			}
			messages := request["messages"].([]any)
			if len(messages) != 3 {
				t.Errorf("history = %#v", messages)
			}
			last := messages[len(messages)-1].(map[string]any)
			if last["role"] != "tool" || last["tool_call_id"] != "call-1" {
				t.Errorf("tool response = %#v", last)
			}
			writeJSON(w, map[string]any{"id": "chat-1", "model": "test-model", "choices": []any{map[string]any{"index": 0, "finish_reason": "stop", "message": map[string]any{"role": "assistant", "content": "complete"}}}})
		default:
			t.Errorf("unexpected path %q", r.URL.Path)
		}
	}))
	defer server.Close()
	primary := testProvider("primary", server.URL+"/v1")
	primary.Fallbacks = []string{"chat"}
	chat := testProvider("chat", server.URL+"/v1")
	chat.API = config.ChatCompletionsAPI
	adapter, err := NewMulti(primary, map[string]config.Provider{"chat": chat}, server.Client(), allowLimiter{})
	if err != nil {
		t.Fatal(err)
	}
	request := &model.LLMRequest{Contents: []*genai.Content{
		genai.NewContentFromText("lookup Paris", genai.RoleUser),
		{Role: genai.RoleModel, Parts: []*genai.Part{{FunctionCall: &genai.FunctionCall{ID: "call-1", Name: "lookup", Args: map[string]any{"q": "Paris"}}}}},
		{Role: genai.RoleUser, Parts: []*genai.Part{{FunctionResponse: &genai.FunctionResponse{ID: "call-1", Name: "lookup", Response: map[string]any{"country": "France"}}}}},
	}}
	responses, errs := collect(adapter.GenerateContent(t.Context(), request, false))
	if len(errs) != 0 || len(responses) != 1 || responses[0].Content.Parts[0].Text != "complete" {
		t.Fatalf("responses/errors = %#v/%v", responses, errs)
	}
}

func TestInvalidProviderAPIIsRejectedBeforeNetwork(t *testing.T) {
	provider := testProvider("invalid", "https://example.invalid")
	provider.API = "typo"
	_, errs := collect(New(provider, nil, allowLimiter{}).GenerateContent(t.Context(), toolRequest(), false))
	if len(errs) != 1 {
		t.Fatalf("errors = %v", errs)
	}
	if failure, ok := errors.AsType[*ProviderError](errs[0]); !ok || failure.Kind != ProviderErrorConfiguration {
		t.Fatalf("errors = %v", errs)
	}
}
