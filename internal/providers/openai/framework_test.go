package openai

import (
	json "encoding/json/v2"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"google.golang.org/adk/v2/model/openaimodel"
	"google.golang.org/genai"
)

// Exercise terminal-only Responses API payloads through our timeout/fallback
// boundary, which buffers responses until usable content arrives.
func TestFrameworkTerminalStreamContent(t *testing.T) {
	for _, tc := range []struct {
		name     string
		terminal string
		text     string
		finish   genai.FinishReason
		tool     bool
	}{
		{name: "completed text", terminal: `{"type":"response.completed","response":{"id":"r","status":"completed","output":[{"type":"message","id":"m","role":"assistant","content":[{"type":"output_text","text":"complete"}]}]}}`, text: "complete", finish: genai.FinishReasonStop},
		{name: "refusal", terminal: `{"type":"response.completed","response":{"id":"r","status":"completed","output":[{"type":"message","id":"m","role":"assistant","content":[{"type":"refusal","refusal":"Cannot help with that."}]}]}}`, text: "Cannot help with that.", finish: genai.FinishReasonStop},
		{name: "nested tool arguments", terminal: `{"type":"response.completed","response":{"id":"r","status":"completed","output":[{"type":"function_call","call_id":"call-1","name":"lookup","arguments":"{\"q\":\"Paris\",\"details\":{\"items\":[{\"name\":\"nested\"}]}}"}]}}`, tool: true, finish: genai.FinishReasonStop},
		{name: "token limit", terminal: `{"type":"response.incomplete","response":{"id":"r","status":"incomplete","incomplete_details":{"reason":"max_output_tokens"},"output":[{"type":"message","id":"m","role":"assistant","content":[{"type":"output_text","text":"unfinished"}]}]}}`, text: "unfinished", finish: genai.FinishReasonMaxTokens},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				writeSSE(w, []string{tc.terminal, `[DONE]`})
			}))
			t.Cleanup(server.Close)
			provider := testProvider("primary", server.URL)
			provider.FirstContentTimeout = time.Second
			responses, errs := collect(New(provider, server.Client(), allowLimiter{}).GenerateContent(t.Context(), toolRequest(), true))
			if len(errs) != 0 || len(responses) == 0 {
				t.Fatalf("responses/errors = %#v/%v", responses, errs)
			}
			final := responses[len(responses)-1]
			if final.Partial || final.FinishReason != tc.finish || final.Content == nil || len(final.Content.Parts) == 0 {
				t.Fatalf("final = %#v", final)
			}
			part := final.Content.Parts[0]
			if tc.tool {
				if part.FunctionCall == nil || part.FunctionCall.ID != "call-1" || part.FunctionCall.Args["q"] != "Paris" {
					t.Fatalf("call = %#v", part.FunctionCall)
				}
				encoded, err := json.Marshal(part.FunctionCall.Args["details"])
				if err != nil || string(encoded) != `{"items":[{"name":"nested"}]}` {
					t.Fatalf("nested args = %s, %v", encoded, err)
				}
			} else if part.Text != tc.text {
				t.Fatalf("text = %q", part.Text)
			}
		})
	}
}

func TestFrameworkResponseFailureClassification(t *testing.T) {
	for _, stream := range []bool{false, true} {
		t.Run(fmt.Sprintf("stream=%t", stream), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				if stream {
					writeSSE(w, []string{`{"type":"response.failed","response":{"id":"r","status":"failed","error":{"code":"server_error","message":"private provider details"}}}`, `[DONE]`})
				} else {
					writeJSON(w, map[string]any{"id": "r", "status": "failed", "error": map[string]any{"code": "server_error", "message": "private provider details"}})
				}
			}))
			t.Cleanup(server.Close)
			responses, errs := collect(New(testProvider("primary", server.URL), server.Client(), allowLimiter{}).GenerateContent(t.Context(), toolRequest(), stream))
			if len(responses) != 0 || len(errs) != 1 {
				t.Fatalf("responses/errors = %#v/%v", responses, errs)
			}
			failure, ok := errors.AsType[*ProviderError](errs[0])
			if !ok || failure.Kind != ProviderErrorResponseSchema || !errors.Is(failure, openaimodel.ErrResponseFailed) {
				t.Fatalf("error = %#v", errs[0])
			}
			if strings.Contains(failure.Error(), "private provider details") {
				t.Fatal("provider details leaked")
			}
		})
	}
}
