package clerk

import (
	"context"
	json "encoding/json/v2"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	clerksdk "github.com/clerk/clerk-sdk-go/v2"
	"github.com/clerk/clerk-sdk-go/v2/user"
)

// Backend is the narrow Clerk boundary for credential routing. Telegram
// account links are persisted in the database by telegram.LinkStore.
type Backend interface {
	OAuthConnections(context.Context, string) (ConnectionState, error)
}

type ConnectionState struct {
	Kroger      bool   `json:"kroger"`
	KrogerToken string `json:"-"`
}

var ErrNotConfigured = errors.New("clerk backend is not configured")

// SDKBackend wraps the official Clerk Users API client.
type SDKBackend struct {
	users *user.Client
}

func NewBackend(client *http.Client, baseURL, secret string) (*SDKBackend, error) {
	if strings.TrimSpace(secret) == "" {
		return nil, ErrNotConfigured
	}
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	if client.Timeout <= 0 {
		copyClient := *client
		copyClient.Timeout = 15 * time.Second
		client = &copyClient
	}

	config := &clerksdk.ClientConfig{}
	config.Key = new(strings.TrimSpace(secret))
	config.HTTPClient = client
	if strings.TrimSpace(baseURL) != "" {
		parsed, err := url.Parse(strings.TrimRight(baseURL, "/"))
		if err != nil || parsed.Host == "" || !secureBackendURL(parsed) {
			return nil, errors.New("invalid Clerk backend URL")
		}
		config.URL = new(parsed.String())
	}

	return &SDKBackend{users: user.NewClient(config)}, nil
}

func (b *SDKBackend) OAuthConnections(ctx context.Context, clerkUserID string) (ConnectionState, error) {
	if strings.TrimSpace(clerkUserID) == "" {
		return ConnectionState{}, errors.New("clerk user ID is required")
	}

	state := ConnectionState{}
	var lookupErrors []error
	for _, provider := range []struct {
		name   string
		target *bool
		token  *string
	}{
		{name: "oauth_custom_shopping", target: &state.Kroger, token: &state.KrogerToken},
		{name: "custom_shopping", target: &state.Kroger, token: &state.KrogerToken},
	} {
		if *provider.target {
			continue
		}
		tokens, err := b.users.ListOAuthAccessTokens(ctx, &user.ListOAuthAccessTokensParams{
			ID: clerkUserID, Provider: provider.name,
		})
		if err != nil {
			if isDisconnectedOAuthGrant(err) {
				continue
			}
			lookupErrors = append(lookupErrors, fmt.Errorf("list %s OAuth tokens: %w", provider.name, err))
			continue
		}
		if len(tokens.OAuthAccessTokens) > 0 && tokens.OAuthAccessTokens[0].Token != "" {
			*provider.target = true
			*provider.token = tokens.OAuthAccessTokens[0].Token
		}
	}
	if !state.Kroger && len(lookupErrors) > 0 {
		return ConnectionState{}, errors.Join(lookupErrors...)
	}
	return state, nil
}

func isDisconnectedOAuthGrant(err error) bool {
	response, ok := errors.AsType[*clerksdk.APIErrorResponse](err)
	if !ok || response.HTTPStatusCode != http.StatusBadRequest {
		return false
	}
	for _, clerkError := range response.Errors {
		if clerkError.Code != "oauth_token_retrieval_error" {
			continue
		}
		var meta struct {
			ProviderError string `json:"provider_error"`
		}
		if json.Unmarshal(clerkError.Meta, &meta) == nil && strings.Contains(meta.ProviderError, `"invalid_grant"`) {
			return true
		}
	}
	return false
}

func secureBackendURL(parsed *url.URL) bool {
	if parsed.Scheme == "https" {
		return true
	}
	host := parsed.Hostname()
	ip := net.ParseIP(host)
	return parsed.Scheme == "http" && (host == "localhost" || ip != nil && ip.IsLoopback())
}
