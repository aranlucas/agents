package presentation

import (
	"encoding/json"
	"slices"
	"testing"
)

func TestReorderSlidesRequiresEveryCurrentID(t *testing.T) {
	state := newPresentationState(Slide{ID: "a"}, Slide{ID: "b"}, Slide{ID: "c"})
	result, err := reorderSlides(&state, ReorderArgs{SlideIDs: []string{"c", "a", "b"}})
	if err != nil || !result.OK {
		t.Fatalf("ReorderSlides() = %#v, %v", result, err)
	}
	got := []string{}
	for _, slide := range state.Slides {
		got = append(got, slide.ID)
	}
	if !slices.Equal(got, []string{"c", "a", "b"}) {
		t.Fatalf("slides = %#v", got)
	}

	snapshot := state
	missing, _ := reorderSlides(&state, ReorderArgs{SlideIDs: []string{"c", "a"}})
	if missing.OK || missing.Error == nil || missing.Error.Code != "invalid_slide_order" || !equalJSON(snapshot, state) {
		t.Fatalf("missing reorder result/state = %#v/%#v", missing, state)
	}
	unknown, _ := reorderSlides(&state, ReorderArgs{SlideIDs: []string{"c", "a", "missing"}})
	if unknown.OK || unknown.Error == nil || unknown.Error.Code != "slide_not_found" || !equalJSON(snapshot, state) {
		t.Fatalf("unknown reorder result/state = %#v/%#v", unknown, state)
	}
}

func TestBuildPresentationCreatesOneOrderedReadyDeck(t *testing.T) {
	state, result, err := buildPresentation(BuildPresentationArgs{
		Title: "Demo",
		Theme: "minimal",
		Slides: []CreateSlideArgs{
			{Heading: "Intro", SlideType: "title", Notes: "Welcome"},
			{Heading: "Problem", SlideType: "bullets", Body: "- First\n- Second"},
			{Heading: "Close", SlideType: "content", Body: "Next steps"},
		},
		Summary: "Built three slides.",
	})
	if err != nil || !result.OK {
		t.Fatalf("buildPresentation() = %#v, %#v, %v", state, result, err)
	}
	if state.Title != "Demo" || state.Theme != "minimal" || state.Status != StatusReady || state.ActiveSlideIndex != 0 {
		t.Fatalf("state metadata = %#v", state)
	}
	if result.SlideCount != 3 || len(result.SlideIDs) != 3 || len(state.Slides) != 3 {
		t.Fatalf("slide result/state = %#v/%#v", result, state.Slides)
	}
	if state.Slides[0].Type != "title" || state.Slides[0].Heading != "Intro" || state.Slides[2].Heading != "Close" {
		t.Fatalf("slides = %#v", state.Slides)
	}
}

func TestBuildPresentationRejectsInvalidDeckBeforePublication(t *testing.T) {
	state, result, err := buildPresentation(BuildPresentationArgs{
		Title:   "Demo",
		Theme:   "light",
		Slides:  []CreateSlideArgs{{Heading: "Not a title", SlideType: "content"}},
		Summary: "Invalid",
	})
	if err != nil || result.OK || result.Error == nil || result.Error.Code != "title_slide_required" {
		t.Fatalf("buildPresentation() = %#v, %#v, %v", state, result, err)
	}
	if len(state.Slides) != 0 || state.Status != StatusIdle {
		t.Fatalf("invalid build state = %#v", state)
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

func TestRevisePresentationAppliesAllChangesAtomically(t *testing.T) {
	state := newPresentationState(
		Slide{ID: "a", Type: "title", Heading: "Old title", Body: "Keep"},
		Slide{ID: "b", Type: "content", Heading: "Old problem", Body: "Old body"},
		Slide{ID: "c", Type: "content", Heading: "Delete me"},
	)
	state.Title, state.Theme, state.Status = "Deck", "light", StatusReady
	title, body := "New title", "Detailed problem"
	result, err := revisePresentation(&state, RevisePresentationArgs{
		Updates: []UpdateSlideArgs{
			{SlideID: "a", Heading: &title},
			{SlideID: "b", Body: &body},
		},
		DeleteSlideIDs:     []string{"c"},
		SlideIDs:           []string{"b", "a"},
		MarkReady:          true,
		Summary:            "Updated both remaining slides.",
		ExpectedSlideCount: 2,
	})
	if err != nil || !result.OK {
		t.Fatalf("revisePresentation() = %#v, %v", result, err)
	}
	if result.UpdatedSlideCount != 2 || result.SlideCount != 2 || result.Status != StatusReady {
		t.Fatalf("result = %#v", result)
	}
	if !slices.Equal(result.UpdatedSlideIDs, []string{"a", "b"}) || !slices.Equal(result.DeletedSlideIDs, []string{"c"}) || !slices.Equal(result.SlideIDs, []string{"b", "a"}) {
		t.Fatalf("result IDs = %#v", result)
	}
	if state.Slides[0].ID != "b" || state.Slides[0].Body != body || state.Slides[1].ID != "a" || state.Slides[1].Heading != title {
		t.Fatalf("slides = %#v", state.Slides)
	}
	if state.ReviewSummary != "Updated both remaining slides." || state.Status != StatusReady {
		t.Fatalf("state = %#v", state)
	}
}

func TestRevisePresentationFailureLeavesStateUnchanged(t *testing.T) {
	state := newPresentationState(Slide{ID: "a", Type: "content", Heading: "Original", Body: "Keep"})
	state.Title = "Deck"
	snapshot := state
	heading := "Changed"
	result, err := revisePresentation(&state, RevisePresentationArgs{Updates: []UpdateSlideArgs{
		{SlideID: "a", Heading: &heading},
		{SlideID: "missing", Heading: &heading},
	}})
	if err != nil || result.OK || result.Error == nil || result.Error.Code != "slide_not_found" {
		t.Fatalf("revisePresentation() = %#v, %v", result, err)
	}
	if !equalJSON(snapshot, state) {
		t.Fatalf("failed atomic revision mutated state: %#v", state)
	}
}

func TestCreateDeleteAndReadyWorkflow(t *testing.T) {
	state := Defaults()
	_, _ = setMeta(&state, SetMetaArgs{Title: "Demo", Theme: "light"})
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
	notReady, _ := markReady(&state, ReadyArgs{Summary: "Looks good", ExpectedSlideCount: 1})
	if notReady.OK || notReady.Error == nil || notReady.Error.Code != "slide_count_mismatch" || state.Status == StatusReady {
		t.Fatalf("empty deck ready/state = %#v/%#v", notReady, state)
	}
	_, _ = createSlide(&state, CreateSlideArgs{Heading: "Intro", SlideType: "title"})
	ready, _ := markReady(&state, ReadyArgs{Summary: "Looks good", ExpectedSlideCount: 1})
	if !ready.OK || state.Status != "ready" || state.ReviewSummary != "Looks good" {
		t.Fatalf("ready/state = %#v/%#v", ready, state)
	}
}

func TestReadyRejectsMissingTitleAndEmptySlides(t *testing.T) {
	state := Defaults()
	state.Slides = []Slide{{ID: "empty", Type: "content"}}
	missingTitle, _ := markReady(&state, ReadyArgs{ExpectedSlideCount: 1})
	if missingTitle.OK || missingTitle.Error == nil || missingTitle.Error.Code != "presentation_title_required" {
		t.Fatalf("missing title result = %#v", missingTitle)
	}
	state.Title = "Deck"
	emptySlide, _ := markReady(&state, ReadyArgs{ExpectedSlideCount: 1})
	if emptySlide.OK || emptySlide.Error == nil || emptySlide.Error.Code != "empty_slide" || state.Status == StatusReady {
		t.Fatalf("empty slide result/state = %#v/%#v", emptySlide, state)
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
