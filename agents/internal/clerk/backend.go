package clerk

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	clerksdk "github.com/clerk/clerk-sdk-go/v2"
	"github.com/clerk/clerk-sdk-go/v2/user"
)

// Backend is the narrow Clerk boundary shared by Telegram linking and
// credential routing. The production implementation uses Clerk's official Go
// SDK; this interface keeps callers and deterministic tests decoupled from the
// concrete SDK client.
type Backend interface {
	MirrorTelegramLink(context.Context, int64, string) error
	MirrorTelegramUnlink(context.Context, int64) error
	LinkedUserID(context.Context, int64) (string, error)
	OAuthConnections(context.Context, string) (ConnectionState, error)
}

type ConnectionState struct {
	Strava      bool   `json:"strava"`
	Kroger      bool   `json:"kroger"`
	StravaToken string `json:"-"`
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
	config.Key = clerksdk.String(strings.TrimSpace(secret))
	config.HTTPClient = client
	if strings.TrimSpace(baseURL) != "" {
		parsed, err := url.Parse(strings.TrimRight(baseURL, "/"))
		if err != nil || parsed.Host == "" || !secureBackendURL(parsed) {
			return nil, errors.New("invalid Clerk backend URL")
		}
		config.URL = clerksdk.String(parsed.String())
	}

	return &SDKBackend{users: user.NewClient(config)}, nil
}

func (b *SDKBackend) MirrorTelegramUnlink(ctx context.Context, telegramUserID int64) error {
	users, err := b.usersByExternalID(ctx, telegramUserID)
	if err != nil || len(users) == 0 {
		return err
	}
	metadata := json.RawMessage(`{"linked_clerk_user_id":null}`)
	_, err = b.users.UpdateMetadata(ctx, users[0].ID, &user.UpdateMetadataParams{PrivateMetadata: &metadata})
	return err
}

func (b *SDKBackend) LinkedUserID(ctx context.Context, telegramUserID int64) (string, error) {
	users, err := b.usersByExternalID(ctx, telegramUserID)
	if err != nil || len(users) == 0 {
		return "", err
	}
	var metadata struct {
		LinkedClerkUserID string `json:"linked_clerk_user_id"`
	}
	if len(users[0].PrivateMetadata) > 0 {
		_ = json.Unmarshal(users[0].PrivateMetadata, &metadata)
	}
	if metadata.LinkedClerkUserID != "" {
		return metadata.LinkedClerkUserID, nil
	}
	return users[0].ID, nil
}

func (b *SDKBackend) MirrorTelegramLink(ctx context.Context, telegramUserID int64, clerkUserID string) error {
	users, err := b.usersByExternalID(ctx, telegramUserID)
	if err != nil || len(users) == 0 {
		return err
	}
	encoded, err := json.Marshal(map[string]string{"linked_clerk_user_id": clerkUserID})
	if err != nil {
		return err
	}
	metadata := json.RawMessage(encoded)
	_, err = b.users.UpdateMetadata(ctx, users[0].ID, &user.UpdateMetadataParams{PrivateMetadata: &metadata})
	return err
}

func (b *SDKBackend) OAuthConnections(ctx context.Context, clerkUserID string) (ConnectionState, error) {
	if strings.TrimSpace(clerkUserID) == "" {
		return ConnectionState{}, errors.New("clerk user ID is required")
	}

	state := ConnectionState{}
	for _, provider := range []struct {
		name   string
		target *bool
		token  *string
	}{
		{name: "oauth_custom_shopping", target: &state.Kroger, token: &state.KrogerToken},
		{name: "custom_shopping", target: &state.Kroger, token: &state.KrogerToken},
		{name: "oauth_custom_strava", target: &state.Strava, token: &state.StravaToken},
		{name: "custom_strava", target: &state.Strava, token: &state.StravaToken},
	} {
		if *provider.target {
			continue
		}
		tokens, err := b.users.ListOAuthAccessTokens(ctx, &user.ListOAuthAccessTokensParams{
			ID: clerkUserID, Provider: provider.name,
		})
		if err == nil && len(tokens.OAuthAccessTokens) > 0 && tokens.OAuthAccessTokens[0].Token != "" {
			*provider.target = true
			*provider.token = tokens.OAuthAccessTokens[0].Token
		}
	}
	return state, nil
}

func (b *SDKBackend) usersByExternalID(ctx context.Context, telegramUserID int64) ([]*clerksdk.User, error) {
	result, err := b.users.List(ctx, &user.ListParams{ExternalIDs: []string{strconv.FormatInt(telegramUserID, 10)}})
	if err != nil {
		return nil, err
	}
	return result.Users, nil
}

func secureBackendURL(parsed *url.URL) bool {
	if parsed.Scheme == "https" {
		return true
	}
	host := parsed.Hostname()
	ip := net.ParseIP(host)
	return parsed.Scheme == "http" && (host == "localhost" || ip != nil && ip.IsLoopback())
}
