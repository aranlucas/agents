package app

import (
	"context"
	json "encoding/json/v2"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/aranlucas/agents/internal/config"
	"github.com/aranlucas/agents/internal/providers/openai"
	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

func TestResumeAcceptsModelsThatRequireReasoning(t *testing.T) {
	for _, withFallback := range []bool{false, true} {
		t.Run(fmt.Sprint("fallback=", withFallback), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var request struct {
					Model     string `json:"model"`
					Reasoning struct {
						Effort  string `json:"effort"`
						Enabled *bool  `json:"enabled"`
					} `json:"reasoning"`
				}
				if err := json.UnmarshalRead(r.Body, &request); err != nil {
					t.Error(err)
					w.WriteHeader(http.StatusBadRequest)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				if request.Reasoning.Effort == "none" || (request.Reasoning.Enabled != nil && !*request.Reasoning.Enabled) {
					w.WriteHeader(http.StatusBadRequest)
					_, _ = w.Write([]byte(`{"error":{"message":"Reasoning is mandatory for this endpoint and cannot be disabled.","code":400}}`))
					return
				}
				if request.Model != "openrouter/free" {
					t.Errorf("model = %q", request.Model)
				}
				_, _ = w.Write([]byte(`{"id":"resp-intro","model":"openrouter/free","status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Welcome"}]}]}`))
			}))
			defer server.Close()
			providers := map[string]config.Provider{
				"openrouter": {Name: "openrouter", BaseURL: server.URL, APIKey: "test-key"},
			}
			if withFallback {
				providers["groq"] = config.Provider{Name: "groq", BaseURL: server.URL, APIKey: "test-key"}
			}
			primary, fallbacks, err := resumeProviders(providers)
			if err != nil {
				t.Fatal(err)
			}
			if withFallback && (primary.FirstContentTimeout != 2*time.Second || fallbacks["groq"].ReasoningEffort != "low") {
				t.Fatal("public introduction lost its bounded startup and overflow policy")
			}
			llm, err := openai.NewMulti(primary, fallbacks, server.Client(), resumeTestLimiter{})
			if err != nil {
				t.Fatal(err)
			}
			var text string
			for response, err := range llm.GenerateContent(t.Context(), &model.LLMRequest{Contents: genai.Text("Introduce yourself")}, false) {
				if err != nil {
					t.Fatal(err)
				}
				if response != nil && response.Content != nil {
					for _, part := range response.Content.Parts {
						text += part.Text
					}
				}
			}
			if text != "Welcome" {
				t.Fatalf("introduction = %q", text)
			}
		})
	}
}

type resumeTestLimiter struct{}

func (resumeTestLimiter) Acquire(context.Context, string, int) error { return nil }
