// Package providererrors defines the provider-neutral, safe error metadata
// shared by model adapters, transports, and observability.
package providererrors

import "errors"

// Kind is a stable, low-cardinality provider failure classification.
type Kind string

const (
	RateLimit      Kind = "rate_limit"
	RequestSchema  Kind = "request_schema"
	ResponseSchema Kind = "response_schema"
	EmptyResponse  Kind = "empty_response"
	HTTP           Kind = "http"
	NotFound       Kind = "not_found"
	Authentication Kind = "authentication"
	Network        Kind = "network"
	Configuration  Kind = "configuration"
	CircuitOpen    Kind = "circuit_open"
)

// Metadata contains only safe operational identifiers. It must never contain a
// prompt, response body, credential, or raw upstream error message.
type Metadata struct {
	Provider  string
	Model     string
	Status    int
	Retryable bool
	Kind      Kind
}

// Classified is implemented by errors that can describe their provider
// failure without exposing the raw upstream response.
type Classified interface {
	error
	ProviderFailure() Metadata
}

// Details extracts safe provider metadata through wrapped errors.
func Details(err error) (Metadata, bool) {
	classified, ok := errors.AsType[Classified](err)
	if !ok {
		return Metadata{}, false
	}
	return classified.ProviderFailure(), true
}
