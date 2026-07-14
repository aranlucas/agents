package presentation

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"agents/internal/agentruntime"
	"google.golang.org/adk/v2/agent"
)

const maxSlides = 100

type Result struct {
	OK         bool                          `json:"ok"`
	SlideID    string                        `json:"slide_id,omitempty"`
	SlideIDs   []string                      `json:"slide_ids,omitempty"`
	SlideCount int                           `json:"slide_count,omitempty"`
	Error      *agentruntime.StructuredError `json:"error,omitempty"`
}

type SetMetaArgs struct {
	Title string `json:"title"`
	Theme string `json:"theme"`
}
type CreateSlideArgs struct {
	Heading   string `json:"heading"`
	Body      string `json:"body"`
	SlideType string `json:"slide_type"`
	Notes     string `json:"notes"`
}
type BuildPresentationArgs struct {
	Title   string            `json:"title"`
	Theme   string            `json:"theme"`
	Slides  []CreateSlideArgs `json:"slides"`
	Summary string            `json:"summary"`
}
type UpdateSlideArgs struct {
	SlideID   string  `json:"slide_id"`
	Heading   *string `json:"heading,omitempty"`
	Body      *string `json:"body,omitempty"`
	Notes     *string `json:"notes,omitempty"`
	SlideType *string `json:"slide_type,omitempty"`
}
type SlideIDArgs struct {
	SlideID string `json:"slide_id"`
}
type ReorderArgs struct {
	SlideIDs []string `json:"slide_ids"`
}
type ReadyArgs struct {
	Summary            string `json:"summary"`
	ExpectedSlideCount int    `json:"expected_slide_count"`
}

func SetMeta(ctx agent.Context, input SetMetaArgs) (Result, error) {
	state := readState(ctx.State())
	r, e := setMeta(&state, input)
	if e == nil && r.OK {
		if err := ctx.State().Set("title", state.Title); err != nil {
			return Result{}, fmt.Errorf("set title: %w", err)
		}
		if err := ctx.State().Set("theme", state.Theme); err != nil {
			return Result{}, fmt.Errorf("set theme: %w", err)
		}
		if err := ctx.State().Set("status", state.Status); err != nil {
			return Result{}, fmt.Errorf("set status: %w", err)
		}
	}
	return r, e
}

func setMeta(state *PresentationState, input SetMetaArgs) (Result, error) {
	title, theme := strings.TrimSpace(input.Title), strings.TrimSpace(input.Theme)
	if title == "" || len(title) > 200 {
		return failure("invalid_title", "title is required and must be at most 200 characters"), nil
	}
	if theme != "light" && theme != "dark" && theme != "minimal" {
		return failure("invalid_theme", "theme must be light, dark, or minimal"), nil
	}
	state.Title, state.Theme, state.Status = title, theme, StatusDrafting
	return Result{OK: true}, nil
}

func BuildPresentation(ctx agent.Context, input BuildPresentationArgs) (Result, error) {
	current := readState(ctx.State())
	state, result, err := buildPresentation(current.UserID, input)
	if err != nil || !result.OK {
		return result, err
	}
	if err := ctx.State().Set("title", state.Title); err != nil {
		return Result{}, fmt.Errorf("set title: %w", err)
	}
	if err := ctx.State().Set("theme", state.Theme); err != nil {
		return Result{}, fmt.Errorf("set theme: %w", err)
	}
	if err := ctx.State().Set("slides", state.Slides); err != nil {
		return Result{}, fmt.Errorf("set slides: %w", err)
	}
	if err := ctx.State().Set("active_slide_index", state.ActiveSlideIndex); err != nil {
		return Result{}, fmt.Errorf("set active_slide_index: %w", err)
	}
	if err := ctx.State().Set("status", state.Status); err != nil {
		return Result{}, fmt.Errorf("set status: %w", err)
	}
	if err := ctx.State().Set("review_summary", state.ReviewSummary); err != nil {
		return Result{}, fmt.Errorf("set review_summary: %w", err)
	}
	return result, nil
}

func buildPresentation(userID string, input BuildPresentationArgs) (PresentationState, Result, error) {
	state := Defaults()
	state.UserID = userID
	if len(input.Slides) == 0 || len(input.Slides) > maxSlides {
		return state, failure("invalid_slide_count", "presentation must contain between 1 and 100 slides"), nil
	}
	if input.Slides[0].SlideType != "title" {
		return state, failure("title_slide_required", "the first slide must have slide_type title"), nil
	}
	if result, err := setMeta(&state, SetMetaArgs{Title: input.Title, Theme: input.Theme}); err != nil || !result.OK {
		return state, result, err
	}
	slideIDs := make([]string, 0, len(input.Slides))
	for _, slide := range input.Slides {
		result, err := createSlide(&state, slide)
		if err != nil || !result.OK {
			return state, result, err
		}
		slideIDs = append(slideIDs, result.SlideID)
	}
	state.ActiveSlideIndex = 0
	ready, err := markReady(&state, ReadyArgs{Summary: input.Summary, ExpectedSlideCount: len(input.Slides)})
	if err != nil || !ready.OK {
		return state, ready, err
	}
	return state, Result{OK: true, SlideIDs: slideIDs, SlideCount: len(state.Slides)}, nil
}

func createSlide(state *PresentationState, input CreateSlideArgs) (Result, error) {
	if len(state.Slides) >= maxSlides {
		return failure("slide_limit_reached", "presentation cannot exceed 100 slides"), nil
	}
	heading := strings.TrimSpace(input.Heading)
	if heading == "" || len(heading) > 200 {
		return failure("invalid_heading", "heading is required and must be at most 200 characters"), nil
	}
	if !validSlideType(input.SlideType) {
		return failure("invalid_slide_type", "slide_type must be title, content, bullets, or two-column"), nil
	}
	if len(input.Body) > 20_000 || len(input.Notes) > 10_000 {
		return failure("slide_content_too_large", "slide body or notes exceed the allowed size"), nil
	}
	id, err := newSlideID()
	if err != nil {
		return Result{}, err
	}
	state.Slides = append(state.Slides, Slide{ID: id, Type: input.SlideType, Heading: heading, Body: input.Body, Notes: input.Notes})
	state.ActiveSlideIndex = len(state.Slides) - 1
	state.Status = StatusDrafting
	return Result{OK: true, SlideID: id}, nil
}

func UpdateSlide(ctx agent.Context, input UpdateSlideArgs) (Result, error) {
	state := readState(ctx.State())
	r, e := updateSlide(&state, input)
	if e == nil && r.OK {
		if err := ctx.State().Set("slides", state.Slides); err != nil {
			return Result{}, fmt.Errorf("set slides: %w", err)
		}
		if err := ctx.State().Set("status", state.Status); err != nil {
			return Result{}, fmt.Errorf("set status: %w", err)
		}
	}
	return r, e
}

func updateSlide(state *PresentationState, input UpdateSlideArgs) (Result, error) {
	if strings.TrimSpace(input.SlideID) == "" {
		return failure("invalid_slide_id", "slide_id is required"), nil
	}
	index := slideIndex(state.Slides, input.SlideID)
	if index < 0 {
		return failure("slide_not_found", "slide was not found"), nil
	}
	updated := state.Slides[index]
	if input.Heading != nil {
		heading := strings.TrimSpace(*input.Heading)
		if heading == "" || len(heading) > 200 {
			return failure("invalid_heading", "heading must be non-empty and at most 200 characters"), nil
		}
		updated.Heading = heading
	}
	if input.Body != nil {
		if len(*input.Body) > 20_000 {
			return failure("slide_content_too_large", "slide body exceeds the allowed size"), nil
		}
		updated.Body = *input.Body
	}
	if input.Notes != nil {
		if len(*input.Notes) > 10_000 {
			return failure("slide_content_too_large", "slide notes exceed the allowed size"), nil
		}
		updated.Notes = *input.Notes
	}
	if input.SlideType != nil {
		if !validSlideType(*input.SlideType) {
			return failure("invalid_slide_type", "slide_type must be title, content, bullets, or two-column"), nil
		}
		updated.Type = *input.SlideType
	}
	state.Slides[index] = updated
	state.Status = StatusDrafting
	return Result{OK: true, SlideID: input.SlideID}, nil
}

func DeleteSlide(ctx agent.Context, input SlideIDArgs) (Result, error) {
	state := readState(ctx.State())
	r, e := deleteSlide(&state, input)
	if e == nil && r.OK {
		if err := ctx.State().Set("slides", state.Slides); err != nil {
			return Result{}, fmt.Errorf("set slides: %w", err)
		}
		if err := ctx.State().Set("active_slide_index", state.ActiveSlideIndex); err != nil {
			return Result{}, fmt.Errorf("set active_slide_index: %w", err)
		}
		if err := ctx.State().Set("status", state.Status); err != nil {
			return Result{}, fmt.Errorf("set status: %w", err)
		}
	}
	return r, e
}

func deleteSlide(state *PresentationState, input SlideIDArgs) (Result, error) {
	index := slideIndex(state.Slides, input.SlideID)
	if index < 0 {
		return failure("slide_not_found", "slide was not found"), nil
	}
	state.Slides = append(state.Slides[:index:index], state.Slides[index+1:]...)
	if len(state.Slides) == 0 {
		state.ActiveSlideIndex = 0
	} else if state.ActiveSlideIndex >= len(state.Slides) {
		state.ActiveSlideIndex = len(state.Slides) - 1
	}
	state.Status = StatusDrafting
	return Result{OK: true}, nil
}

func ReorderSlides(ctx agent.Context, input ReorderArgs) (Result, error) {
	state := readState(ctx.State())
	r, e := reorderSlides(&state, input)
	if e == nil && r.OK {
		if err := ctx.State().Set("slides", state.Slides); err != nil {
			return Result{}, fmt.Errorf("set slides: %w", err)
		}
		if err := ctx.State().Set("active_slide_index", state.ActiveSlideIndex); err != nil {
			return Result{}, fmt.Errorf("set active_slide_index: %w", err)
		}
		if err := ctx.State().Set("status", state.Status); err != nil {
			return Result{}, fmt.Errorf("set status: %w", err)
		}
	}
	return r, e
}

func reorderSlides(state *PresentationState, input ReorderArgs) (Result, error) {
	if len(input.SlideIDs) != len(state.Slides) {
		return failure("invalid_slide_order", "slide order must contain every current slide exactly once"), nil
	}
	byID := make(map[string]Slide, len(state.Slides))
	for _, slide := range state.Slides {
		byID[slide.ID] = slide
	}
	seen := make(map[string]bool)
	reordered := make([]Slide, 0, len(input.SlideIDs))
	for _, id := range input.SlideIDs {
		if seen[id] {
			return failure("duplicate_slide_id", "slide order cannot contain duplicate IDs"), nil
		}
		seen[id] = true
		slide, ok := byID[id]
		if !ok {
			return failure("slide_not_found", "slide order contains an unknown slide ID"), nil
		}
		reordered = append(reordered, slide)
	}
	state.Slides, state.ActiveSlideIndex, state.Status = reordered, 0, StatusDrafting
	return Result{OK: true}, nil
}

func MarkReady(ctx agent.Context, input ReadyArgs) (Result, error) {
	state := readState(ctx.State())
	r, e := markReady(&state, input)
	if e == nil && r.OK {
		if err := ctx.State().Set("status", state.Status); err != nil {
			return Result{}, fmt.Errorf("set status: %w", err)
		}
		if err := ctx.State().Set("review_summary", state.ReviewSummary); err != nil {
			return Result{}, fmt.Errorf("set review_summary: %w", err)
		}
	}
	return r, e
}

func markReady(state *PresentationState, input ReadyArgs) (Result, error) {
	if len(input.Summary) > 5000 {
		return failure("summary_too_large", "review summary exceeds the allowed size"), nil
	}
	if input.ExpectedSlideCount < 1 || input.ExpectedSlideCount > maxSlides {
		return failure("invalid_expected_slide_count", "expected_slide_count must be between 1 and 100"), nil
	}
	if strings.TrimSpace(state.Title) == "" {
		return failure("presentation_title_required", "a presentation title is required before marking ready"), nil
	}
	if len(state.Slides) != input.ExpectedSlideCount {
		return failure("slide_count_mismatch", fmt.Sprintf("presentation has %d slides; expected %d", len(state.Slides), input.ExpectedSlideCount)), nil
	}
	for _, slide := range state.Slides {
		if strings.TrimSpace(slide.Heading) == "" && strings.TrimSpace(slide.Body) == "" {
			return failure("empty_slide", "every slide must contain a heading or body before marking ready"), nil
		}
	}
	state.Status, state.ReviewSummary = StatusReady, input.Summary
	return Result{OK: true}, nil
}

func failure(code, message string) Result {
	return Result{Error: &agentruntime.StructuredError{Code: code, Message: message}}
}

func validSlideType(value string) bool {
	return value == "title" || value == "content" || value == "bullets" || value == "two-column"
}

func slideIndex(slides []Slide, id string) int {
	for index, slide := range slides {
		if slide.ID == id {
			return index
		}
	}
	return -1
}

func newSlideID() (string, error) {
	var data [4]byte
	if _, err := rand.Read(data[:]); err != nil {
		return "", errors.New("generate slide ID")
	}
	return "slide_" + hex.EncodeToString(data[:]), nil
}
