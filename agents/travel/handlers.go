package travel

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"agents/internal/agentruntime"
	"google.golang.org/adk/v2/agent"
)

const maxTravelDocument = 1 << 20

var (
	dayHeadingPattern = regexp.MustCompile(`^## Day ([1-9][0-9]*):\s+\S.*$`)
	activityPattern   = regexp.MustCompile(`^- ([01][0-9]|2[0-3]):[0-5][0-9] — \S.*$`)
)

type Result struct {
	OK     bool                          `json:"ok"`
	Length int                           `json:"length,omitzero"`
	Date   string                        `json:"date,omitempty"`
	Error  *agentruntime.StructuredError `json:"error,omitempty"`
}

type SetTripMetaArgs struct {
	Destination string `json:"destination"`
	StartDate   string `json:"start_date"`
	EndDate     string `json:"end_date"`
	Travelers   int    `json:"travelers"`
	BudgetUSD   int    `json:"budget_usd"`
	Headline    string `json:"headline"`
}

type WriteItineraryArgs struct {
	Summary string `json:"summary"`
	Body    string `json:"body"`
	Flights string `json:"flights"`
}

type AddDayArgs struct {
	DayNumber int    `json:"day_number"`
	Theme     string `json:"theme"`
	Plan      string `json:"plan"`
}

type ReadyArgs struct {
	Summary string `json:"summary"`
}

type CurrentDateArgs struct{}

func SetTripMeta(ctx agent.Context, input SetTripMetaArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := setTripMeta(&state, input)
	if err != nil || !result.OK {
		return result, err
	}
	if err := ctx.State().Set("destination", state.Destination); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("start_date", state.StartDate); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("end_date", state.EndDate); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("travelers", state.Travelers); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("budget_usd", state.BudgetUSD); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("headline", state.Headline); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("status", state.Status); err != nil {
		return Result{}, err
	}
	return result, nil
}

func setTripMeta(state *TravelState, input SetTripMetaArgs) (Result, error) {
	destination, headline := strings.TrimSpace(input.Destination), strings.TrimSpace(input.Headline)
	if destination == "" || len(destination) > 300 {
		return travelFailure("invalid_destination", "destination is required and must be at most 300 characters"), nil
	}
	start, startErr := time.Parse(time.DateOnly, input.StartDate)
	end, endErr := time.Parse(time.DateOnly, input.EndDate)
	if startErr != nil || endErr != nil || end.Before(start) {
		return travelFailure("invalid_dates", "dates must use YYYY-MM-DD and end_date cannot precede start_date"), nil
	}
	if input.Travelers < 1 || input.Travelers > 100 {
		return travelFailure("invalid_travelers", "travelers must be between 1 and 100"), nil
	}
	if input.BudgetUSD < 0 || input.BudgetUSD > 1_000_000_000 {
		return travelFailure("invalid_budget", "budget_usd must be within policy bounds"), nil
	}
	if len(headline) > 300 {
		return travelFailure("headline_too_large", "headline must be at most 300 characters"), nil
	}
	state.Destination, state.StartDate, state.EndDate = destination, input.StartDate, input.EndDate
	state.Travelers, state.BudgetUSD, state.Headline = input.Travelers, input.BudgetUSD, headline
	state.Status = StatusDrafting
	return Result{OK: true}, nil
}

func WriteItinerary(ctx agent.Context, input WriteItineraryArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := writeItinerary(&state, input)
	if err != nil || !result.OK {
		return result, err
	}
	if err := ctx.State().Set("itinerary", state.Itinerary); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("summary", state.Summary); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("status", state.Status); err != nil {
		return Result{}, err
	}
	if input.Flights != "" {
		if err := ctx.State().Set("flights", state.Flights); err != nil {
			return Result{}, err
		}
	}
	return result, nil
}

func writeItinerary(state *TravelState, input WriteItineraryArgs) (Result, error) {
	if len(input.Body) > maxTravelDocument || len(input.Flights) > maxTravelDocument || len(input.Summary) > 10_000 {
		return travelFailure("itinerary_too_large", "itinerary, flights, or summary exceeds the allowed size"), nil
	}
	if err := validateItinerary(input.Body); err != nil {
		return travelFailure("invalid_itinerary", err.Error()), nil
	}
	state.Itinerary, state.Summary, state.Status = strings.TrimSpace(input.Body), strings.TrimSpace(input.Summary), StatusDrafting
	if input.Flights != "" {
		state.Flights = input.Flights
	}
	return Result{OK: true, Length: len(state.Itinerary)}, nil
}

func AddDay(ctx agent.Context, input AddDayArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := addDay(&state, input)
	if err != nil || !result.OK {
		return result, err
	}
	if err := ctx.State().Set("itinerary", state.Itinerary); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("status", state.Status); err != nil {
		return Result{}, err
	}
	return result, nil
}

func addDay(state *TravelState, input AddDayArgs) (Result, error) {
	theme, plan := strings.TrimSpace(input.Theme), strings.TrimSpace(input.Plan)
	if input.DayNumber < 1 || input.DayNumber > 365 || theme == "" || len(theme) > 200 || len(plan) > 100_000 {
		return travelFailure("invalid_day", "day number, theme, or plan is outside the allowed bounds"), nil
	}
	block := fmt.Sprintf("## Day %d: %s\n\n%s", input.DayNumber, theme, plan)
	if err := validateItinerary(block); err != nil {
		return travelFailure("invalid_day", err.Error()), nil
	}
	updated, err := replaceOrAppendDay(state.Itinerary, input.DayNumber, block)
	if err != nil || len(updated) > maxTravelDocument {
		return travelFailure("itinerary_too_large", "updated itinerary exceeds the allowed size"), nil
	}
	state.Itinerary, state.Status = updated, StatusDrafting
	return Result{OK: true, Length: len(updated)}, nil
}

func MarkReadyToBook(ctx agent.Context, input ReadyArgs) (Result, error) {
	state := readState(ctx.State())
	result, err := markReadyToBook(&state, input)
	if err != nil || !result.OK {
		return result, err
	}
	if err := ctx.State().Set("status", state.Status); err != nil {
		return Result{}, err
	}
	if err := ctx.State().Set("review_summary", state.ReviewSummary); err != nil {
		return Result{}, err
	}
	return result, nil
}

func markReadyToBook(state *TravelState, input ReadyArgs) (Result, error) {
	if len(input.Summary) > 10_000 {
		return travelFailure("summary_too_large", "review summary exceeds the allowed size"), nil
	}
	if strings.TrimSpace(state.Itinerary) == "" {
		return travelFailure("itinerary_required", "an itinerary is required before booking readiness"), nil
	}
	state.Status, state.ReviewSummary = StatusReadyToBook, strings.TrimSpace(input.Summary)
	return Result{OK: true}, nil
}

func GetCurrentDate(_ agent.Context, _ CurrentDateArgs) (Result, error) {
	return Result{OK: true, Date: time.Now().UTC().Format(time.DateOnly)}, nil
}

func validateItinerary(body string) error {
	lines := strings.Split(strings.TrimSpace(body), "\n")
	if len(lines) == 0 || !dayHeadingPattern.MatchString(lines[0]) {
		return errors.New("itinerary must start with a '## Day N: theme' heading")
	}
	seenDay, activities := make(map[int]bool), 0
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if matches := dayHeadingPattern.FindStringSubmatch(line); matches != nil {
			day, _ := strconv.Atoi(matches[1])
			if seenDay[day] {
				return errors.New("itinerary cannot contain duplicate day headings")
			}
			seenDay[day] = true
			continue
		}
		if activityPattern.MatchString(line) {
			activities++
			continue
		}
		if strings.HasPrefix(line, "-") {
			return errors.New("each bulleted activity must use '- HH:MM — activity' format")
		}
		if strings.HasPrefix(line, "##") {
			return errors.New("each day heading must use '## Day N: theme' format")
		}
		// Plain markdown prose is valid supporting context (for example a
		// reservation or holiday note). Only activity bullets are required to
		// carry a time so the client can render them on the day timeline.
	}
	if activities == 0 {
		return errors.New("itinerary must contain at least one timed activity")
	}
	return nil
}

func replaceOrAppendDay(current string, day int, block string) (string, error) {
	current = strings.TrimSpace(current)
	if current == "" {
		return block, nil
	}
	if err := validateItinerary(current); err != nil {
		return "", err
	}
	lines := strings.Split(current, "\n")
	start, end := -1, len(lines)
	for index, line := range lines {
		matches := dayHeadingPattern.FindStringSubmatch(strings.TrimSpace(line))
		if matches == nil {
			continue
		}
		number, _ := strconv.Atoi(matches[1])
		if start >= 0 {
			end = index
			break
		}
		if number == day {
			start = index
		}
	}
	if start < 0 {
		return current + "\n\n" + block, nil
	}
	parts := []string{strings.TrimSpace(strings.Join(lines[:start], "\n")), block, strings.TrimSpace(strings.Join(lines[end:], "\n"))}
	kept := parts[:0]
	for _, part := range parts {
		if part != "" {
			kept = append(kept, part)
		}
	}
	return strings.Join(kept, "\n\n"), nil
}

func travelFailure(code, message string) Result {
	return Result{Error: &agentruntime.StructuredError{Code: code, Message: message}}
}
