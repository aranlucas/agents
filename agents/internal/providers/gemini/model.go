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
	"reflect"
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
		agg := &streamAggregator{}
		for chunk, err := range m.client.Models.GenerateContentStream(ctx, m.modelName, req.Contents, req.Config) {
			if err != nil {
				yield(nil, fmt.Errorf("gemini generateContentStream: %w", err))
				return
			}
			result, ok := agg.observe(chunk)
			if !ok {
				continue
			}
			if !yield(result, nil) {
				return
			}
		}
		if final := agg.final(); final != nil {
			yield(final, nil)
		}
	}
}

// streamAggregator accumulates streamed chunks so the stream can end with one
// complete non-partial response. Gemini 3 models deliver function calls on
// intermediate chunks and close the stream with an empty STOP frame; ADK's
// flow executes tools only from the final non-partial response (see
// google.golang.org/adk/v2/model.LLMResponse: "The Runner fully processes
// only the final non-partial event"), so replaying chunks verbatim would
// silently drop every tool call. Mirrors ADK's own gemini adapter
// (model/gemini + llminternal.StreamingResponseAggregator) and this repo's
// openai adapter, which also re-sends the full content on the final frame.
type streamAggregator struct {
	parts         []*genai.Part
	textBuffer    strings.Builder
	textIsThought bool
	pendingSig    []byte

	sawContent        bool
	finishReason      genai.FinishReason
	usageMetadata     *genai.GenerateContentResponseUsageMetadata
	groundingMetadata *genai.GroundingMetadata
	citationMetadata  *genai.CitationMetadata
	modelVersion      string
}

// observe records one chunk and returns it as a partial response for
// incremental streaming, or ok=false for chunks with no candidate content
// (e.g. a prompt-feedback-only or trailing empty frame), whose metadata is
// still captured for the final aggregated response.
func (a *streamAggregator) observe(chunk *genai.GenerateContentResponse) (*model.LLMResponse, bool) {
	if chunk == nil {
		return nil, false
	}
	if chunk.UsageMetadata != nil {
		a.usageMetadata = chunk.UsageMetadata
	}
	if chunk.ModelVersion != "" {
		a.modelVersion = chunk.ModelVersion
	}
	if len(chunk.Candidates) == 0 {
		return nil, false
	}
	candidate := chunk.Candidates[0]
	if candidate.FinishReason != "" {
		a.finishReason = candidate.FinishReason
	}
	if candidate.CitationMetadata != nil {
		a.citationMetadata = candidate.CitationMetadata
	}
	if candidate.GroundingMetadata != nil {
		a.groundingMetadata = candidate.GroundingMetadata
	}
	if candidate.Content == nil {
		return nil, false
	}
	a.accumulate(candidate.Content.Parts)
	result, ok := streamResponse(chunk)
	if !ok {
		return nil, false
	}
	result.Partial, result.TurnComplete = true, false
	return result, true
}

func (a *streamAggregator) accumulate(parts []*genai.Part) {
	for _, part := range parts {
		if part == nil || reflect.ValueOf(*part).IsZero() {
			continue
		}
		a.sawContent = true
		if len(part.ThoughtSignature) > 0 && part.FunctionCall == nil && part.Text == "" {
			a.pendingSig = part.ThoughtSignature
			continue
		}
		switch {
		case part.Text != "":
			if a.textBuffer.Len() > 0 && part.Thought != a.textIsThought {
				a.flushText()
			}
			a.textIsThought = part.Thought
			a.textBuffer.WriteString(part.Text)
		case part.FunctionCall != nil:
			a.flushText()
			clone := *part
			if len(clone.ThoughtSignature) == 0 && a.pendingSig != nil {
				clone.ThoughtSignature = a.pendingSig
			}
			a.pendingSig = nil
			a.parts = append(a.parts, &clone)
		default:
			a.flushText()
			a.parts = append(a.parts, part)
		}
	}
}

func (a *streamAggregator) flushText() {
	if a.textBuffer.Len() == 0 {
		return
	}
	a.parts = append(a.parts, &genai.Part{Text: a.textBuffer.String(), Thought: a.textIsThought})
	a.textBuffer.Reset()
	a.textIsThought = false
}

// final returns the aggregated non-partial response, or nil when the stream
// carried no candidate content at all (matching the previous behavior of
// yielding nothing for a contentless stream).
func (a *streamAggregator) final() *model.LLMResponse {
	if !a.sawContent {
		return nil
	}
	a.flushText()
	return &model.LLMResponse{
		Content:           &genai.Content{Role: genai.RoleModel, Parts: a.parts},
		UsageMetadata:     a.usageMetadata,
		GroundingMetadata: a.groundingMetadata,
		CitationMetadata:  a.citationMetadata,
		ModelVersion:      a.modelVersion,
		TurnComplete:      true,
		FinishReason:      a.finishReason,
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
