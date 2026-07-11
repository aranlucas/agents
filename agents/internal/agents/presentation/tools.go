package presentation

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
)

const maxSlides = 100

type Result struct {
	OK      bool                          `json:"ok"`
	SlideID string                        `json:"slide_id,omitempty"`
	Error   *agentruntime.StructuredError `json:"error,omitempty"`
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
	Summary string `json:"summary"`
}

func SetMeta(_ context.Context, tx *agentruntime.Transaction, input SetMetaArgs) (Result, error) {
	title, theme := strings.TrimSpace(input.Title), strings.TrimSpace(input.Theme)
	if title == "" || len(title) > 200 {
		return failure("invalid_title", "title is required and must be at most 200 characters"), nil
	}
	if theme != "light" && theme != "dark" && theme != "minimal" {
		return failure("invalid_theme", "theme must be light, dark, or minimal"), nil
	}
	state := decodeState(tx)
	state.Title, state.Theme, state.Status = title, theme, "drafting"
	writeState(tx, state)
	return Result{OK: true}, nil
}

func CreateSlide(_ context.Context, tx *agentruntime.Transaction, input CreateSlideArgs) (Result, error) {
	state := decodeState(tx)
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
	state.Status = "drafting"
	writeState(tx, state)
	return Result{OK: true, SlideID: id}, nil
}

func UpdateSlide(_ context.Context, tx *agentruntime.Transaction, input UpdateSlideArgs) (Result, error) {
	if strings.TrimSpace(input.SlideID) == "" {
		return failure("invalid_slide_id", "slide_id is required"), nil
	}
	state := decodeState(tx)
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
	state.Status = "drafting"
	writeState(tx, state)
	return Result{OK: true, SlideID: input.SlideID}, nil
}

func DeleteSlide(_ context.Context, tx *agentruntime.Transaction, input SlideIDArgs) (Result, error) {
	state := decodeState(tx)
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
	state.Status = "drafting"
	writeState(tx, state)
	return Result{OK: true}, nil
}

func ReorderSlides(_ context.Context, tx *agentruntime.Transaction, input ReorderArgs) (Result, error) {
	if len(input.SlideIDs) > maxSlides {
		return failure("invalid_slide_order", "slide order exceeds the slide limit"), nil
	}
	state := decodeState(tx)
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
		if slide, ok := byID[id]; ok {
			reordered = append(reordered, slide)
		}
	}
	state.Slides, state.ActiveSlideIndex, state.Status = reordered, 0, "drafting"
	writeState(tx, state)
	return Result{OK: true}, nil
}

func MarkReady(_ context.Context, tx *agentruntime.Transaction, input ReadyArgs) (Result, error) {
	if len(input.Summary) > 5000 {
		return failure("summary_too_large", "review summary exceeds the allowed size"), nil
	}
	state := decodeState(tx)
	state.Status, state.ReviewSummary = "ready", input.Summary
	writeState(tx, state)
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
