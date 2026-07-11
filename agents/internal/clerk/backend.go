package clerk

import (
	"context"
	"errors"
)

// Backend is the narrow Clerk boundary shared by Telegram linking and
// credential routing. Implementations may mirror link metadata best-effort;
// D1 remains the authoritative account-link store.
type Backend interface {
	MirrorTelegramLink(context.Context, int64, string) error
	LinkedUserID(context.Context, int64) (string, error)
	OAuthConnections(context.Context, string) (ConnectionState, error)
}

type ConnectionState struct {
	Strava bool `json:"strava"`
	Kroger bool `json:"kroger"`
}

var ErrNotConfigured = errors.New("clerk backend is not configured")
