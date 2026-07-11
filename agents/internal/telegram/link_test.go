package telegram

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/aranlucas/agents/agents/internal/cloudflare"
)

type memoryLinkDB struct {
	mu     sync.Mutex
	tokens map[string]map[string]any
	links  map[int64]AccountLink
	sql    []cloudflare.Statement
}

func newMemoryLinkDB() *memoryLinkDB {
	return &memoryLinkDB{tokens: map[string]map[string]any{}, links: map[int64]AccountLink{}}
}
func (d *memoryLinkDB) Run(_ context.Context, statements ...cloudflare.Statement) ([]cloudflare.Result, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	results := make([]cloudflare.Result, 0, len(statements))
	for _, statement := range statements {
		d.sql = append(d.sql, statement)
		result := cloudflare.Result{Success: true}
		switch {
		case strings.HasPrefix(statement.SQL, "INSERT INTO telegram_link_tokens"):
			d.tokens[statement.Params[0].(string)] = map[string]any{"telegram_user_id": statement.Params[1], "telegram_chat_id": statement.Params[2], "expires_at": statement.Params[3], "consumed_at": nil}
		case strings.HasPrefix(statement.SQL, "SELECT telegram_user_id") && strings.Contains(statement.SQL, "FROM telegram_link_tokens"):
			if row, ok := d.tokens[statement.Params[0].(string)]; ok {
				result.Rows = []map[string]any{row}
			}
		case strings.HasPrefix(statement.SQL, "SELECT telegram_user_id") && strings.Contains(statement.SQL, "FROM telegram_account_links"):
			if link, ok := d.links[statement.Params[0].(int64)]; ok {
				result.Rows = []map[string]any{{"telegram_user_id": link.TelegramUserID, "telegram_chat_id": link.TelegramChatID, "clerk_user_id": link.ClerkUserID, "linked_at": link.LinkedAt}}
			}
		case strings.HasPrefix(statement.SQL, "UPDATE telegram_link_tokens"):
			row := d.tokens[statement.Params[1].(string)]
			if row != nil && row["consumed_at"] == nil && row["expires_at"].(int64) >= statement.Params[2].(int64) {
				row["consumed_at"] = statement.Params[0]
				result.Meta.Changes = 1
			}
		case strings.HasPrefix(statement.SQL, "INSERT INTO telegram_account_links"):
			userID := statement.Params[0].(int64)
			d.links[userID] = AccountLink{TelegramUserID: userID, ClerkUserID: statement.Params[1].(string), TelegramChatID: statement.Params[2].(int64), LinkedAt: statement.Params[3].(int64)}
		case strings.HasPrefix(statement.SQL, "UPDATE telegram_account_links"):
			if _, ok := d.links[statement.Params[1].(int64)]; ok {
				delete(d.links, statement.Params[1].(int64))
				result.Meta.Changes = 1
			}
		}
		results = append(results, result)
	}
	return results, nil
}

func TestLinkTokenIsHashedOneTimeAndExpires(t *testing.T) {
	now := time.Date(2026, 7, 10, 12, 0, 0, 0, time.UTC)
	db := newMemoryLinkDB()
	store := newLinkStore(db, func() time.Time { return now })
	raw, err := store.CreateForChat(t.Context(), 42, -100, 10*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	for hash := range db.tokens {
		if hash == raw || strings.Contains(hash, raw) {
			t.Fatal("raw token persisted")
		}
	}
	link, err := store.Consume(t.Context(), raw, "user-a")
	if err != nil || link.TelegramChatID != -100 {
		t.Fatalf("link=%#v err=%v", link, err)
	}
	if _, err := store.Consume(t.Context(), raw, "user-a"); !errors.Is(err, ErrLinkTokenUsed) {
		t.Fatalf("error=%v", err)
	}
	rawExpired, err := store.Create(t.Context(), 43, time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	now = now.Add(2 * time.Minute)
	if _, err := store.Consume(t.Context(), rawExpired, "user-b"); !errors.Is(err, ErrLinkTokenExpired) {
		t.Fatalf("error=%v", err)
	}
}
