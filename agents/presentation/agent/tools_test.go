package presentation

import (
	"encoding/json"
	"slices"
	"testing"
)

func TestReorderSlidesUsesOnlyExplicitIDs(t *testing.T) {
	state := newPresentationState(Slide{ID: "a"}, Slide{ID: "b"}, Slide{ID: "c"})
	result, err := reorderSlides(&state, ReorderArgs{SlideIDs: []string{"c", "a"}})
	if err != nil || !result.OK {
		t.Fatalf("ReorderSlides() = %#v, %v", result, err)
	}
	got := []string{}
	for _, slide := range state.Slides {
		got = append(got, slide.ID)
	}
	if !slices.Equal(got, []string{"c", "a"}) {
		t.Fatalf("slides = %#v", got)
	}
}

func TestUpdateSlidePreservesUntouchedFieldsAndMissingDoesNotMutate(t *testing.T) {
	state := newPresentationState(Slide{ID: "a", Type: "content", Heading: "Old", Body: "Keep", Notes: "Notes"})
	heading := "New"
	result, _ := updateSlide(&state, UpdateSlideArgs{SlideID: "a", Heading: &heading})
	if !result.OK {
		t.Fatalf("UpdateSlide() = %#v", result)
	}
	slide := state.Slides[0]
	if slide.Heading != "New" || slide.Body != "Keep" || slide.Notes != "Notes" || slide.Type != "content" {
		t.Fatalf("slide = %#v", slide)
	}
	snapshot := state
	result, _ = updateSlide(&state, UpdateSlideArgs{SlideID: "missing", Heading: &heading})
	if result.OK || result.Error.Code != "slide_not_found" {
		t.Fatalf("missing result = %#v", result)
	}
	if !equalJSON(snapshot, state) {
		t.Fatal("missing update mutated state")
	}
}

func TestCreateDeleteAndReadyWorkflow(t *testing.T) {
	state := Defaults()
	created, err := createSlide(&state, CreateSlideArgs{Heading: "Intro", SlideType: "title"})
	if err != nil || !created.OK || created.SlideID == "" {
		t.Fatalf("CreateSlide() = %#v, %v", created, err)
	}
	if len(state.Slides) != 1 || state.ActiveSlideIndex != 0 || state.Status != "drafting" {
		t.Fatalf("state = %#v", state)
	}
	deleted, _ := deleteSlide(&state, SlideIDArgs{SlideID: created.SlideID})
	if !deleted.OK || len(state.Slides) != 0 {
		t.Fatalf("DeleteSlide() = %#v", deleted)
	}
	ready, _ := markReady(&state, ReadyArgs{Summary: "Looks good"})
	if !ready.OK || state.Status != "ready" || state.ReviewSummary != "Looks good" {
		t.Fatalf("ready/state = %#v/%#v", ready, state)
	}
}

func TestInvalidSlideTypeDoesNotMutate(t *testing.T) {
	state := Defaults()
	before := state
	result, err := createSlide(&state, CreateSlideArgs{Heading: "Bad", SlideType: "chart"})
	if err != nil || result.OK || result.Error.Code != "invalid_slide_type" {
		t.Fatalf("CreateSlide() = %#v, %v", result, err)
	}
	if !equalJSON(before, state) {
		t.Fatal("invalid create mutated state")
	}
}

func newPresentationState(slides ...Slide) PresentationState {
	state := Defaults()
	state.Slides = slides
	return state
}

func equalJSON(left, right any) bool { return string(mustJSON(left)) == string(mustJSON(right)) }
func mustJSON(value any) []byte      { data, _ := json.Marshal(value); return data }
