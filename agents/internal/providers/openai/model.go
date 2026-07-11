// Package openai implements ADK-Go model.LLM over OpenAI-compatible providers.
package openai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"iter"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"

	"agents/internal/config"
	"agents/internal/rate"
	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

const (
	maximumRequestBytes  = 8 << 20
	maximumResponseBytes = 32 << 20
	maximumSSELineBytes  = 1 << 20
	circuitThreshold     = 3
	circuitCooldown      = 30 * time.Second
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

// Model routes an ADK request through one primary and bounded configured fallbacks.
type Model struct {
	providers []config.Provider
	client    *http.Client
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

func newModel(providers []config.Provider, client *http.Client, limiter Limiter) *Model {
	if client == nil {
		client = &http.Client{Timeout: 90 * time.Second, Transport: &http.Transport{MaxIdleConns: 32, MaxIdleConnsPerHost: 8, IdleConnTimeout: 90 * time.Second}}
	} else if client.Timeout <= 0 {
		clone := *client
		clone.Timeout = 90 * time.Second
		client = &clone
	}
	return &Model{providers: providers, client: client, limiter: limiter, now: time.Now, circuits: make(map[string]circuitState)}
}

func (m *Model) Name() string {
	if len(m.providers) == 0 {
		return "openai-compatible/unconfigured"
	}
	return m.providers[0].Name + "/" + m.providers[0].Model
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
		for _, provider := range m.providers {
			if err := m.circuitAvailable(provider.Name); err != nil {
				last = err
				continue
			}
			emitted, err := m.runProvider(ctx, provider, req, stream, yield)
			if err == nil {
				m.recordSuccess(provider.Name)
				return
			}
			last = err
			retryable := isRetryable(err)
			m.recordFailure(provider.Name, retryable)
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

func (m *Model) runProvider(ctx context.Context, provider config.Provider, req *model.LLMRequest, stream bool, yield func(*model.LLMResponse, error) bool) (bool, error) {
	if err := validateProvider(provider); err != nil {
		return false, err
	}
	if err := m.limiter.Acquire(ctx, provider.Name, provider.RequestsPerMinute); err != nil {
		return false, &ProviderError{Provider: provider.Name, Retryable: errors.Is(err, rate.ErrLimitReached), Kind: "rate_limit", cause: err}
	}
	modelName := provider.Model
	if modelName == "" && req != nil {
		modelName = req.Model
	}
	payload, err := buildChatRequest(req, modelName, stream)
	if err != nil {
		return false, &ProviderError{Provider: provider.Name, Kind: "request_schema", cause: err}
	}
	encoded, err := json.Marshal(payload)
	if err != nil || len(encoded) > maximumRequestBytes {
		return false, &ProviderError{Provider: provider.Name, Kind: "request_too_large", cause: err}
	}
	endpoint := strings.TrimRight(provider.BaseURL, "/") + "/chat/completions"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(encoded))
	if err != nil {
		return false, &ProviderError{Provider: provider.Name, Kind: "request", cause: err}
	}
	httpReq.Header.Set("Authorization", "Bearer "+provider.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", map[bool]string{true: "text/event-stream", false: "application/json"}[stream])
	response, err := m.client.Do(httpReq)
	if err != nil {
		if ctx.Err() != nil {
			return false, ctx.Err()
		}
		return false, &ProviderError{Provider: provider.Name, Retryable: true, Kind: "network", cause: err}
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 64<<10))
		return false, &ProviderError{Provider: provider.Name, Status: response.StatusCode, Retryable: response.StatusCode == http.StatusRequestTimeout || response.StatusCode == http.StatusTooManyRequests || response.StatusCode >= 500, Kind: "http"}
	}
	if stream {
		return decodeStream(response.Body, provider.Name, yield)
	}
	result, err := decodeResponse(response.Body, provider.Name)
	if err != nil {
		return false, err
	}
	yield(result, nil)
	return true, nil
}

func decodeResponse(body io.Reader, provider string) (*model.LLMResponse, error) {
	data, err := io.ReadAll(io.LimitReader(body, maximumResponseBytes+1))
	if err != nil || len(data) > maximumResponseBytes {
		return nil, &ProviderError{Provider: provider, Kind: "response_too_large", cause: err}
	}
	var response chatResponse
	if json.Unmarshal(data, &response) != nil || len(response.Choices) == 0 {
		return nil, &ProviderError{Provider: provider, Kind: "response_schema"}
	}
	choice := response.Choices[0]
	parts, err := responseParts(choice.Message)
	if err != nil {
		return nil, &ProviderError{Provider: provider, Kind: "response_schema", cause: err}
	}
	return &model.LLMResponse{Content: &genai.Content{Role: "model", Parts: parts}, UsageMetadata: usageMetadata(response.Usage), ModelVersion: response.Model, TurnComplete: true, FinishReason: finishReason(choice.FinishReason)}, nil
}

type toolAccumulator struct {
	ID, Name  string
	Arguments strings.Builder
}

func decodeStream(body io.Reader, provider string, yield func(*model.LLMResponse, error) bool) (bool, error) {
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 64<<10), maximumSSELineBytes)
	var text, reasoning strings.Builder
	tools := map[int]*toolAccumulator{}
	var usage *chatUsage
	var modelVersion, finish string
	total, emitted, done := 0, false, false
	for scanner.Scan() {
		line := scanner.Text()
		total += len(line)
		if total > maximumResponseBytes {
			return emitted, &ProviderError{Provider: provider, Kind: "response_too_large"}
		}
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			done = true
			break
		}
		if data == "" {
			continue
		}
		var chunk chatResponse
		if json.Unmarshal([]byte(data), &chunk) != nil {
			return emitted, &ProviderError{Provider: provider, Kind: "response_schema"}
		}
		if chunk.Model != "" {
			modelVersion = chunk.Model
		}
		if chunk.Usage != nil {
			usage = chunk.Usage
		}
		if len(chunk.Choices) == 0 {
			continue
		}
		choice := chunk.Choices[0]
		delta := choice.Delta
		if choice.FinishReason != "" {
			finish = choice.FinishReason
		}
		if delta.Content != "" {
			text.WriteString(delta.Content)
			emitted = true
			if !yield(&model.LLMResponse{Content: genai.NewContentFromText(delta.Content, "model"), Partial: true, ModelVersion: modelVersion}, nil) {
				return true, nil
			}
		}
		reasoningChunk := delta.ReasoningContent
		if reasoningChunk == "" {
			reasoningChunk = delta.Reasoning
		}
		if reasoningChunk != "" {
			reasoning.WriteString(reasoningChunk)
			emitted = true
			if !yield(&model.LLMResponse{Content: &genai.Content{Role: "model", Parts: []*genai.Part{{Text: reasoningChunk, Thought: true}}}, Partial: true, ModelVersion: modelVersion}, nil) {
				return true, nil
			}
		}
		for _, call := range delta.ToolCalls {
			accumulator := tools[call.Index]
			if accumulator == nil {
				accumulator = &toolAccumulator{}
				tools[call.Index] = accumulator
			}
			if call.ID != "" {
				accumulator.ID = call.ID
			}
			if call.Function.Name != "" {
				accumulator.Name = call.Function.Name
			}
			accumulator.Arguments.WriteString(call.Function.Arguments)
		}
	}
	if err := scanner.Err(); err != nil {
		if errors.Is(err, bufio.ErrTooLong) {
			return emitted, &ProviderError{Provider: provider, Kind: "response_too_large", cause: err}
		}
		return emitted, &ProviderError{Provider: provider, Retryable: true, Kind: "network", cause: err}
	}
	if !done {
		return emitted, &ProviderError{Provider: provider, Retryable: true, Kind: "truncated_stream"}
	}
	parts := make([]*genai.Part, 0, 2+len(tools))
	if reasoning.Len() > 0 {
		parts = append(parts, &genai.Part{Text: reasoning.String(), Thought: true})
	}
	if text.Len() > 0 {
		parts = append(parts, genai.NewPartFromText(text.String()))
	}
	indexes := make([]int, 0, len(tools))
	for index := range tools {
		indexes = append(indexes, index)
	}
	slices.Sort(indexes)
	for _, index := range indexes {
		call := tools[index]
		if call == nil || call.Name == "" {
			return emitted, &ProviderError{Provider: provider, Kind: "response_schema"}
		}
		arguments := map[string]any{}
		if raw := call.Arguments.String(); raw != "" && json.Unmarshal([]byte(raw), &arguments) != nil {
			return emitted, &ProviderError{Provider: provider, Kind: "response_schema"}
		}
		parts = append(parts, &genai.Part{FunctionCall: &genai.FunctionCall{ID: call.ID, Name: call.Name, Args: arguments}})
	}
	if len(parts) == 0 {
		// A provider that streams a fully-formed, done response with no
		// text, reasoning, or tool call is not a malformed-output bug the
		// same request would just repeat (like response_schema below) —
		// it is the same class of transient provider flakiness as
		// truncated_stream above, so it must fall back the same way.
		return emitted, &ProviderError{Provider: provider, Retryable: true, Kind: "empty_response"}
	}
	yield(&model.LLMResponse{Content: &genai.Content{Role: "model", Parts: parts}, UsageMetadata: usageMetadata(usage), ModelVersion: modelVersion, TurnComplete: true, FinishReason: finishReason(finish)}, nil)
	return true, nil
}

func responseParts(delta chatDelta) ([]*genai.Part, error) {
	var parts []*genai.Part
	reasoning := delta.ReasoningContent
	if reasoning == "" {
		reasoning = delta.Reasoning
	}
	if reasoning != "" {
		parts = append(parts, &genai.Part{Text: reasoning, Thought: true})
	}
	if delta.Content != "" {
		parts = append(parts, genai.NewPartFromText(delta.Content))
	}
	for _, call := range delta.ToolCalls {
		if call.Function.Name == "" {
			return nil, errors.New("function call has no name")
		}
		arguments := map[string]any{}
		if call.Function.Arguments != "" && json.Unmarshal([]byte(call.Function.Arguments), &arguments) != nil {
			return nil, errors.New("invalid function arguments")
		}
		parts = append(parts, &genai.Part{FunctionCall: &genai.FunctionCall{ID: call.ID, Name: call.Function.Name, Args: arguments}})
	}
	if len(parts) == 0 {
		return nil, errors.New("empty provider response")
	}
	return parts, nil
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
