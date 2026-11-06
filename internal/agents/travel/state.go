package travel

import (
	"github.com/aranlucas/agents/internal/agentruntime"

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

type Interests []string

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
	return agentruntime.StateMap(Defaults())
}

func readState(source session.ReadonlyState) TravelState {
	state := agentruntime.ReadState(source, Defaults())
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
