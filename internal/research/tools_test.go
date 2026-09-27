package research

import "testing"

func TestUpdateSectionRebuildsOrderedReport(t *testing.T) {
	state := newResearchState(Section{ID: "one", Title: "First", Content: "old"}, Section{ID: "two", Title: "Second", Content: "keep"})
	result, err := updateSection(&state, UpdateSectionArgs{SectionID: "one", Content: "new"})
	if err != nil || !result.OK {
		t.Fatalf("UpdateSection()=%#v,%v", result, err)
	}
	if got := state.Report; got != "# First\n\nnew\n\n# Second\n\nkeep" {
		t.Fatalf("report=%q", got)
	}
}

func TestMissingSectionLeavesReportUnchanged(t *testing.T) {
	state := newResearchState(Section{ID: "one", Title: "First", Content: "old"})
	before := state.Report
	result, _ := updateSection(&state, UpdateSectionArgs{SectionID: "missing", Content: "new"})
	if result.OK || result.Error.Code != "section_not_found" {
		t.Fatalf("result=%#v", result)
	}
	if state.Report != before {
		t.Fatal("missing section changed report")
	}
}

func TestAddSourceRequiresHTTPS(t *testing.T) {
	state := Defaults()
	result, _ := addSource(&state, AddSourceArgs{SourceTitle: "Bad", URL: "http://example.com"})
	if result.OK || result.Error.Code != "invalid_source_url" {
		t.Fatalf("result=%#v", result)
	}
	result, _ = addSource(&state, AddSourceArgs{SourceTitle: "Standard", URL: "https://example.com/reference", Snippet: "Relevant"})
	if !result.OK || len(state.Sources) != 1 {
		t.Fatalf("result/state=%#v/%#v", result, state)
	}
}

func TestWriteAndReady(t *testing.T) {
	state := Defaults()
	_, _ = setQuery(&state, SetQueryArgs{Title: "Report", Query: "What changed?"})
	_, _ = createSection(&state, CreateSectionArgs{SectionTitle: "Findings", Content: "Grounded body"})
	_, _ = addSource(&state, AddSourceArgs{SourceTitle: "Standard", URL: "https://example.com/reference"})
	written, _ := writeReport(&state, WriteReportArgs{Report: "# Report\n\nBody"})
	ready, _ := markReady(&state, ReadyArgs{Summary: "Complete"})
	if !written.OK || written.Length != len("# Report\n\nBody") || !ready.OK || state.Status != "ready" || state.ReviewSummary != "Complete" {
		t.Fatalf("results/state=%#v/%#v/%#v", written, ready, state)
	}
}

func TestReadyRequiresMeaningfulReportSectionsAndSources(t *testing.T) {
	state := Defaults()
	_, _ = setQuery(&state, SetQueryArgs{Title: "Report", Query: "What changed?"})

	missingReport, _ := markReady(&state, ReadyArgs{})
	if missingReport.OK || missingReport.Error == nil || missingReport.Error.Code != "report_required" {
		t.Fatalf("missing report result = %#v", missingReport)
	}
	_, _ = writeReport(&state, WriteReportArgs{Report: "# Findings\n\nGrounded body"})
	missingSections, _ := markReady(&state, ReadyArgs{})
	if missingSections.OK || missingSections.Error == nil || missingSections.Error.Code != "sections_required" {
		t.Fatalf("missing sections result = %#v", missingSections)
	}
	state.Sections = []Section{{ID: "empty", Title: "Findings"}}
	incompleteSection, _ := markReady(&state, ReadyArgs{})
	if incompleteSection.OK || incompleteSection.Error == nil || incompleteSection.Error.Code != "incomplete_section" {
		t.Fatalf("incomplete section result = %#v", incompleteSection)
	}
	state.Sections[0].Content = "Grounded body"
	missingSources, _ := markReady(&state, ReadyArgs{})
	if missingSources.OK || missingSources.Error == nil || missingSources.Error.Code != "sources_required" || state.Status == StatusReady {
		t.Fatalf("missing sources result/state = %#v/%#v", missingSources, state)
	}
}

func newResearchState(sections ...Section) ResearchState {
	state := Defaults()
	state.Sections = sections
	state.Report = rebuildReport(sections)
	return state
}
