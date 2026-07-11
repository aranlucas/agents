package travel

import (
	"strings"
	"testing"

	"agents/internal/agentruntime"
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
	decoded := readState(agentruntime.StateMap(state))
	if len(decoded.Interests) != 2 || decoded.Interests[0] != "food" || decoded.Interests[1] != "museums" {
		t.Fatalf("interests = %#v", decoded.Interests)
	}
}
