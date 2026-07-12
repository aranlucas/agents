// Package openai implements ADK-Go model.LLM over OpenAI-compatible providers.
package openai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"iter"
	"log"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"

	"agents/internal/config"
	"agents/internal/rate"
	"github.com/openai/openai-go"
	"github.com/openai/openai-go/option"
	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

const (
	circuitThreshold = 3
	circuitCooldown  = 30 * time.Second
)

// Limiter is the provider rate-limit boundary.
type Limiter interface {
	Acquire(context.Context, string, int) error
}

// ProviderError contains safe classification without credentials or prompts.
type ProviderError struct {
	Provider  string
	Status    int
	Retryable bool
	Kind      string
	cause     error
}

func (e *ProviderError) Error() string {
	if e.Status != 0 {
		return fmt.Sprintf("provider %s failed with HTTP %d (%s)", e.Provider, e.Status, e.Kind)
	}
	return fmt.Sprintf("provider %s failed (%s)", e.Provider, e.Kind)
}
func (e *ProviderError) Unwrap() error { return e.cause }

type circuitState struct {
	failures  int
	openUntil time.Time
}

// providerClient pairs an OpenAI SDK client with its config.
type providerClient struct {
	config config.Provider
	client openai.Client
}

// Model routes an ADK request through one primary and bounded configured fallbacks.
type Model struct {
	providers []providerClient
	limiter   Limiter
	now       func() time.Time
	mu        sync.Mutex
	circuits  map[string]circuitState
}

var _ model.LLM = (*Model)(nil)

// New constructs a single-provider adapter.
func New(provider config.Provider, client *http.Client, limiter Limiter) *Model {
	return newModel([]config.Provider{provider}, client, limiter)
}

// NewMulti resolves the primary provider's fallback names exactly once.
func NewMulti(primary config.Provider, available map[string]config.Provider, client *http.Client, limiter Limiter) (*Model, error) {
	providers := []config.Provider{primary}
	seen := map[string]bool{primary.Name: true}
	for _, name := range primary.Fallbacks {
		provider, ok := available[name]
		if !ok {
			return nil, fmt.Errorf("fallback provider %q is not configured", name)
		}
		if !seen[provider.Name] {
			providers = append(providers, provider)
			seen[provider.Name] = true
		}
	}
	return newModel(providers, client, limiter), nil
}

func newModel(providers []config.Provider, httpClient *http.Client, limiter Limiter) *Model {
	pcs := make([]providerClient, len(providers))
	for i, p := range providers {
		opts := []option.RequestOption{}
		if p.APIKey != "" {
			opts = append(opts, option.WithAPIKey(p.APIKey))
		}
		if p.BaseURL != "" {
			opts = append(opts, option.WithBaseURL(p.BaseURL))
		}
		if httpClient != nil {
			opts = append(opts, option.WithHTTPClient(httpClient))
		}
		opts = append(opts, option.WithMaxRetries(0))
		pcs[i] = providerClient{config: p, client: openai.NewClient(opts...)}
	}
	return &Model{providers: pcs, limiter: limiter, now: time.Now, circuits: make(map[string]circuitState)}
}

func (m *Model) Name() string {
	if len(m.providers) == 0 {
		return "openai-compatible/unconfigured"
	}
	return m.providers[0].config.Name + "/" + m.providers[0].config.Model
}

// GenerateContent makes at most one request per configured provider. Fallback
// occurs only for retryable failures before any response has been emitted.
func (m *Model) GenerateContent(ctx context.Context, req *model.LLMRequest, stream bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		if len(m.providers) == 0 || m.limiter == nil {
			yield(nil, errors.New("OpenAI-compatible model is not configured"))
			return
		}
		var last error
		for _, pc := range m.providers {
			if err := m.circuitAvailable(pc.config.Name); err != nil {
				last = err
				continue
			}
			emitted, err := m.runProvider(ctx, pc, req, stream, yield)
			if err == nil {
				m.recordSuccess(pc.config.Name)
				return
			}
			last = err
			retryable := isRetryable(err)
			m.recordFailure(pc.config.Name, retryable)
			if emitted || !retryable || ctx.Err() != nil {
				yield(nil, err)
				return
			}
		}
		if last == nil {
			last = errors.New("no provider is available")
		}
		yield(nil, last)
	}
}

func (m *Model) runProvider(ctx context.Context, pc providerClient, req *model.LLMRequest, stream bool, yield func(*model.LLMResponse, error) bool) (bool, error) {
	if err := validateProvider(pc.config); err != nil {
		return false, err
	}
	if err := m.limiter.Acquire(ctx, pc.config.Name, pc.config.RequestsPerMinute); err != nil {
		return false, &ProviderError{Provider: pc.config.Name, Retryable: errors.Is(err, rate.ErrLimitReached), Kind: "rate_limit", cause: err}
	}
	modelName := pc.config.Model
	if modelName == "" && req != nil {
		modelName = req.Model
	}
	params, err := buildRequest(req, modelName, stream)
	if err != nil {
		// buildRequest errors are always local schema-construction failures
		// (our own code, never raw HTTP bodies or credentials), so logging
		// the cause in full here is safe and is the only place it survives —
		// ProviderError.Error() deliberately omits cause for other Kinds.
		log.Printf("provider %s request_schema: %v", pc.config.Name, err)
		return false, &ProviderError{Provider: pc.config.Name, Kind: "request_schema", cause: err}
	}
	if stream {
		return m.streamResponse(ctx, pc, params, yield)
	}
	return m.completeResponse(ctx, pc, params, yield)
}

func (m *Model) completeResponse(ctx context.Context, pc providerClient, params openai.ChatCompletionNewParams, yield func(*model.LLMResponse, error) bool) (bool, error) {
	completion, err := pc.client.Chat.Completions.New(ctx, params)
	if err != nil {
		return false, sdkError(pc.config.Name, err)
	}
	resp := completionToResponse(completion)
	yield(resp, nil)
	return true, nil
}

type toolAccumulator struct {
	ID, Name  string
	Arguments strings.Builder
}

func (m *Model) streamResponse(ctx context.Context, pc providerClient, params openai.ChatCompletionNewParams, yield func(*model.LLMResponse, error) bool) (bool, error) {
	stream := pc.client.Chat.Completions.NewStreaming(ctx, params)
	defer func() { _ = stream.Close() }()

	var text, reasoning strings.Builder
	toolCalls := make(map[int64]*toolAccumulator)
	var usage openai.CompletionUsage
	var modelVersion, finish string
	emitted := false

	for stream.Next() {
		chunk := stream.Current()
		if chunk.Model != "" {
			modelVersion = chunk.Model
		}
		if chunk.Usage.TotalTokens > 0 {
			usage = chunk.Usage
		}
		if len(chunk.Choices) == 0 {
			continue
		}
		choice := chunk.Choices[0]
		if choice.FinishReason != "" {
			finish = choice.FinishReason
		}

		// Re-parse raw JSON for reasoning_content which the SDK doesn't expose.
		if r := extractReasoning(chunk.RawJSON()); r != "" {
			reasoning.WriteString(r)
			emitted = true
			if !yield(&model.LLMResponse{
				Content:      &genai.Content{Role: "model", Parts: []*genai.Part{{Text: r, Thought: true}}},
				Partial:      true,
				ModelVersion: modelVersion,
			}, nil) {
				return true, nil
			}
		}

		if choice.Delta.Content != "" {
			text.WriteString(choice.Delta.Content)
			emitted = true
			if !yield(&model.LLMResponse{
				Content:      genai.NewContentFromText(choice.Delta.Content, "model"),
				Partial:      true,
				ModelVersion: modelVersion,
			}, nil) {
				return true, nil
			}
		}
		for _, tc := range choice.Delta.ToolCalls {
			accumulator := toolCalls[tc.Index]
			if accumulator == nil {
				accumulator = &toolAccumulator{}
				toolCalls[tc.Index] = accumulator
			}
			if tc.ID != "" {
				accumulator.ID = tc.ID
			}
			if tc.Function.Name != "" {
				accumulator.Name = tc.Function.Name
			}
			accumulator.Arguments.WriteString(tc.Function.Arguments)
		}
	}
	if err := stream.Err(); err != nil {
		return emitted, sdkError(pc.config.Name, err)
	}

	parts := make([]*genai.Part, 0, 2+len(toolCalls))
	if reasoning.Len() > 0 {
		parts = append(parts, &genai.Part{Text: reasoning.String(), Thought: true})
	}
	if text.Len() > 0 {
		parts = append(parts, genai.NewPartFromText(text.String()))
	}
	indexes := make([]int64, 0, len(toolCalls))
	for index := range toolCalls {
		indexes = append(indexes, index)
	}
	slices.Sort(indexes)
	for _, index := range indexes {
		call := toolCalls[index]
		if call == nil || call.Name == "" {
			return emitted, &ProviderError{Provider: pc.config.Name, Kind: "response_schema"}
		}
		arguments := map[string]any{}
		if raw := call.Arguments.String(); raw != "" && json.Unmarshal([]byte(raw), &arguments) != nil {
			return emitted, &ProviderError{Provider: pc.config.Name, Kind: "response_schema"}
		}
		parts = append(parts, &genai.Part{FunctionCall: &genai.FunctionCall{ID: call.ID, Name: call.Name, Args: arguments}})
	}
	if len(parts) == 0 {
		return emitted, &ProviderError{Provider: pc.config.Name, Retryable: true, Kind: "empty_response"}
	}
	yield(&model.LLMResponse{
		Content:       &genai.Content{Role: "model", Parts: parts},
		UsageMetadata: usageMetadata(usage),
		ModelVersion:  modelVersion,
		TurnComplete:  true,
		FinishReason:  finishReason(finish),
	}, nil)
	return true, nil
}

func completionToResponse(completion *openai.ChatCompletion) *model.LLMResponse {
	resp := &model.LLMResponse{
		TurnComplete:  true,
		UsageMetadata: usageMetadata(completion.Usage),
		ModelVersion:  completion.Model,
	}
	if len(completion.Choices) > 0 {
		choice := completion.Choices[0]
		resp.FinishReason = finishReason(string(choice.FinishReason))
		resp.Content = choiceToContent(choice)
	}
	return resp
}

func choiceToContent(choice openai.ChatCompletionChoice) *genai.Content {
	content := &genai.Content{Role: "model"}
	msg := choice.Message
	if msg.Content != "" {
		content.Parts = append(content.Parts, genai.NewPartFromText(msg.Content))
	}
	// Re-parse raw JSON for reasoning_content in non-streaming responses.
	if r := extractReasoning(msg.RawJSON()); r != "" {
		content.Parts = append([]*genai.Part{{Text: r, Thought: true}}, content.Parts...)
	}
	for _, tc := range msg.ToolCalls {
		var args map[string]any
		if tc.Function.Arguments != "" {
			_ = json.Unmarshal([]byte(tc.Function.Arguments), &args)
		}
		if args == nil {
			args = make(map[string]any)
		}
		content.Parts = append(content.Parts, &genai.Part{
			FunctionCall: &genai.FunctionCall{
				ID:   tc.ID,
				Name: tc.Function.Name,
				Args: args,
			},
		})
	}
	return content
}

func sdkError(provider string, err error) error {
	var apiErr *openai.Error
	if errors.As(err, &apiErr) {
		retryable := apiErr.StatusCode == 408 || apiErr.StatusCode == 429 || apiErr.StatusCode >= 500
		return &ProviderError{
			Provider:  provider,
			Status:    apiErr.StatusCode,
			Retryable: retryable,
			Kind:      "http",
			cause:     err,
		}
	}
	return &ProviderError{Provider: provider, Retryable: true, Kind: "network", cause: err}
}

func validateProvider(provider config.Provider) error {
	parsed, err := url.Parse(provider.BaseURL)
	if err != nil || parsed.Host == "" {
		return &ProviderError{Provider: provider.Name, Kind: "configuration"}
	}
	loopback := parsed.Hostname() == "127.0.0.1" || parsed.Hostname() == "localhost" || parsed.Hostname() == "::1"
	if parsed.Scheme != "https" && (parsed.Scheme != "http" || !loopback) {
		return &ProviderError{Provider: provider.Name, Kind: "configuration"}
	}
	if provider.Name == "" || provider.APIKey == "" || provider.RequestsPerMinute <= 0 {
		return &ProviderError{Provider: provider.Name, Kind: "configuration"}
	}
	return nil
}

func isRetryable(err error) bool {
	var providerError *ProviderError
	return errors.As(err, &providerError) && providerError.Retryable
}

func (m *Model) circuitAvailable(name string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	state := m.circuits[name]
	if m.now().Before(state.openUntil) {
		return &ProviderError{Provider: name, Retryable: true, Kind: "circuit_open"}
	}
	return nil
}

func (m *Model) recordSuccess(name string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.circuits, name)
}

func (m *Model) recordFailure(name string, retryable bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if !retryable {
		return
	}
	state := m.circuits[name]
	state.failures++
	if state.failures >= circuitThreshold {
		state.openUntil = m.now().Add(circuitCooldown)
		state.failures = 0
	}
	m.circuits[name] = state
}
