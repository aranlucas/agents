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
	"agents/internal/providererrors"
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
type ProviderErrorKind = providererrors.Kind

const (
	ProviderErrorRateLimit      = providererrors.RateLimit
	ProviderErrorRequestSchema  = providererrors.RequestSchema
	ProviderErrorResponseSchema = providererrors.ResponseSchema
	ProviderErrorEmptyResponse  = providererrors.EmptyResponse
	ProviderErrorHTTP           = providererrors.HTTP
	ProviderErrorNotFound       = providererrors.NotFound
	ProviderErrorAuthentication = providererrors.Authentication
	ProviderErrorNetwork        = providererrors.Network
	ProviderErrorConfiguration  = providererrors.Configuration
	ProviderErrorCircuitOpen    = providererrors.CircuitOpen
)

type ProviderError struct {
	Provider  string
	Model     string
	Status    int
	Retryable bool
	Kind      ProviderErrorKind
	cause     error
}

func (e *ProviderError) Error() string {
	return providerErrorSummary(providererrors.Metadata{
		Provider: e.Provider, Model: e.Model, Status: e.Status,
		Retryable: e.Retryable, Kind: e.Kind,
	})
}
func (e *ProviderError) Unwrap() error { return e.cause }

func (e *ProviderError) ProviderFailure() providererrors.Metadata {
	return providererrors.Metadata{
		Provider: e.Provider, Model: e.Model, Status: e.Status,
		Retryable: e.Retryable, Kind: e.Kind,
	}
}

func providerErrorSummary(a providererrors.Metadata) string {
	model := strings.TrimSpace(a.Model)
	switch a.Kind {
	case ProviderErrorRateLimit:
		if a.Status != 0 {
			return fmt.Sprintf("provider %s rate limited model %s (HTTP %d)", a.Provider, model, a.Status)
		}
		return fmt.Sprintf("provider %s rate limit reached for model %s", a.Provider, model)
	case ProviderErrorNotFound:
		return fmt.Sprintf("provider %s could not find model %s (HTTP %d)", a.Provider, model, a.Status)
	case ProviderErrorAuthentication:
		return fmt.Sprintf("provider %s authentication failed for model %s (HTTP %d)", a.Provider, model, a.Status)
	case ProviderErrorHTTP:
		return fmt.Sprintf("provider %s returned HTTP %d for model %s", a.Provider, a.Status, model)
	default:
		return fmt.Sprintf("provider %s failed for model %s (%s)", a.Provider, model, a.Kind)
	}
}

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

var errFirstContentTimeout = errors.New("provider did not produce content before the startup deadline")

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
			if err := m.circuitAvailable(pc.config); err != nil {
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
		return false, &ProviderError{Provider: pc.config.Name, Model: pc.config.Model, Kind: ProviderErrorConfiguration, cause: pc.err}
	}
	if err := m.limiter.Acquire(ctx, pc.config.Name, pc.config.RequestsPerMinute); err != nil {
		return false, &ProviderError{Provider: pc.config.Name, Model: pc.config.Model, Retryable: errors.Is(err, rate.ErrLimitReached), Kind: ProviderErrorRateLimit, cause: err}
	}
	request := sanitizeRequest(req, pc.config.Model)
	providerCtx, cancel := context.WithCancelCause(ctx)
	defer cancel(nil)
	var timer *time.Timer
	if pc.config.FirstContentTimeout > 0 {
		timer = time.AfterFunc(pc.config.FirstContentTimeout, func() { cancel(errFirstContentTimeout) })
		defer timer.Stop()
	}
	timeoutError := func() error {
		return &ProviderError{Provider: pc.config.Name, Model: pc.config.Model, Retryable: true, Kind: ProviderErrorNetwork, cause: errFirstContentTimeout}
	}
	var pending []*model.LLMResponse
	emitted := false
	for response, err := range pc.model.GenerateContent(providerCtx, request, stream) {
		if errors.Is(context.Cause(providerCtx), errFirstContentTimeout) {
			return emitted, timeoutError()
		}
		if err != nil {
			return emitted, providerError(pc.config.Name, pc.config.Model, err)
		}
		if response == nil {
			continue
		}
		if timer != nil {
			// Reasoning is not usable output. Hold it until this provider wins
			// so a fallback never combines responses from different models.
			pending = append(pending, response)
			if !hasUsableContent(response) {
				continue
			}
			if !timer.Stop() {
				return false, timeoutError()
			}
			timer = nil
			emitted = true
			for _, buffered := range pending {
				if !yield(buffered, nil) {
					return true, nil
				}
			}
			pending = nil
			continue
		}
		emitted = true
		if !yield(response, nil) {
			return true, nil
		}
	}
	if errors.Is(context.Cause(providerCtx), errFirstContentTimeout) {
		return emitted, timeoutError()
	}
	if !emitted {
		return false, &ProviderError{Provider: pc.config.Name, Model: pc.config.Model, Retryable: true, Kind: ProviderErrorEmptyResponse}
	}
	return true, nil
}

func hasUsableContent(response *model.LLMResponse) bool {
	if response.Content == nil {
		return false
	}
	for _, part := range response.Content.Parts {
		if part != nil && !part.Thought && (strings.TrimSpace(part.Text) != "" || part.FunctionCall != nil || part.InlineData != nil) {
			return true
		}
	}
	return false
}

func providerError(provider, modelName string, err error) error {
	if apiErr, ok := errors.AsType[*sdkopenai.Error](err); ok {
		retryable := apiErr.StatusCode == http.StatusRequestTimeout ||
			apiErr.StatusCode == http.StatusRequestEntityTooLarge ||
			apiErr.StatusCode == http.StatusTooManyRequests ||
			apiErr.StatusCode >= http.StatusInternalServerError
		kind := ProviderErrorHTTP
		switch apiErr.StatusCode {
		case http.StatusUnauthorized, http.StatusForbidden:
			kind = ProviderErrorAuthentication
		case http.StatusNotFound:
			kind = ProviderErrorNotFound
		case http.StatusTooManyRequests:
			kind = ProviderErrorRateLimit
		}
		return &ProviderError{
			Provider:  provider,
			Model:     modelName,
			Status:    apiErr.StatusCode,
			Retryable: retryable,
			Kind:      kind,
			cause:     err,
		}
	}
	if _, ok := errors.AsType[net.Error](err); ok || errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return &ProviderError{Provider: provider, Model: modelName, Retryable: true, Kind: ProviderErrorNetwork, cause: err}
	}
	switch {
	case errors.Is(err, openaimodel.ErrEmptyResponse),
		errors.Is(err, openaimodel.ErrNoOutputItems),
		errors.Is(err, openaimodel.ErrNoTextOrToolContent):
		return &ProviderError{Provider: provider, Model: modelName, Retryable: true, Kind: ProviderErrorEmptyResponse, cause: err}
	case errors.Is(err, openaimodel.ErrUnsupportedMessageContentType),
		errors.Is(err, openaimodel.ErrUnsupportedOutputItemType),
		strings.Contains(err.Error(), "parse function call args"),
		strings.Contains(err.Error(), "parse streamed function args"),
		strings.Contains(err.Error(), "openai response failed"),
		strings.Contains(err.Error(), "openai stream error"):
		return &ProviderError{Provider: provider, Model: modelName, Kind: ProviderErrorResponseSchema, cause: err}
	default:
		return &ProviderError{Provider: provider, Model: modelName, Kind: ProviderErrorRequestSchema, cause: err}
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
		return &ProviderError{Provider: provider.Name, Model: provider.Model, Kind: ProviderErrorConfiguration}
	}
	loopback := parsed.Hostname() == "127.0.0.1" || parsed.Hostname() == "localhost" || parsed.Hostname() == "::1"
	if parsed.Scheme != "https" && (parsed.Scheme != "http" || !loopback) {
		return &ProviderError{Provider: provider.Name, Model: provider.Model, Kind: ProviderErrorConfiguration}
	}
	if provider.Name == "" || provider.APIKey == "" || provider.RequestsPerMinute <= 0 {
		return &ProviderError{Provider: provider.Name, Model: provider.Model, Kind: ProviderErrorConfiguration}
	}
	return nil
}

func isRetryable(err error) bool {
	providerError, ok := errors.AsType[*ProviderError](err)
	return ok && providerError.Retryable
}

func (m *Model) circuitAvailable(provider config.Provider) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	state := m.circuits[provider.Name]
	if m.now().Before(state.openUntil) {
		return &ProviderError{Provider: provider.Name, Model: provider.Model, Retryable: true, Kind: ProviderErrorCircuitOpen}
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
