package telegram

import (
	"strings"
	"testing"
)

func TestChunkMarkdownV2EscapesAndNeverExceedsTelegramLimit(t *testing.T) {
	chunks := ChunkMarkdownV2("value_(x) "+strings.Repeat("a", 5000), 4096)
	if len(chunks) < 2 {
		t.Fatal("expected split")
	}
	for _, chunk := range chunks {
		if len([]rune(chunk)) > 4096 {
			t.Fatalf("chunk too long: %d", len([]rune(chunk)))
		}
		if strings.Contains(chunk, "_") && !strings.Contains(chunk, `\_`) {
			t.Fatalf("unescaped markdown: %q", chunk)
		}
		if strings.HasSuffix(chunk, `\`) {
			t.Fatalf("chunk split after escape: %q", chunk[len(chunk)-10:])
		}
	}
}
