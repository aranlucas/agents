package rate

import (
	"errors"
	"testing"
	"time"

	"github.com/aranlucas/agents/internal/storage"
)

func TestProviderLimiterRejectsWindowOverflowAndResets(t *testing.T) {
	db, err := storage.Open(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.Migrate(t.Context()); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 7, 10, 12, 0, 20, 0, time.UTC)
	limiter := NewProviderLimiter(db, func() time.Time { return now })
	for range 2 {
		if err := limiter.Acquire(t.Context(), "groq", 2); err != nil {
			t.Fatal(err)
		}
	}
	if err := limiter.Acquire(t.Context(), "groq", 2); !errors.Is(err, ErrLimitReached) {
		t.Fatalf("Acquire() error = %v", err)
	}
	now = now.Add(time.Minute)
	if err := limiter.Acquire(t.Context(), "groq", 2); err != nil {
		t.Fatalf("new window Acquire() error = %v", err)
	}
}

func TestProviderLimiterRejectsInvalidOrUnavailableConfiguration(t *testing.T) {
	limiter := NewProviderLimiter(nil, time.Now)
	if err := limiter.Acquire(t.Context(), "groq", 1); err == nil {
		t.Fatal("missing database accepted")
	}
	if err := limiter.Acquire(t.Context(), "", 1); err == nil {
		t.Fatal("empty provider accepted")
	}
	if err := limiter.Acquire(t.Context(), "groq", 0); err == nil {
		t.Fatal("zero limit accepted")
	}
}
