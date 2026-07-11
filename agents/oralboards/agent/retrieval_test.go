package oralboards

import (
	"errors"
	"path/filepath"
	"testing"

	"agents/internal/agentruntime"
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
	tx := agentruntime.NewTransaction(StateDefaults())
	for range 2 {
		result, err := corpus.SearchDocs(t.Context(), tx, "pulp therapy", "")
		if err != nil || result.Count == 0 {
			t.Fatalf("search result=%#v err=%v", result, err)
		}
	}
	if _, err := corpus.SearchDocs(t.Context(), tx, "trauma", ""); !errors.Is(err, ErrSearchBudgetExhausted) {
		t.Fatalf("error = %v", err)
	}
}

func TestSearchDocsIncludesEveryCollectionInBroadCandidatePool(t *testing.T) {
	result, err := openTestCorpus(t).SearchDocs(t.Context(), agentruntime.NewTransaction(StateDefaults()), "caries", "")
	if err != nil {
		t.Fatal(err)
	}
	found := map[string]bool{}
	for _, item := range result.Results {
		found[item.Collection] = true
		if len(item.Passage) == 0 || len(item.Passage) > 600 {
			t.Fatalf("invalid passage length %d", len(item.Passage))
		}
	}
	for _, collection := range []string{"aapd", "abpd", "cody"} {
		if !found[collection] {
			t.Fatalf("missing %s in %#v", collection, found)
		}
	}
}

func TestCorpusIsImmutable(t *testing.T) {
	corpus := openTestCorpus(t)
	if _, err := corpus.db.ExecContext(t.Context(), "DELETE FROM documents"); err == nil {
		t.Fatal("read-only corpus accepted mutation")
	}
}
