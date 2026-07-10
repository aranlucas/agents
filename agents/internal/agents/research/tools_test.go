package research

import (
	"context"
	"testing"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
)

func TestUpdateSectionRebuildsOrderedReport(t *testing.T) {
	tx := newResearchTx(Section{ID: "one", Title: "First", Content: "old"}, Section{ID: "two", Title: "Second", Content: "keep"})
	result, err := UpdateSection(context.Background(), tx, UpdateSectionArgs{SectionID: "one", Content: "new"})
	if err != nil || !result.OK {
		t.Fatalf("UpdateSection()=%#v,%v", result, err)
	}
	if got := decodeState(tx).Report; got != "# First\n\nnew\n\n# Second\n\nkeep" {
		t.Fatalf("report=%q", got)
	}
}
func TestMissingSectionLeavesReportUnchanged(t *testing.T) {
	tx := newResearchTx(Section{ID: "one", Title: "First", Content: "old"})
	before := decodeState(tx).Report
	result, _ := UpdateSection(context.Background(), tx, UpdateSectionArgs{SectionID: "missing", Content: "new"})
	if result.OK || result.Error.Code != "section_not_found" {
		t.Fatalf("result=%#v", result)
	}
	if decodeState(tx).Report != before {
		t.Fatal("missing section changed report")
	}
}
func TestAddSourceRequiresHTTPS(t *testing.T) {
	tx := agentruntime.NewTransaction(StateDefaults())
	result, _ := AddSource(context.Background(), tx, AddSourceArgs{SourceTitle: "Bad", URL: "http://example.com"})
	if result.OK || result.Error.Code != "invalid_source_url" {
		t.Fatalf("result=%#v", result)
	}
	result, _ = AddSource(context.Background(), tx, AddSourceArgs{SourceTitle: "Standard", URL: "https://example.com/reference", Snippet: "Relevant"})
	if !result.OK || len(decodeState(tx).Sources) != 1 {
		t.Fatalf("result/state=%#v/%#v", result, decodeState(tx))
	}
}
func TestWriteAndReady(t *testing.T) {
	tx := agentruntime.NewTransaction(StateDefaults())
	written, _ := WriteReport(context.Background(), tx, WriteReportArgs{Report: "# Report\n\nBody"})
	ready, _ := MarkReady(context.Background(), tx, ReadyArgs{Summary: "Complete"})
	state := decodeState(tx)
	if !written.OK || written.Length != len("# Report\n\nBody") || !ready.OK || state.Status != "ready" || state.ReviewSummary != "Complete" {
		t.Fatalf("results/state=%#v/%#v/%#v", written, ready, state)
	}
}
func newResearchTx(sections ...Section) *agentruntime.Transaction {
	state := StateDefaults()
	state["sections"] = sections
	state["report"] = rebuildReport(sections)
	return agentruntime.NewTransaction(state)
}
