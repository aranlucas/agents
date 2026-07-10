package presentation

import (
	"context"
	"encoding/json"
	"slices"
	"testing"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
)

func TestReorderSlidesUsesOnlyExplicitIDs(t *testing.T) {
	tx := newPresentationTx(Slide{ID: "a"}, Slide{ID: "b"}, Slide{ID: "c"})
	result, err := ReorderSlides(context.Background(), tx, ReorderArgs{SlideIDs: []string{"c", "a"}})
	if err != nil || !result.OK {
		t.Fatalf("ReorderSlides() = %#v, %v", result, err)
	}
	state := decodeState(tx)
	got := []string{}
	for _, slide := range state.Slides {
		got = append(got, slide.ID)
	}
	if !slices.Equal(got, []string{"c", "a"}) {
		t.Fatalf("slides = %#v", got)
	}
}

func TestUpdateSlidePreservesUntouchedFieldsAndMissingDoesNotMutate(t *testing.T) {
	tx := newPresentationTx(Slide{ID: "a", Type: "content", Heading: "Old", Body: "Keep", Notes: "Notes"})
	heading := "New"
	result, _ := UpdateSlide(context.Background(), tx, UpdateSlideArgs{SlideID: "a", Heading: &heading})
	if !result.OK {
		t.Fatalf("UpdateSlide() = %#v", result)
	}
	slide := decodeState(tx).Slides[0]
	if slide.Heading != "New" || slide.Body != "Keep" || slide.Notes != "Notes" || slide.Type != "content" {
		t.Fatalf("slide = %#v", slide)
	}
	snapshot := tx.Snapshot()
	result, _ = UpdateSlide(context.Background(), tx, UpdateSlideArgs{SlideID: "missing", Heading: &heading})
	if result.OK || result.Error.Code != "slide_not_found" {
		t.Fatalf("missing result = %#v", result)
	}
	if !equalJSON(snapshot, tx.Snapshot()) {
		t.Fatal("missing update mutated state")
	}
}

func TestCreateDeleteAndReadyWorkflow(t *testing.T) {
	tx := agentruntime.NewTransaction(StateDefaults())
	created, err := CreateSlide(context.Background(), tx, CreateSlideArgs{Heading: "Intro", SlideType: "title"})
	if err != nil || !created.OK || created.SlideID == "" {
		t.Fatalf("CreateSlide() = %#v, %v", created, err)
	}
	state := decodeState(tx)
	if len(state.Slides) != 1 || state.ActiveSlideIndex != 0 || state.Status != "drafting" {
		t.Fatalf("state = %#v", state)
	}
	deleted, _ := DeleteSlide(context.Background(), tx, SlideIDArgs{SlideID: created.SlideID})
	if !deleted.OK || len(decodeState(tx).Slides) != 0 {
		t.Fatalf("DeleteSlide() = %#v", deleted)
	}
	ready, _ := MarkReady(context.Background(), tx, ReadyArgs{Summary: "Looks good"})
	state = decodeState(tx)
	if !ready.OK || state.Status != "ready" || state.ReviewSummary != "Looks good" {
		t.Fatalf("ready/state = %#v/%#v", ready, state)
	}
}

func TestInvalidSlideTypeDoesNotMutate(t *testing.T) {
	tx := agentruntime.NewTransaction(StateDefaults())
	before := tx.Snapshot()
	result, err := CreateSlide(context.Background(), tx, CreateSlideArgs{Heading: "Bad", SlideType: "chart"})
	if err != nil || result.OK || result.Error.Code != "invalid_slide_type" {
		t.Fatalf("CreateSlide() = %#v, %v", result, err)
	}
	if !equalJSON(before, tx.Snapshot()) {
		t.Fatal("invalid create mutated state")
	}
}

func newPresentationTx(slides ...Slide) *agentruntime.Transaction {
	values := StateDefaults()
	values["slides"] = slides
	return agentruntime.NewTransaction(values)
}

func equalJSON(left, right any) bool { return string(mustJSON(left)) == string(mustJSON(right)) }
func mustJSON(value any) []byte      { data, _ := json.Marshal(value); return data }
