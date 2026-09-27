package oralboards

import (
	"errors"
	"path/filepath"
	"testing"
)

func openTestCorpus(t *testing.T) *Corpus {
	t.Helper()
	corpus, err := OpenCorpus(filepath.Join("..", "..", "assets", "oralboards", "search.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = corpus.Close() })
	return corpus
}

func TestSearchDocsEnforcesTwoCallBudget(t *testing.T) {
	corpus := openTestCorpus(t)
	state := Defaults()
	for range 2 {
		result, err := corpus.SearchDocs(t.Context(), &state, "pulp therapy", "")
		if err != nil || result.Count == 0 {
			t.Fatalf("search result=%#v err=%v", result, err)
		}
	}
	if _, err := corpus.SearchDocs(t.Context(), &state, "trauma", ""); !errors.Is(err, ErrSearchBudgetExhausted) {
		t.Fatalf("error = %v", err)
	}
}

func TestSearchDocsSupportsEveryCollection(t *testing.T) {
	corpus := openTestCorpus(t)
	for _, collection := range []string{"aapd", "abpd", "cody"} {
		state := Defaults()
		result, err := corpus.SearchDocs(t.Context(), &state, "caries", collection)
		if err != nil {
			t.Fatalf("search %s: %v", collection, err)
		}
		if result.Count == 0 {
			t.Fatalf("search %s returned no results", collection)
		}
		for _, item := range result.Results {
			if item.Collection != collection {
				t.Fatalf("search %s returned collection %s", collection, item.Collection)
			}
			if len(item.Passage) == 0 || len(item.Passage) > 600 {
				t.Fatalf("invalid passage length %d", len(item.Passage))
			}
		}
	}
}

func TestCorpusExcludes2018PrepCourse(t *testing.T) {
	corpus := openTestCorpus(t)
	var count int
	if err := corpus.db.QueryRowContext(
		t.Context(),
		`SELECT COUNT(*) FROM documents WHERE collection = 'cody' AND path LIKE 'oral-boards-prep-course-2018/%'`,
	).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("2018 prep-course documents = %d, want 0", count)
	}
}

func TestCorpusIsImmutable(t *testing.T) {
	corpus := openTestCorpus(t)
	if _, err := corpus.db.ExecContext(t.Context(), "DELETE FROM documents"); err == nil {
		t.Fatal("read-only corpus accepted mutation")
	}
}
