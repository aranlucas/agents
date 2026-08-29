package oralboards

import (
	"cmp"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"path/filepath"
	"regexp"
	"slices"
	"strings"

	_ "modernc.org/sqlite"
)

const maxSearchCalls = 2

var (
	ErrSearchBudgetExhausted = errors.New("oralboards search budget exhausted")
	ErrInvalidCollection     = errors.New("invalid oralboards collection")
	validCollections         = map[string]bool{"": true, "aapd": true, "abpd": true, "cody": true}
	queryNoise               = regexp.MustCompile(`["*'():^]`)
)

type SearchResult struct {
	CorpusDocumentRef
	Snippet string  `json:"snippet"`
	Score   float64 `json:"score"`
	Passage string  `json:"passage"`
}

type SearchResponse struct {
	Status  string         `json:"status"`
	Results []SearchResult `json:"results"`
	Count   int            `json:"count"`
}

type Document struct {
	CorpusDocumentRef
	Body string `json:"body"`
}

type Corpus struct{ db *sql.DB }

func OpenCorpus(path string) (*Corpus, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("resolve corpus: %w", err)
	}
	values := url.Values{"mode": {"ro"}, "immutable": {"1"}, "_pragma": {"query_only(1)"}}
	db, err := sql.Open("sqlite", "file:"+absolute+"?"+values.Encode())
	if err != nil {
		return nil, errors.New("open oralboards corpus")
	}
	db.SetMaxOpenConns(4)
	db.SetMaxIdleConns(1)
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, errors.New("oralboards corpus unavailable")
	}
	return &Corpus{db: db}, nil
}

func (c *Corpus) Close() error {
	if c == nil || c.db == nil {
		return nil
	}
	return c.db.Close()
}

func (c *Corpus) SearchDocs(ctx context.Context, state *State, query, collection string) (SearchResponse, error) {
	if c == nil || c.db == nil || state == nil {
		return SearchResponse{}, errors.New("corpus and state are required")
	}
	if state.SearchCalls >= maxSearchCalls {
		return SearchResponse{}, ErrSearchBudgetExhausted
	}
	collection = strings.ToLower(strings.TrimSpace(collection))
	if !validCollections[collection] {
		return SearchResponse{}, ErrInvalidCollection
	}
	clean := cleanQuery(query)
	if clean == "" {
		return SearchResponse{}, errors.New("search query is empty")
	}
	clause := ""
	args := []any{clean}
	if collection != "" {
		clause = " AND d.collection = ?"
		args = append(args, collection)
	}
	args = append(args, 8, 2, 10)
	rows, err := c.db.QueryContext(ctx, `
WITH matches AS (
 SELECT d.id, f.filepath, d.title, d.collection,
	  snippet(documents_fts, 2, '«', '»', ' … ', 24) AS snippet, c.doc AS doc, -bm25(documents_fts) AS score
 FROM documents_fts f JOIN documents d ON d.collection || '/' || d.path = f.filepath
 JOIN content c ON c.hash = d.hash
 WHERE documents_fts MATCH ? AND d.active = 1`+clause+`
), ranked AS (
 SELECT *, row_number() OVER (ORDER BY score DESC) overall_rank,
 row_number() OVER (PARTITION BY collection ORDER BY score DESC) collection_rank FROM matches
)
SELECT id, filepath, title, collection, snippet, doc, score FROM ranked
WHERE overall_rank <= ? OR collection_rank <= ? ORDER BY score DESC LIMIT ?`, args...)
	if err != nil {
		return SearchResponse{}, fmt.Errorf("oralboards corpus search failed: %w", err)
	}
	defer func() { _ = rows.Close() }()
	results := make([]SearchResult, 0, 10)
	for rows.Next() {
		var item SearchResult
		var body string
		if err := rows.Scan(&item.DocID, &item.Filepath, &item.Title, &item.Collection, &item.Snippet, &body, &item.Score); err != nil {
			return SearchResponse{}, errors.New("oralboards corpus row invalid")
		}
		item.Passage = anchorPassage(body, item.Snippet, clean, 600)
		results = append(results, item)
	}
	if err := rows.Err(); err != nil {
		return SearchResponse{}, errors.New("oralboards corpus search failed")
	}
	state.SearchCalls++
	return SearchResponse{Status: "success", Results: results, Count: len(results)}, nil
}

func (c *Corpus) ReadDoc(ctx context.Context, filepathValue string) (Document, error) {
	filepathValue = strings.TrimSpace(filepathValue)
	if filepathValue == "" || strings.Contains(filepathValue, "..") {
		return Document{}, errors.New("invalid document path")
	}
	var result Document
	err := c.db.QueryRowContext(ctx, `SELECT d.id, d.collection || '/' || d.path, d.title, d.collection, c.doc
FROM documents d JOIN content c ON c.hash=d.hash WHERE d.active=1 AND d.collection || '/' || d.path=?`, filepathValue).
		Scan(&result.DocID, &result.Filepath, &result.Title, &result.Collection, &result.Body)
	if errors.Is(err, sql.ErrNoRows) {
		return Document{}, errors.New("document not found")
	}
	if err != nil {
		return Document{}, errors.New("read oralboards document")
	}
	if len(result.Body) > 200_000 {
		result.Body = result.Body[:200_000]
	}
	return result, nil
}

func cleanQuery(value string) string {
	value = queryNoise.ReplaceAllString(value, " ")
	return strings.Join(strings.Fields(value), " ")
}

func anchorPassage(body, snippet, query string, maxChars int) string {
	fragments := strings.Split(strings.ReplaceAll(strings.ReplaceAll(snippet, "«", ""), "»", ""), " … ")
	slices.SortStableFunc(fragments, func(a, b string) int { return cmp.Compare(len(b), len(a)) })
	for _, fragment := range fragments {
		fragment = strings.TrimSpace(fragment)
		if len(fragment) < 8 {
			continue
		}
		if position := strings.Index(body, fragment); position >= 0 {
			return boundedPassage(body, position+len(fragment)/2, maxChars)
		}
	}
	lower := strings.ToLower(body)
	for word := range strings.FieldsSeq(query) {
		if len(word) > 4 {
			if position := strings.Index(lower, strings.ToLower(word)); position >= 0 {
				return boundedPassage(body, position, maxChars)
			}
		}
	}
	if len(body) > maxChars {
		return body[:maxChars]
	}
	return body
}

func boundedPassage(body string, center, maxChars int) string {
	start := max(0, center-maxChars/2)
	end := min(len(body), start+maxChars)
	return body[start:end]
}
