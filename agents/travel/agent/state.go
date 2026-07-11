package travel

import (
	"encoding/json"
	"fmt"
	"strings"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/session"
)

const AppName = "collab_trip_agent"

type TravelStatus string

const (
	StatusIdle        TravelStatus = "idle"
	StatusDrafting    TravelStatus = "drafting"
	StatusReadyToBook TravelStatus = "ready_to_book"
	StatusBooked      TravelStatus = "booked"
)

type TransportMode string

const (
	TransportFlight   TransportMode = "flight"
	TransportRoadTrip TransportMode = "road_trip"
)

// Interests is strongly typed while remaining compatible with legacy sessions
// that stored the preference as either a JSON array or a comma-delimited string.
type Interests []string

func (i *Interests) UnmarshalJSON(data []byte) error {
	var values []string
	if err := json.Unmarshal(data, &values); err == nil {
		*i = cleanInterests(values)
		return nil
	}
	var legacy string
	if err := json.Unmarshal(data, &legacy); err != nil {
		return err
	}
	if strings.TrimSpace(legacy) == "" {
		*i = Interests{}
		return nil
	}
	*i = cleanInterests(strings.Split(legacy, ","))
	return nil
}

func cleanInterests(values []string) Interests {
	result := make(Interests, 0, len(values))
	seen := make(map[string]bool, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" && len(value) <= 100 && !seen[value] && len(result) < 50 {
			seen[value] = true
			result = append(result, value)
		}
	}
	return result
}

type TravelState struct {
	Destination   string        `json:"destination"`
	StartDate     string        `json:"start_date"`
	EndDate       string        `json:"end_date"`
	Travelers     int           `json:"travelers"`
	BudgetUSD     int           `json:"budget_usd"`
	Headline      string        `json:"headline"`
	Flights       string        `json:"flights"`
	Itinerary     string        `json:"itinerary"`
	Summary       string        `json:"summary"`
	Status        TravelStatus  `json:"status"`
	ReviewSummary string        `json:"review_summary"`
	UserID        string        `json:"user_id"`
	TravelerName  string        `json:"travelerName"`
	HomeAirport   string        `json:"homeAirport"`
	TransportMode TransportMode `json:"transportMode"`
	BudgetTier    string        `json:"budgetTier"`
	Vibe          string        `json:"vibe"`
	Pace          string        `json:"pace"`
	Interests     Interests     `json:"interests"`
	Dietary       string        `json:"dietary"`
	Mobility      string        `json:"mobility"`
}

func Defaults() TravelState {
	return TravelState{Travelers: 1, Status: StatusIdle, TransportMode: TransportFlight, Interests: Interests{}}
}

func StateDefaults() map[string]any {
	encoded, _ := json.Marshal(Defaults())
	var values map[string]any
	_ = json.Unmarshal(encoded, &values)
	return values
}

func readState(source session.ReadonlyState) TravelState {
	state := Defaults()
	values := make(map[string]any)
	if source != nil {
		for key, value := range source.All() {
			values[key] = value
		}
	}
	encoded, err := json.Marshal(values)
	if err == nil {
		_ = json.Unmarshal(encoded, &state)
	}
	if state.Travelers < 1 {
		state.Travelers = 1
	}
	if state.Status == "" {
		state.Status = StatusIdle
	}
	if state.TransportMode == "" {
		state.TransportMode = TransportFlight
	}
	if state.Interests == nil {
		state.Interests = Interests{}
	}
	return state
}

func publishState(ctx agent.Context, state TravelState) error {
	s := ctx.State()
	fields := []struct {
		key   string
		value any
	}{
		{"destination", state.Destination},
		{"start_date", state.StartDate},
		{"end_date", state.EndDate},
		{"travelers", state.Travelers},
		{"budget_usd", state.BudgetUSD},
		{"headline", state.Headline},
		{"flights", state.Flights},
		{"itinerary", state.Itinerary},
		{"summary", state.Summary},
		{"status", state.Status},
		{"review_summary", state.ReviewSummary},
		{"user_id", state.UserID},
		{"travelerName", state.TravelerName},
		{"homeAirport", state.HomeAirport},
		{"transportMode", state.TransportMode},
		{"budgetTier", state.BudgetTier},
		{"vibe", state.Vibe},
		{"pace", state.Pace},
		{"interests", state.Interests},
		{"dietary", state.Dietary},
		{"mobility", state.Mobility},
	}
	for _, field := range fields {
		if err := s.Set(field.key, field.value); err != nil {
			return fmt.Errorf("set %s: %w", field.key, err)
		}
	}
	return nil
}
