// Package gemini implements ADK-Go's model.LLM interface over a direct
// Gemini API client (google.golang.org/genai), bypassing the OpenAI-compatible
// LiteLLM-style translation entirely (see internal/providers/openai).
//
// Every ported agent that talks to a paid or free-tier provider goes through
// the OpenAI-compatible adapter, which serializes reasoning content as an
// OpenAI "reasoning_content" chat field. Several providers (Cerebras, Groq,
// Mistral) reject that field with HTTP 400 when it is echoed back as
// conversation history on a later turn. Gemini's native request/response
// schema represents reasoning as a genai.Part with Thought=true directly on
// genai.Content, so round-tripping it through prior turns needs no
// translation and no provider rejects it. This package exists for callers
// that must preserve that reasoning content across turns (see AGENTS.md's
// Model Distribution table, A2UI row, and the trends renderer discussion in
// agents/internal/agents/trends).
package gemini

import (
	"context"
	"errors"
	"fmt"
	"iter"
	"net/http"
	"strings"

	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

// Model adapts a genai.Client to model.LLM. LLMRequest.Contents and
// LLMRequest.Config are already genai.Content/genai.GenerateContentConfig
// (see google.golang.org/adk/v2/model.LLMRequest), so requests pass straight
// through to the Gemini API with no per-field translation.
type Model struct {
	client    *genai.Client
	modelName string
}

var _ model.LLM = (*Model)(nil)

// New constructs a direct Gemini adapter. httpClient and baseURL are test
// seams: production callers pass (nil, "") to use genai's real transport and
// the default Gemini API endpoint.
func New(ctx context.Context, apiKey, modelName string, httpClient *http.Client, baseURL string) (*Model, error) {
	if strings.TrimSpace(apiKey) == "" {
		return nil, errors.New("gemini API key is required")
	}
	if strings.TrimSpace(modelName) == "" {
		return nil, errors.New("gemini model name is required")
	}
	cfg := &genai.ClientConfig{APIKey: apiKey, Backend: genai.BackendGeminiAPI}
	if httpClient != nil {
		cfg.HTTPClient = httpClient
	}
	if strings.TrimSpace(baseURL) != "" {
		cfg.HTTPOptions.BaseURL = baseURL
	}
	client, err := genai.NewClient(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("configure gemini client: %w", err)
	}
	return &Model{client: client, modelName: modelName}, nil
}

func (m *Model) Name() string { return "gemini/" + m.modelName }

// GenerateContent satisfies model.LLM. Both the streaming and non-streaming
// paths pass req.Contents and req.Config straight to the genai client:
// Gemini's own Content/Part schema is what LLMRequest already carries, so
// there is nothing to translate (contrast with internal/providers/openai,
// which must build an OpenAI-shaped chat payload).
func (m *Model) GenerateContent(ctx context.Context, req *model.LLMRequest, stream bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		if req == nil {
			yield(nil, errors.New("gemini request is required"))
			return
		}
		if !stream {
			response, err := m.client.Models.GenerateContent(ctx, m.modelName, req.Contents, req.Config)
			if err != nil {
				yield(nil, fmt.Errorf("gemini generateContent: %w", err))
				return
			}
			result, err := singleResponse(response)
			if err != nil {
				yield(nil, err)
				return
			}
			yield(result, nil)
			return
		}
		for chunk, err := range m.client.Models.GenerateContentStream(ctx, m.modelName, req.Contents, req.Config) {
			if err != nil {
				yield(nil, fmt.Errorf("gemini generateContentStream: %w", err))
				return
			}
			result, ok := streamResponse(chunk)
			if !ok {
				continue
			}
			if !yield(result, nil) {
				return
			}
		}
	}
}

func singleResponse(response *genai.GenerateContentResponse) (*model.LLMResponse, error) {
	if response == nil || len(response.Candidates) == 0 || response.Candidates[0].Content == nil {
		return nil, errors.New("gemini returned an empty response")
	}
	candidate := response.Candidates[0]
	return &model.LLMResponse{
		Content:           candidate.Content,
		CitationMetadata:  candidate.CitationMetadata,
		GroundingMetadata: candidate.GroundingMetadata,
		UsageMetadata:     response.UsageMetadata,
		ModelVersion:      response.ModelVersion,
		TurnComplete:      true,
		FinishReason:      candidate.FinishReason,
	}, nil
}

// streamResponse reports ok=false for chunks with no candidate content
// (e.g. a prompt-feedback-only first frame), which the caller skips rather
// than yielding as an empty response.
func streamResponse(chunk *genai.GenerateContentResponse) (*model.LLMResponse, bool) {
	if chunk == nil || len(chunk.Candidates) == 0 || chunk.Candidates[0].Content == nil {
		return nil, false
	}
	candidate := chunk.Candidates[0]
	partial := candidate.FinishReason == ""
	return &model.LLMResponse{
		Content:           candidate.Content,
		CitationMetadata:  candidate.CitationMetadata,
		GroundingMetadata: candidate.GroundingMetadata,
		UsageMetadata:     chunk.UsageMetadata,
		ModelVersion:      chunk.ModelVersion,
		Partial:           partial,
		TurnComplete:      !partial,
		FinishReason:      candidate.FinishReason,
	}, true
}
