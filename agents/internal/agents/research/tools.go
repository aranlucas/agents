package research

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/url"
	"strings"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
)

type Result struct {
	OK        bool                          `json:"ok"`
	Title     string                        `json:"title,omitempty"`
	SectionID string                        `json:"section_id,omitempty"`
	SourceID  string                        `json:"source_id,omitempty"`
	Length    int                           `json:"length,omitempty"`
	Error     *agentruntime.StructuredError `json:"error,omitempty"`
}
type SetQueryArgs struct {
	Title string `json:"title"`
	Query string `json:"query"`
}
type CreateSectionArgs struct {
	SectionTitle string `json:"section_title"`
	Content      string `json:"content"`
}
type UpdateSectionArgs struct {
	SectionID string `json:"section_id"`
	Content   string `json:"content"`
}
type AddSourceArgs struct {
	SourceTitle string `json:"source_title"`
	URL         string `json:"url"`
	Snippet     string `json:"snippet"`
}
type WriteReportArgs struct {
	Report string `json:"report"`
}
type ReadyArgs struct {
	Summary string `json:"summary"`
}

func SetQuery(_ context.Context, tx *agentruntime.Transaction, input SetQueryArgs) (Result, error) {
	title, query := strings.TrimSpace(input.Title), strings.TrimSpace(input.Query)
	if title == "" || len(title) > 300 {
		return fail("invalid_title", "title is required and must be at most 300 characters"), nil
	}
	if query == "" || len(query) > 2000 {
		return fail("invalid_query", "query is required and must be at most 2000 characters"), nil
	}
	state := decodeState(tx)
	state.Title, state.Query, state.Status = title, query, "drafting"
	writeState(tx, state)
	return Result{OK: true, Title: title}, nil
}
func CreateSection(_ context.Context, tx *agentruntime.Transaction, input CreateSectionArgs) (Result, error) {
	state := decodeState(tx)
	if len(state.Sections) >= 200 {
		return fail("section_limit_reached", "report cannot exceed 200 sections"), nil
	}
	title := strings.TrimSpace(input.SectionTitle)
	if title == "" || len(title) > 300 {
		return fail("invalid_section_title", "section title is required and must be at most 300 characters"), nil
	}
	if len(input.Content) > 100_000 {
		return fail("section_too_large", "section content exceeds the allowed size"), nil
	}
	id, err := newID("sec_")
	if err != nil {
		return Result{}, err
	}
	state.Sections = append(state.Sections, Section{ID: id, Title: title, Content: input.Content})
	state.Report = rebuildReport(state.Sections)
	state.Status = "drafting"
	writeState(tx, state)
	return Result{OK: true, SectionID: id}, nil
}
func UpdateSection(_ context.Context, tx *agentruntime.Transaction, input UpdateSectionArgs) (Result, error) {
	if len(input.Content) > 100_000 {
		return fail("section_too_large", "section content exceeds the allowed size"), nil
	}
	state := decodeState(tx)
	index := -1
	for i, section := range state.Sections {
		if section.ID == input.SectionID {
			index = i
			break
		}
	}
	if index < 0 {
		return fail("section_not_found", "section was not found"), nil
	}
	state.Sections[index].Content = input.Content
	state.Report = rebuildReport(state.Sections)
	state.Status = "drafting"
	writeState(tx, state)
	return Result{OK: true, SectionID: input.SectionID}, nil
}
func AddSource(_ context.Context, tx *agentruntime.Transaction, input AddSourceArgs) (Result, error) {
	state := decodeState(tx)
	if len(state.Sources) >= 500 {
		return fail("source_limit_reached", "report cannot exceed 500 sources"), nil
	}
	title := strings.TrimSpace(input.SourceTitle)
	if title == "" || len(title) > 500 {
		return fail("invalid_source_title", "source title is required and must be at most 500 characters"), nil
	}
	if !validSourceURL(input.URL) {
		return fail("invalid_source_url", "source URL must be a public HTTPS URL"), nil
	}
	if len(input.Snippet) > 5000 {
		return fail("snippet_too_large", "source snippet exceeds the allowed size"), nil
	}
	id, err := newID("src_")
	if err != nil {
		return Result{}, err
	}
	state.Sources = append(state.Sources, Source{ID: id, Title: title, URL: input.URL, Snippet: input.Snippet})
	writeState(tx, state)
	return Result{OK: true, SourceID: id}, nil
}
func WriteReport(_ context.Context, tx *agentruntime.Transaction, input WriteReportArgs) (Result, error) {
	if len(input.Report) > 1<<20 {
		return fail("report_too_large", "report exceeds the 1 MiB state limit"), nil
	}
	state := decodeState(tx)
	state.Report = input.Report
	state.Status = "drafting"
	writeState(tx, state)
	return Result{OK: true, Length: len(input.Report)}, nil
}
func MarkReady(_ context.Context, tx *agentruntime.Transaction, input ReadyArgs) (Result, error) {
	if len(input.Summary) > 5000 {
		return fail("summary_too_large", "review summary exceeds the allowed size"), nil
	}
	state := decodeState(tx)
	state.Status, state.ReviewSummary = "ready", input.Summary
	writeState(tx, state)
	return Result{OK: true}, nil
}

func rebuildReport(sections []Section) string {
	parts := make([]string, 0, len(sections))
	for _, section := range sections {
		parts = append(parts, "# "+section.Title+"\n\n"+section.Content)
	}
	return strings.Join(parts, "\n\n")
}
func validSourceURL(raw string) bool {
	parsed, err := url.Parse(raw)
	return err == nil && parsed.Scheme == "https" && parsed.Host != "" && parsed.User == nil
}
func fail(code, message string) Result {
	return Result{Error: &agentruntime.StructuredError{Code: code, Message: message}}
}
func newID(prefix string) (string, error) {
	var data [4]byte
	if _, err := rand.Read(data[:]); err != nil {
		return "", errors.New("generate research ID")
	}
	return prefix + hex.EncodeToString(data[:]), nil
}
