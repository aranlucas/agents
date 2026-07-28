// Package openai implements ADK-Go model.LLM over OpenAI-compatible providers.
package openai

import (
	"context"
	"errors"
	"fmt"
	"iter"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"agents/internal/common"
	"agents/internal/config"
	"agents/internal/rate"
	sdkopenai "github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/model/openaimodel"
	"google.golang.org/genai"
)

const (
	circuitThreshold         = 3
	circuitCooldown          = 30 * time.Second
	defaultModelHTTPTimeout  = 180 * time.Second
	defaultModelResponseSize = 32 << 20
)

// Limiter is the provider rate-limit boundary.
type Limiter interface {
	Acquire(context.Context, string, int) error
}

// ProviderError contains safe classification without credentials or prompts.
type ProviderErrorKind string

const (
	ProviderErrorRateLimit      ProviderErrorKind = "rate_limit"
	ProviderErrorRequestSchema  ProviderErrorKind = "request_schema"
	ProviderErrorResponseSchema ProviderErrorKind = "response_schema"
	ProviderErrorEmptyResponse  ProviderErrorKind = "empty_response"
	ProviderErrorHTTP           ProviderErrorKind = "http"
	ProviderErrorNetwork        ProviderErrorKind = "network"
	ProviderErrorConfiguration  ProviderErrorKind = "configuration"
	ProviderErrorCircuitOpen    ProviderErrorKind = "circuit_open"
)

type ProviderError struct {
	Provider  string
	Status    int
	Retryable bool
	Kind      ProviderErrorKind
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

// providerClient pairs an ADK OpenAI model with its application policy.
type providerClient struct {
	config config.Provider
	model  model.LLM
	err    error
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
	if httpClient == nil {
		httpClient = common.NewHTTPClient(defaultModelHTTPTimeout, defaultModelResponseSize).Client
	}
	pcs := make([]providerClient, len(providers))
	for i, p := range providers {
		options := []option.RequestOption{option.WithMaxRetries(0)}
		if p.ReasoningEffort != "" {
			options = append(options, option.WithJSONSet("reasoning.effort", p.ReasoningEffort))
		}
		llm, err := openaimodel.NewModel(context.Background(), p.Model, &openaimodel.ClientConfig{
			APIKey:     p.APIKey,
			BaseURL:    p.BaseURL,
			HTTPClient: httpClient,
			Options:    options,
		})
		pcs[i] = providerClient{config: p, model: llm, err: err}
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
	if pc.err != nil || pc.model == nil {
		return false, &ProviderError{Provider: pc.config.Name, Kind: ProviderErrorConfiguration, cause: pc.err}
	}
	if err := m.limiter.Acquire(ctx, pc.config.Name, pc.config.RequestsPerMinute); err != nil {
		return false, &ProviderError{Provider: pc.config.Name, Retryable: errors.Is(err, rate.ErrLimitReached), Kind: ProviderErrorRateLimit, cause: err}
	}
	request := sanitizeRequest(req, pc.config.Model)
	emitted := false
	for response, err := range pc.model.GenerateContent(ctx, request, stream) {
		if err != nil {
			return emitted, providerError(pc.config.Name, err)
		}
		if response == nil {
			continue
		}
		emitted = true
		if !yield(response, nil) {
			return true, nil
		}
	}
	if !emitted {
		return false, &ProviderError{Provider: pc.config.Name, Retryable: true, Kind: ProviderErrorEmptyResponse}
	}
	return true, nil
}

func providerError(provider string, err error) error {
	var apiErr *sdkopenai.Error
	if errors.As(err, &apiErr) {
		retryable := apiErr.StatusCode == http.StatusRequestTimeout ||
			apiErr.StatusCode == http.StatusRequestEntityTooLarge ||
			apiErr.StatusCode == http.StatusTooManyRequests ||
			apiErr.StatusCode >= http.StatusInternalServerError
		return &ProviderError{
			Provider:  provider,
			Status:    apiErr.StatusCode,
			Retryable: retryable,
			Kind:      ProviderErrorHTTP,
			cause:     err,
		}
	}
	var networkErr net.Error
	if errors.As(err, &networkErr) || errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return &ProviderError{Provider: provider, Retryable: true, Kind: ProviderErrorNetwork, cause: err}
	}
	switch {
	case errors.Is(err, openaimodel.ErrEmptyResponse),
		errors.Is(err, openaimodel.ErrNoOutputItems),
		errors.Is(err, openaimodel.ErrNoTextOrToolContent):
		return &ProviderError{Provider: provider, Retryable: true, Kind: ProviderErrorEmptyResponse, cause: err}
	case errors.Is(err, openaimodel.ErrUnsupportedMessageContentType),
		errors.Is(err, openaimodel.ErrUnsupportedOutputItemType),
		strings.Contains(err.Error(), "parse function call args"),
		strings.Contains(err.Error(), "parse streamed function args"),
		strings.Contains(err.Error(), "openai response failed"),
		strings.Contains(err.Error(), "openai stream error"):
		return &ProviderError{Provider: provider, Kind: ProviderErrorResponseSchema, cause: err}
	default:
		return &ProviderError{Provider: provider, Kind: ProviderErrorRequestSchema, cause: err}
	}
}

// sanitizeRequest preserves the provider boundary established by ADK while
// removing cross-model thought artifacts that the OpenAI Responses API cannot
// represent. The configured provider model must win over a model name carried
// by an upstream request so each fallback retains its own policy.
func sanitizeRequest(req *model.LLMRequest, modelName string) *model.LLMRequest {
	if req == nil {
		return nil
	}
	clone := *req
	clone.Model = modelName
	clone.Contents = make([]*genai.Content, 0, len(req.Contents))
	for _, content := range req.Contents {
		if content == nil {
			continue
		}
		contentClone := *content
		contentClone.Parts = make([]*genai.Part, 0, len(content.Parts))
		for _, part := range content.Parts {
			if part == nil || part.Thought {
				continue
			}
			if len(part.ThoughtSignature) > 0 &&
				part.Text == "" &&
				part.FunctionCall == nil &&
				part.FunctionResponse == nil &&
				part.InlineData == nil &&
				part.FileData == nil {
				continue
			}
			contentClone.Parts = append(contentClone.Parts, part)
		}
		if len(contentClone.Parts) > 0 {
			clone.Contents = append(clone.Contents, &contentClone)
		}
	}
	return &clone
}

func validateProvider(provider config.Provider) error {
	parsed, err := url.Parse(provider.BaseURL)
	if err != nil || parsed.Host == "" {
		return &ProviderError{Provider: provider.Name, Kind: ProviderErrorConfiguration}
	}
	loopback := parsed.Hostname() == "127.0.0.1" || parsed.Hostname() == "localhost" || parsed.Hostname() == "::1"
	if parsed.Scheme != "https" && (parsed.Scheme != "http" || !loopback) {
		return &ProviderError{Provider: provider.Name, Kind: ProviderErrorConfiguration}
	}
	if provider.Name == "" || provider.APIKey == "" || provider.RequestsPerMinute <= 0 {
		return &ProviderError{Provider: provider.Name, Kind: ProviderErrorConfiguration}
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
		return &ProviderError{Provider: name, Retryable: true, Kind: ProviderErrorCircuitOpen}
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
