package travel

import (
	"iter"
	"strings"
	"testing"

	"google.golang.org/adk/v2/session"
)

func TestWriteItineraryStreamsBodyAndFlightsState(t *testing.T) {
	state := Defaults()
	result, err := writeItinerary(&state, WriteItineraryArgs{
		Summary: "weekend",
		Body:    "## Day 1: Arrival\n\n- 09:00 — Coffee",
		Flights: "UA 1",
	})
	if err != nil || !result.OK || state.Itinerary == "" || state.Flights != "UA 1" || state.Status != StatusDrafting {
		t.Fatalf("result/state/error = %#v / %#v / %v", result, state, err)
	}
}

func TestWriteItineraryRejectsRendererBreakingFormatTransactionally(t *testing.T) {
	state := Defaults()
	before := state
	result, err := writeItinerary(&state, WriteItineraryArgs{Body: "Day 1\n- breakfast"})
	if err != nil || result.OK || result.Error == nil || result.Error.Code != "invalid_itinerary" {
		t.Fatalf("result/error = %#v / %v", result, err)
	}
	if state.Itinerary != before.Itinerary {
		t.Fatalf("failed write mutated state: %#v", state)
	}
}

func TestWriteItineraryAllowsSupportingProseButRejectsUntimedBullets(t *testing.T) {
	state := Defaults()
	valid, err := writeItinerary(&state, WriteItineraryArgs{
		Body: "## Day 1: Arrival\n\n- 09:00 — Coffee\n\nPlanning notes: Reserve ahead for the holiday.",
	})
	if err != nil || !valid.OK {
		t.Fatalf("supporting prose result/error = %#v / %v", valid, err)
	}

	before := state.Itinerary
	invalid, err := writeItinerary(&state, WriteItineraryArgs{
		Body: "## Day 1: Arrival\n\n- 09:00 — Coffee\n- Reserve ahead",
	})
	if err != nil || invalid.OK || invalid.Error == nil || invalid.Error.Code != "invalid_itinerary" {
		t.Fatalf("untimed bullet result/error = %#v / %v", invalid, err)
	}
	if state.Itinerary != before {
		t.Fatalf("failed write mutated itinerary: %q", state.Itinerary)
	}
}

func TestAddDayReplacesExistingDayInsteadOfDuplicatingIt(t *testing.T) {
	state := Defaults()
	_, _ = writeItinerary(&state, WriteItineraryArgs{Body: "## Day 1: Old\n\n- 09:00 — Coffee\n\n## Day 2: Harbor\n\n- 10:00 — Ferry"})
	result, err := addDay(&state, AddDayArgs{DayNumber: 1, Theme: "New", Plan: "- 08:30 — Breakfast"})
	if err != nil || !result.OK || strings.Count(state.Itinerary, "## Day 1:") != 1 || !strings.Contains(state.Itinerary, "## Day 1: New") || !strings.Contains(state.Itinerary, "## Day 2: Harbor") {
		t.Fatalf("result/itinerary/error = %#v / %q / %v", result, state.Itinerary, err)
	}
}

func TestLegacyStringInterestsDecodeAsStrongList(t *testing.T) {
	state := StateDefaults()
	state["interests"] = "food, museums, food"
	decoded := readState(travelState(state))
	if len(decoded.Interests) != 2 || decoded.Interests[0] != "food" || decoded.Interests[1] != "museums" {
		t.Fatalf("interests = %#v", decoded.Interests)
	}
}

type travelState map[string]any

func (s travelState) Get(key string) (any, error) {
	value, ok := s[key]
	if !ok {
		return nil, session.ErrStateKeyNotExist
	}
	return value, nil
}

func (s travelState) All() iter.Seq2[string, any] {
	return func(yield func(string, any) bool) {
		for key, value := range s {
			if !yield(key, value) {
				return
			}
		}
	}
}
