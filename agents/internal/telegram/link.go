package telegram

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	json "encoding/json/v2"
	"errors"
	"strings"
	"time"

	"agents/internal/cloudflare"
)

var (
	ErrLinkTokenInvalid = errors.New("invalid Telegram link token")
	ErrLinkTokenUsed    = errors.New("telegram link token already used")
	ErrLinkTokenExpired = errors.New("telegram link token expired")
)

type d1Runner interface {
	Run(context.Context, ...cloudflare.Statement) ([]cloudflare.Result, error)
}

type AccountLink struct {
	TelegramUserID int64  `json:"telegram_user_id"`
	TelegramChatID int64  `json:"telegram_chat_id"`
	ClerkUserID    string `json:"clerk_user_id"`
	LinkedAt       int64  `json:"linked_at"`
}

type linkTokenRow struct {
	TelegramUserID int64  `json:"telegram_user_id"`
	TelegramChatID int64  `json:"telegram_chat_id"`
	ExpiresAt      int64  `json:"expires_at"`
	ConsumedAt     *int64 `json:"consumed_at"`
}

type LinkStore struct {
	db  d1Runner
	now func() time.Time
}

func NewLinkStore(db *cloudflare.D1, now func() time.Time) *LinkStore { return newLinkStore(db, now) }

func newLinkStore(db d1Runner, now func() time.Time) *LinkStore {
	if now == nil {
		now = time.Now
	}
	return &LinkStore{db: db, now: now}
}

func (s *LinkStore) CreateForChat(ctx context.Context, telegramUserID, telegramChatID int64, ttl time.Duration) (string, error) {
	if s == nil || s.db == nil || telegramUserID <= 0 || telegramChatID == 0 {
		return "", errors.New("valid Telegram identity and D1 store are required")
	}
	if ttl <= 0 || ttl > time.Hour {
		ttl = 10 * time.Minute
	}
	random := make([]byte, 32)
	if _, err := rand.Read(random); err != nil {
		return "", errors.New("generate Telegram link token")
	}
	raw := base64.RawURLEncoding.EncodeToString(random)
	now := s.now().UTC().UnixMilli()
	_, err := s.db.Run(ctx, cloudflare.Statement{SQL: `INSERT INTO telegram_link_tokens
(token_hash, telegram_user_id, telegram_chat_id, expires_at, consumed_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)`, Params: []any{hashToken(raw), telegramUserID, telegramChatID, now + ttl.Milliseconds(), now}})
	if err != nil {
		return "", errors.New("store Telegram link token")
	}
	return raw, nil
}

func (s *LinkStore) Consume(ctx context.Context, rawToken, clerkUserID string) (AccountLink, error) {
	if s == nil || s.db == nil || strings.TrimSpace(rawToken) == "" || strings.TrimSpace(clerkUserID) == "" {
		return AccountLink{}, ErrLinkTokenInvalid
	}
	hash := hashToken(rawToken)
	selected, err := s.db.Run(ctx, cloudflare.Statement{SQL: `SELECT telegram_user_id, telegram_chat_id, expires_at, consumed_at FROM telegram_link_tokens WHERE token_hash = ?`, Params: []any{hash}})
	if err != nil {
		return AccountLink{}, errors.New("read Telegram link token")
	}
	if len(selected) != 1 || len(selected[0].Rows) != 1 {
		return AccountLink{}, ErrLinkTokenInvalid
	}
	var row linkTokenRow
	if err := json.Unmarshal(selected[0].Rows[0], &row); err != nil || row.TelegramUserID <= 0 || row.TelegramChatID == 0 || row.ExpiresAt <= 0 {
		return AccountLink{}, ErrLinkTokenInvalid
	}
	if row.ConsumedAt != nil {
		return AccountLink{}, ErrLinkTokenUsed
	}
	now := s.now().UTC().UnixMilli()
	if row.ExpiresAt < now {
		return AccountLink{}, ErrLinkTokenExpired
	}
	updated, err := s.db.Run(ctx, cloudflare.Statement{SQL: `UPDATE telegram_link_tokens SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL AND expires_at >= ?`, Params: []any{now, hash, now}})
	if err != nil {
		return AccountLink{}, errors.New("consume Telegram link token")
	}
	if len(updated) != 1 || updated[0].Meta.Changes != 1 {
		return AccountLink{}, ErrLinkTokenUsed
	}
	_, err = s.db.Run(ctx, cloudflare.Statement{SQL: `INSERT INTO telegram_account_links
(telegram_user_id, clerk_user_id, telegram_chat_id, linked_at, unlinked_at) VALUES (?, ?, ?, ?, NULL)
ON CONFLICT(telegram_user_id) DO UPDATE SET clerk_user_id=excluded.clerk_user_id, telegram_chat_id=excluded.telegram_chat_id, linked_at=excluded.linked_at, unlinked_at=NULL`, Params: []any{row.TelegramUserID, clerkUserID, row.TelegramChatID, now}})
	if err != nil {
		return AccountLink{}, errors.New("store Telegram account link")
	}
	return AccountLink{TelegramUserID: row.TelegramUserID, TelegramChatID: row.TelegramChatID, ClerkUserID: clerkUserID, LinkedAt: now}, nil
}

func (s *LinkStore) Lookup(ctx context.Context, telegramUserID int64) (AccountLink, bool, error) {
	if s == nil || s.db == nil || telegramUserID <= 0 {
		return AccountLink{}, false, nil
	}
	results, err := s.db.Run(ctx, cloudflare.Statement{SQL: `SELECT telegram_user_id, telegram_chat_id, clerk_user_id, linked_at FROM telegram_account_links WHERE telegram_user_id=? AND unlinked_at IS NULL`, Params: []any{telegramUserID}})
	if err != nil {
		return AccountLink{}, false, errors.New("lookup Telegram account link")
	}
	if len(results) != 1 || len(results[0].Rows) == 0 {
		return AccountLink{}, false, nil
	}
	var row AccountLink
	if err := json.Unmarshal(results[0].Rows[0], &row); err != nil || row.TelegramUserID <= 0 || row.TelegramChatID == 0 || row.ClerkUserID == "" || row.LinkedAt <= 0 {
		return AccountLink{}, false, errors.New("telegram account link is malformed")
	}
	return row, true, nil
}

func (s *LinkStore) Unlink(ctx context.Context, telegramUserID int64) (bool, error) {
	if s == nil || s.db == nil || telegramUserID <= 0 {
		return false, nil
	}
	now := s.now().UTC().UnixMilli()
	results, err := s.db.Run(ctx, cloudflare.Statement{SQL: `UPDATE telegram_account_links SET unlinked_at=? WHERE telegram_user_id=? AND unlinked_at IS NULL`, Params: []any{now, telegramUserID}})
	if err != nil {
		return false, errors.New("unlink Telegram account")
	}
	return len(results) == 1 && results[0].Meta.Changes == 1, nil
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
