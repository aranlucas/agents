package research

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"strings"

	"agents/internal/agentruntime"
	"google.golang.org/adk/v2/agent"
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

func SetQuery(ctx agent.Context, input SetQueryArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := setQuery(&state, input)
	if err == nil && result.OK {
		if err := ctx.State().Set("title", state.Title); err != nil {
			return Result{}, fmt.Errorf("set title: %w", err)
		}
		if err := ctx.State().Set("query", state.Query); err != nil {
			return Result{}, fmt.Errorf("set query: %w", err)
		}
		if err := ctx.State().Set("status", state.Status); err != nil {
			return Result{}, fmt.Errorf("set status: %w", err)
		}
	}
	return result, err
}

func setQuery(state *ResearchState, input SetQueryArgs) (Result, error) {
	title, query := strings.TrimSpace(input.Title), strings.TrimSpace(input.Query)
	if title == "" || len(title) > 300 {
		return fail("invalid_title", "title is required and must be at most 300 characters"), nil
	}
	if query == "" || len(query) > 2000 {
		return fail("invalid_query", "query is required and must be at most 2000 characters"), nil
	}
	state.Title, state.Query, state.Status = title, query, StatusDrafting
	return Result{OK: true, Title: title}, nil
}

func CreateSection(ctx agent.Context, input CreateSectionArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := createSection(&state, input)
	if err == nil && result.OK {
		if err := ctx.State().Set("sections", state.Sections); err != nil {
			return Result{}, fmt.Errorf("set sections: %w", err)
		}
		if err := ctx.State().Set("report", state.Report); err != nil {
			return Result{}, fmt.Errorf("set report: %w", err)
		}
		if err := ctx.State().Set("status", state.Status); err != nil {
			return Result{}, fmt.Errorf("set status: %w", err)
		}
	}
	return result, err
}

func createSection(state *ResearchState, input CreateSectionArgs) (Result, error) {
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
	state.Status = StatusDrafting
	return Result{OK: true, SectionID: id}, nil
}

func UpdateSection(ctx agent.Context, input UpdateSectionArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := updateSection(&state, input)
	if err == nil && result.OK {
		if err := ctx.State().Set("sections", state.Sections); err != nil {
			return Result{}, fmt.Errorf("set sections: %w", err)
		}
		if err := ctx.State().Set("report", state.Report); err != nil {
			return Result{}, fmt.Errorf("set report: %w", err)
		}
		if err := ctx.State().Set("status", state.Status); err != nil {
			return Result{}, fmt.Errorf("set status: %w", err)
		}
	}
	return result, err
}

func updateSection(state *ResearchState, input UpdateSectionArgs) (Result, error) {
	if len(input.Content) > 100_000 {
		return fail("section_too_large", "section content exceeds the allowed size"), nil
	}
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
	state.Status = StatusDrafting
	return Result{OK: true, SectionID: input.SectionID}, nil
}

func AddSource(ctx agent.Context, input AddSourceArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := addSource(&state, input)
	if err == nil && result.OK {
		if err := ctx.State().Set("sources", state.Sources); err != nil {
			return Result{}, fmt.Errorf("set sources: %w", err)
		}
	}
	return result, err
}

func addSource(state *ResearchState, input AddSourceArgs) (Result, error) {
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
	return Result{OK: true, SourceID: id}, nil
}

func WriteReport(ctx agent.Context, input WriteReportArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := writeReport(&state, input)
	if err == nil && result.OK {
		if err := ctx.State().Set("report", state.Report); err != nil {
			return Result{}, fmt.Errorf("set report: %w", err)
		}
		if err := ctx.State().Set("status", state.Status); err != nil {
			return Result{}, fmt.Errorf("set status: %w", err)
		}
	}
	return result, err
}

func writeReport(state *ResearchState, input WriteReportArgs) (Result, error) {
	if len(input.Report) > 1<<20 {
		return fail("report_too_large", "report exceeds the 1 MiB state limit"), nil
	}
	state.Report = input.Report
	state.Status = StatusDrafting
	return Result{OK: true, Length: len(input.Report)}, nil
}

func MarkReady(ctx agent.Context, input ReadyArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := markReady(&state, input)
	if err == nil && result.OK {
		if err := ctx.State().Set("status", state.Status); err != nil {
			return Result{}, fmt.Errorf("set status: %w", err)
		}
		if err := ctx.State().Set("review_summary", state.ReviewSummary); err != nil {
			return Result{}, fmt.Errorf("set review_summary: %w", err)
		}
	}
	return result, err
}

func markReady(state *ResearchState, input ReadyArgs) (Result, error) {
	if len(input.Summary) > 5000 {
		return fail("summary_too_large", "review summary exceeds the allowed size"), nil
	}
	if strings.TrimSpace(state.Title) == "" || strings.TrimSpace(state.Query) == "" {
		return fail("research_query_required", "a title and research query are required before marking ready"), nil
	}
	if strings.TrimSpace(state.Report) == "" {
		return fail("report_required", "a report is required before marking ready"), nil
	}
	if len(state.Sections) == 0 {
		return fail("sections_required", "at least one report section is required before marking ready"), nil
	}
	for _, section := range state.Sections {
		if strings.TrimSpace(section.Title) == "" || strings.TrimSpace(section.Content) == "" {
			return fail("incomplete_section", "every report section must contain a title and content before marking ready"), nil
		}
	}
	if len(state.Sources) == 0 {
		return fail("sources_required", "at least one citation source is required before marking ready"), nil
	}
	state.Status, state.ReviewSummary = StatusReady, input.Summary
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
