package clerk

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Backend is the narrow Clerk boundary shared by Telegram linking and
// credential routing. Implementations may mirror link metadata best-effort;
// D1 remains the authoritative account-link store.
type Backend interface {
	MirrorTelegramLink(context.Context, int64, string) error
	MirrorTelegramUnlink(context.Context, int64) error
	LinkedUserID(context.Context, int64) (string, error)
	OAuthConnections(context.Context, string) (ConnectionState, error)
}

func (b *HTTPBackend) MirrorTelegramUnlink(ctx context.Context, telegramUserID int64) error {
	users, err := b.usersByExternalID(ctx, telegramUserID)
	if err != nil || len(users) == 0 {
		return err
	}
	body := struct {
		PrivateMetadata map[string]*string `json:"private_metadata"`
	}{map[string]*string{"linked_clerk_user_id": nil}}
	return b.request(ctx, http.MethodPatch, "/users/"+url.PathEscape(users[0].ID)+"/metadata", nil, body, nil)
}

type ConnectionState struct {
	Strava      bool   `json:"strava"`
	Kroger      bool   `json:"kroger"`
	StravaToken string `json:"-"`
	KrogerToken string `json:"-"`
}

var ErrNotConfigured = errors.New("clerk backend is not configured")

type HTTPBackend struct {
	client  *http.Client
	baseURL string
	secret  string
}

func NewBackend(client *http.Client, baseURL, secret string) (*HTTPBackend, error) {
	if strings.TrimSpace(secret) == "" {
		return nil, ErrNotConfigured
	}
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "https://api.clerk.com/v1"
	}
	parsed, err := url.Parse(strings.TrimRight(baseURL, "/"))
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return nil, errors.New("invalid Clerk backend URL")
	}
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	if client.Timeout <= 0 {
		copied := *client
		copied.Timeout = 15 * time.Second
		client = &copied
	}
	return &HTTPBackend{client: client, baseURL: parsed.String(), secret: secret}, nil
}

type clerkUser struct {
	ID              string         `json:"id"`
	PrivateMetadata map[string]any `json:"private_metadata"`
}

func (b *HTTPBackend) LinkedUserID(ctx context.Context, telegramUserID int64) (string, error) {
	users, err := b.usersByExternalID(ctx, telegramUserID)
	if err != nil || len(users) == 0 {
		return "", err
	}
	if linked, ok := users[0].PrivateMetadata["linked_clerk_user_id"].(string); ok && linked != "" {
		return linked, nil
	}
	return users[0].ID, nil
}

func (b *HTTPBackend) MirrorTelegramLink(ctx context.Context, telegramUserID int64, clerkUserID string) error {
	users, err := b.usersByExternalID(ctx, telegramUserID)
	if err != nil {
		return err
	}
	if len(users) == 0 {
		return nil
	}
	body := struct {
		PrivateMetadata map[string]string `json:"private_metadata"`
	}{map[string]string{"linked_clerk_user_id": clerkUserID}}
	return b.request(ctx, http.MethodPatch, "/users/"+url.PathEscape(users[0].ID)+"/metadata", nil, body, nil)
}

func (b *HTTPBackend) OAuthConnections(ctx context.Context, clerkUserID string) (ConnectionState, error) {
	if strings.TrimSpace(clerkUserID) == "" {
		return ConnectionState{}, errors.New("clerk user ID is required")
	}
	state := ConnectionState{}
	for _, provider := range []struct {
		name   string
		target *bool
	}{{"oauth_custom_shopping", &state.Kroger}, {"custom_shopping", &state.Kroger}, {"oauth_custom_strava", &state.Strava}, {"custom_strava", &state.Strava}} {
		if *provider.target {
			continue
		}
		var tokens []struct {
			Token string `json:"token"`
		}
		err := b.request(ctx, http.MethodGet, "/users/"+url.PathEscape(clerkUserID)+"/oauth_access_tokens/"+url.PathEscape(provider.name), nil, nil, &tokens)
		if err == nil && len(tokens) > 0 && tokens[0].Token != "" {
			*provider.target = true
			if provider.target == &state.Kroger {
				state.KrogerToken = tokens[0].Token
			} else {
				state.StravaToken = tokens[0].Token
			}
		}
	}
	return state, nil
}

func (b *HTTPBackend) usersByExternalID(ctx context.Context, telegramUserID int64) ([]clerkUser, error) {
	query := url.Values{"external_id": {strconv.FormatInt(telegramUserID, 10)}, "limit": {"1"}}
	var users []clerkUser
	if err := b.request(ctx, http.MethodGet, "/users", query, nil, &users); err != nil {
		return nil, err
	}
	return users, nil
}

func (b *HTTPBackend) request(ctx context.Context, method, path string, query url.Values, input, output any) error {
	var body io.Reader
	if input != nil {
		encoded, err := json.Marshal(input)
		if err != nil {
			return errors.New("encode Clerk request")
		}
		body = bytes.NewReader(encoded)
	}
	endpoint := b.baseURL + path
	if len(query) > 0 {
		endpoint += "?" + query.Encode()
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return errors.New("build Clerk request")
	}
	request.Header.Set("Authorization", "Bearer "+b.secret)
	request.Header.Set("Content-Type", "application/json")
	response, err := b.client.Do(request)
	if err != nil {
		return errors.New("clerk backend request failed")
	}
	defer func() { _ = response.Body.Close() }()
	data, err := io.ReadAll(io.LimitReader(response.Body, (1<<20)+1))
	if err != nil || len(data) > 1<<20 {
		return errors.New("clerk backend response invalid")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return errors.New("clerk backend rejected request")
	}
	if output != nil && json.Unmarshal(data, output) != nil {
		return errors.New("decode Clerk backend response")
	}
	return nil
}
