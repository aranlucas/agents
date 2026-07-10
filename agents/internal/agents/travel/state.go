package travel

import (
	"encoding/json"
	"strings"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
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

func decodeState(tx *agentruntime.Transaction) TravelState {
	state := Defaults()
	if tx == nil {
		return state
	}
	encoded, err := json.Marshal(tx.Snapshot())
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

func writeState(tx *agentruntime.Transaction, state TravelState) {
	tx.Set("destination", state.Destination)
	tx.Set("start_date", state.StartDate)
	tx.Set("end_date", state.EndDate)
	tx.Set("travelers", state.Travelers)
	tx.Set("budget_usd", state.BudgetUSD)
	tx.Set("headline", state.Headline)
	tx.Set("flights", state.Flights)
	tx.Set("itinerary", state.Itinerary)
	tx.Set("summary", state.Summary)
	tx.Set("status", state.Status)
	tx.Set("review_summary", state.ReviewSummary)
	tx.Set("user_id", state.UserID)
	tx.Set("travelerName", state.TravelerName)
	tx.Set("homeAirport", state.HomeAirport)
	tx.Set("transportMode", state.TransportMode)
	tx.Set("budgetTier", state.BudgetTier)
	tx.Set("vibe", state.Vibe)
	tx.Set("pace", state.Pace)
	tx.Set("interests", state.Interests)
	tx.Set("dietary", state.Dietary)
	tx.Set("mobility", state.Mobility)
}
