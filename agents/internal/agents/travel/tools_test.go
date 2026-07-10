package travel

import (
	"context"
	"strings"
	"testing"

	"github.com/aranlucas/agents/agents/internal/agentruntime"
)

func TestWriteItineraryStreamsBodyAndFlightsState(t *testing.T) {
	tx := newTravelTx()
	result, err := WriteItinerary(context.Background(), tx, WriteItineraryArgs{
		Summary: "weekend",
		Body:    "## Day 1: Arrival\n\n- 09:00 — Coffee",
		Flights: "UA 1",
	})
	state := decodeState(tx)
	if err != nil || !result.OK || state.Itinerary == "" || state.Flights != "UA 1" || state.Status != StatusDrafting {
		t.Fatalf("result/state/error = %#v / %#v / %v", result, state, err)
	}
}

func TestWriteItineraryRejectsRendererBreakingFormatTransactionally(t *testing.T) {
	tx := newTravelTx()
	before := tx.Snapshot()
	result, err := WriteItinerary(context.Background(), tx, WriteItineraryArgs{Body: "Day 1\n- breakfast"})
	if err != nil || result.OK || result.Error == nil || result.Error.Code != "invalid_itinerary" {
		t.Fatalf("result/error = %#v / %v", result, err)
	}
	if got := tx.Snapshot(); len(got) != len(before) || got["itinerary"] != before["itinerary"] {
		t.Fatalf("failed write mutated state: %#v", got)
	}
}

func TestAddDayReplacesExistingDayInsteadOfDuplicatingIt(t *testing.T) {
	tx := newTravelTx()
	_, _ = WriteItinerary(context.Background(), tx, WriteItineraryArgs{Body: "## Day 1: Old\n\n- 09:00 — Coffee\n\n## Day 2: Harbor\n\n- 10:00 — Ferry"})
	result, err := AddDay(context.Background(), tx, AddDayArgs{DayNumber: 1, Theme: "New", Plan: "- 08:30 — Breakfast"})
	state := decodeState(tx)
	if err != nil || !result.OK || strings.Count(state.Itinerary, "## Day 1:") != 1 || !strings.Contains(state.Itinerary, "## Day 1: New") || !strings.Contains(state.Itinerary, "## Day 2: Harbor") {
		t.Fatalf("result/itinerary/error = %#v / %q / %v", result, state.Itinerary, err)
	}
}

func TestLegacyStringInterestsDecodeAsStrongList(t *testing.T) {
	state := StateDefaults()
	state["interests"] = "food, museums, food"
	decoded := decodeState(agentruntime.NewTransaction(state))
	if len(decoded.Interests) != 2 || decoded.Interests[0] != "food" || decoded.Interests[1] != "museums" {
		t.Fatalf("interests = %#v", decoded.Interests)
	}
}

func newTravelTx() *agentruntime.Transaction { return agentruntime.NewTransaction(StateDefaults()) }
