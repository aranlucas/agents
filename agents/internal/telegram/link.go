package telegram

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/aranlucas/agents/agents/internal/cloudflare"
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

func (s *LinkStore) Create(ctx context.Context, telegramUserID int64, ttl time.Duration) (string, error) {
	return s.CreateForChat(ctx, telegramUserID, telegramUserID, ttl)
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
	row := selected[0].Rows[0]
	expires, ok := rowInt64(row["expires_at"])
	if !ok {
		return AccountLink{}, ErrLinkTokenInvalid
	}
	if row["consumed_at"] != nil {
		return AccountLink{}, ErrLinkTokenUsed
	}
	now := s.now().UTC().UnixMilli()
	if expires < now {
		return AccountLink{}, ErrLinkTokenExpired
	}
	userID, okUser := rowInt64(row["telegram_user_id"])
	chatID, okChat := rowInt64(row["telegram_chat_id"])
	if !okUser || !okChat {
		return AccountLink{}, ErrLinkTokenInvalid
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
ON CONFLICT(telegram_user_id) DO UPDATE SET clerk_user_id=excluded.clerk_user_id, telegram_chat_id=excluded.telegram_chat_id, linked_at=excluded.linked_at, unlinked_at=NULL`, Params: []any{userID, clerkUserID, chatID, now}})
	if err != nil {
		return AccountLink{}, errors.New("store Telegram account link")
	}
	return AccountLink{TelegramUserID: userID, TelegramChatID: chatID, ClerkUserID: clerkUserID, LinkedAt: now}, nil
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
	row := results[0].Rows[0]
	userID, okUser := rowInt64(row["telegram_user_id"])
	chatID, okChat := rowInt64(row["telegram_chat_id"])
	linkedAt, okTime := rowInt64(row["linked_at"])
	clerkID, okClerk := row["clerk_user_id"].(string)
	if !okUser || !okChat || !okTime || !okClerk {
		return AccountLink{}, false, errors.New("telegram account link is malformed")
	}
	return AccountLink{TelegramUserID: userID, TelegramChatID: chatID, ClerkUserID: clerkID, LinkedAt: linkedAt}, true, nil
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
func rowInt64(value any) (int64, bool) {
	switch typed := value.(type) {
	case float64:
		return int64(typed), typed == float64(int64(typed))
	case int64:
		return typed, true
	case int:
		return int64(typed), true
	case string:
		parsed, err := strconv.ParseInt(typed, 10, 64)
		return parsed, err == nil
	default:
		return 0, false
	}
}

func (a AccountLink) String() string {
	return fmt.Sprintf("telegram:%d->clerk:%s", a.TelegramUserID, a.ClerkUserID)
}
