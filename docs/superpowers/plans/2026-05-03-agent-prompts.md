# Agent Prompts Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix specialist routing (especially "show flights near me" → discovery), remove dead tool references, add missing `explore_destinations` MCP tool, and sharpen all sub-agent instructions with result-conditional tool chains.

**Architecture:** Two repos change in sequence — trvl (Go MCP server) first to add the `explore_destinations` tool, then doctor-adk (Python agents) to update instructions and tool lists. All agent `instruction` strings are rewritten; tool lists are corrected. The `packing-list` MCP prompt is fixed to use `get_preferences` tool instead of the non-existent `trvl://preferences` resource.

**Tech Stack:** Go 1.21+ (trvl MCP server), Python 3.12 + Google ADK + LiteLLM (doctor-adk agents), pytest

---

## File Map

**trvl (~/Projects/trvl)**

- Modify: `mcp/tools_typed.go` — add `ExploreDestinationsArgs` struct
- Modify: `mcp/tools_destinations.go` — add `handleExploreDestinations` handler + `exploreDestinationsSummary`
- Modify: `mcp/run.go` — register `explore_destinations` tool
- Modify: `mcp/schema_test.go` — add `ExploreDestinationsArgs{}` to `argTypes`
- Modify: `mcp/prompts.go` — fix `packing-list` prompt (`trvl://preferences` → `get_preferences`)

**doctor-adk (~/Projects/doctor-adk)**

- Modify: `agent/main.py` — rewrite `ROOT_INSTRUCTION`
- Modify: `agent/agents/discovery.py` — update `TOOLS` + `DISCOVERY_INSTRUCTION`
- Modify: `agent/agents/transport.py` — update `TRANSPORT_INSTRUCTION`
- Modify: `agent/agents/lodging.py` — update `LODGING_INSTRUCTION`
- Modify: `agent/agents/viability.py` — update `VIABILITY_INSTRUCTION`
- Modify: `agent/agents/itinerary.py` — update `TOOLS` + `ITINERARY_INSTRUCTION`
- Modify: `agent/agents/profile.py` — update `PROFILE_INSTRUCTION`
- Modify: `agent/tests/test_trip_state.py` — add tool list correctness assertions

---

## Part 1: trvl — Add `explore_destinations` MCP Tool

### Task 1: Schema test (failing first)

**Files:**

- Modify: `mcp/schema_test.go:38-52`

- [ ] **Step 1: Add `ExploreDestinationsArgs{}` to the argTypes slice**

In `mcp/schema_test.go`, find the `argTypes` slice in `TestNoInvalidJsonschemaTags` and add the new type:

```go
argTypes := []any{
    SearchFlightsArgs{},
    SearchDatesArgs{},
    SearchHotelsArgs{},
    HotelPricesArgs{},
    HotelReviewsArgs{},
    HotelRoomsArgs{},
    WatchRoomAvailabilityArgs{},
    SearchGroundArgs{},
    SearchAirportTransfersArgs{},
    OptimizeMultiCityArgs{},
    PlanTripArgs{},
    DetectAccommodationHacksArgs{},
    TestProviderArgs{},
    ExploreDestinationsArgs{},  // add this line
}
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd ~/Projects/trvl && go test ./mcp/ -run TestNoInvalidJsonschemaTags -v
```

Expected: compile error — `ExploreDestinationsArgs undefined`

---

### Task 2: Add `ExploreDestinationsArgs` to `tools_typed.go`

**Files:**

- Modify: `mcp/tools_typed.go`

- [ ] **Step 1: Add the args struct**

Add at the end of `mcp/tools_typed.go` (before the final closing of the file, after the last existing struct):

```go
type ExploreDestinationsArgs struct {
	Origin    string `json:"origin" jsonschema:"Departure airport IATA code (e.g. SEA, JFK, LHR),pattern=^[A-Z]{3}$"`
	StartDate string `json:"start_date,omitempty" jsonschema:"Departure date (YYYY-MM-DD); defaults to 7 days from now"`
	EndDate   string `json:"end_date,omitempty" jsonschema:"Return date (YYYY-MM-DD); omit for one-way"`
	TripType  string `json:"trip_type,omitempty" jsonschema:"Trip type,enum=round-trip,enum=one-way"`
}
```

- [ ] **Step 2: Run the schema test to confirm it passes**

```bash
cd ~/Projects/trvl && go test ./mcp/ -run TestNoInvalidJsonschemaTags -v
```

Expected: PASS

---

### Task 3: Add `handleExploreDestinations` handler to `tools_destinations.go`

**Files:**

- Modify: `mcp/tools_destinations.go`

- [ ] **Step 1: Add the import for the explore package**

At the top of `mcp/tools_destinations.go`, find the `import` block and add:

```go
"trvl/internal/explore"
"trvl/internal/batchexec"
```

(alongside the existing `"trvl/internal/destinations"`, `"trvl/internal/models"`, etc.)

- [ ] **Step 2: Add handler and summary at the end of the file**

```go
func handleExploreDestinations(ctx context.Context, _ *mcp.CallToolRequest, args ExploreDestinationsArgs) (*mcp.CallToolResult, *models.ExploreResult, error) {
	origin := strings.ToUpper(args.Origin)
	if origin == "" {
		return nil, nil, fmt.Errorf("origin is required")
	}
	if err := models.ValidateIATA(origin); err != nil {
		return nil, nil, fmt.Errorf("invalid origin: %w", err)
	}

	opts := explore.ExploreOptions{
		DepartureDate: args.StartDate,
		ReturnDate:    args.EndDate,
		Adults:        1,
	}
	if args.TripType == "one-way" {
		opts.ReturnDate = ""
	}

	client := batchexec.NewClient()
	result, err := explore.SearchExplore(ctx, client, origin, opts)
	if err != nil {
		return nil, nil, err
	}

	summary := exploreDestinationsSummary(result, origin)
	return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: summary}}}, result, nil
}

func exploreDestinationsSummary(result *models.ExploreResult, origin string) string {
	if !result.Success || result.Count == 0 {
		if result.Error != "" {
			return fmt.Sprintf("Explore from %s failed: %s", origin, result.Error)
		}
		return fmt.Sprintf("No destinations found from %s.", origin)
	}

	lines := []string{fmt.Sprintf("Found %d destinations from %s. Top options:", result.Count, origin)}

	max := 10
	if len(result.Destinations) < max {
		max = len(result.Destinations)
	}
	for i, d := range result.Destinations[:max] {
		dest := d.CityName
		if dest == "" {
			dest = d.AirportCode
		}
		stops := "nonstop"
		if d.Stops == 1 {
			stops = "1 stop"
		} else if d.Stops > 1 {
			stops = fmt.Sprintf("%d stops", d.Stops)
		}
		lines = append(lines, fmt.Sprintf("%d. %s (%s) from USD %.0f — %s, %s",
			i+1, dest, d.AirportCode, d.Price, d.AirlineName, stops))
	}
	if result.Count > 10 {
		lines = append(lines, fmt.Sprintf("... and %d more destinations available.", result.Count-10))
	}

	return strings.Join(lines, "\n")
}
```

- [ ] **Step 3: Update existing `weekendSummary` to show top 5 destinations**

The existing `weekendSummary` function only shows 1 destination. Since `utils.py` strips `structuredContent` and the agent only sees text, replace it with a version that lists top 5:

Find the existing `weekendSummary` function (around line 107) and replace it with:

```go
func weekendSummary(result *trip.WeekendResult) string {
	if !result.Success || result.Count == 0 {
		if result.Error != "" {
			return fmt.Sprintf("Weekend getaway search failed: %s", result.Error)
		}
		return "No weekend getaway destinations found."
	}

	lines := []string{
		fmt.Sprintf("Found %d weekend getaway destinations from %s (%s to %s, %d nights). Top options:",
			result.Count, result.Origin, result.DepartureDate, result.ReturnDate, result.Nights),
	}

	max := 5
	if len(result.Destinations) < max {
		max = len(result.Destinations)
	}
	for i, d := range result.Destinations[:max] {
		lines = append(lines, fmt.Sprintf("%d. %s (%s) — USD %.0f total (flight %.0f + hotel est. %.0f)",
			i+1, d.Destination, d.AirportCode, d.Total, d.FlightPrice, d.HotelPrice))
	}
	if result.Count > 5 {
		lines = append(lines, fmt.Sprintf("... and %d more destinations available.", result.Count-5))
	}

	return strings.Join(lines, "\n")
}
```

- [ ] **Step 4: Verify it compiles**

```bash
cd ~/Projects/trvl && go build ./mcp/
```

Expected: no errors

---

### Task 4: Register `explore_destinations` in `run.go`

**Files:**

- Modify: `mcp/run.go`

- [ ] **Step 1: Add the registration call**

In `mcp/run.go`, find the block registering `weekend_getaway` (around line 83-87) and add the `explore_destinations` registration immediately after it:

```go
mcp.AddTool(server, &mcp.Tool{
    Name:        "explore_destinations",
    Description: "Discover the cheapest flight destinations from an origin airport. Returns destinations sorted by price with airline, stops, and airport info. Use for open-ended 'where should I go' or 'show me options from X' queries. Requires only an origin; dates default to the next ~4 weeks.",
    Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true, IdempotentHint: true, OpenWorldHint: ptrBool(true)},
}, handleExploreDestinations)
```

- [ ] **Step 2: Run `TestNewServerNoPanic` to verify registration succeeds**

```bash
cd ~/Projects/trvl && go test ./mcp/ -run TestNewServerNoPanic -v
```

Expected: PASS

- [ ] **Step 3: Run full mcp test suite**

```bash
cd ~/Projects/trvl && go test ./mcp/ -v
```

Expected: all PASS

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/trvl
git add mcp/tools_typed.go mcp/tools_destinations.go mcp/run.go mcp/schema_test.go
git commit -m "feat(mcp): add explore_destinations tool"
```

---

### Task 5: Fix `packing-list` prompt in `prompts.go`

**Files:**

- Modify: `mcp/prompts.go`

The `packing-list` prompt instructs the agent to read `trvl://preferences` resource (Step 3 of the prompt), but that resource is not registered — only `trvl://onboarding` exists. Fix it to call `get_preferences` tool instead.

- [ ] **Step 1: Find the reference in `promptPackingList`**

In `mcp/prompts.go`, find this line inside the `prompt` string for `promptPackingList` (around Step 3):

```
3. **Check bag allowance**: Read the user's travel profile (trvl://preferences) to check if they prefer carry-on only or checked bags.
```

- [ ] **Step 2: Replace the resource reference with a tool call**

```
3. **Check bag allowance**: Call get_preferences to check if the user prefers carry-on only or checked bags. Key fields: carry_on_only (bool), default_companions (for bag count). If preferences are empty, assume one checked bag and note this assumption.
```

- [ ] **Step 3: Verify the file compiles**

```bash
cd ~/Projects/trvl && go build ./mcp/
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/trvl
git add mcp/prompts.go
git commit -m "fix(mcp): replace non-existent trvl://preferences with get_preferences in packing-list prompt"
```

---

## Part 2: doctor-adk — Agent Instructions + Tool Lists

### Task 6: Add tool list correctness tests (failing first)

**Files:**

- Modify: `agent/tests/test_trip_state.py`

- [ ] **Step 1: Add assertions for tool list correctness at the end of `test_trip_state.py`**

```python
from agents.itinerary import TOOLS as ITINERARY_TOOLS


def test_discovery_tools_has_explore_destinations():
    assert "explore_destinations" in DISCOVERY_TOOLS, \
        "explore_destinations must be in discovery agent tools"


def test_discovery_tools_no_search_natural():
    assert "search_natural" not in DISCOVERY_TOOLS, \
        "search_natural does not exist on the MCP server"


def test_itinerary_tools_no_list_watches():
    assert "list_watches" not in ITINERARY_TOOLS, \
        "list_watches does not exist on the MCP server"


def test_itinerary_tools_no_check_watches():
    assert "check_watches" not in ITINERARY_TOOLS, \
        "check_watches does not exist on the MCP server"
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd ~/Projects/doctor-adk/agent && python -m pytest tests/test_trip_state.py -v -k "tools"
```

Expected: `test_discovery_tools_has_explore_destinations` FAIL, `test_discovery_tools_no_search_natural` FAIL, `test_itinerary_tools_no_list_watches` FAIL, `test_itinerary_tools_no_check_watches` FAIL

---

### Task 7: Fix `discovery_agent` tool list and instruction

**Files:**

- Modify: `agent/agents/discovery.py`

- [ ] **Step 1: Update `TOOLS` and `DISCOVERY_INSTRUCTION`**

Replace the entire contents of `agent/agents/discovery.py` with:

```python
"""Discovery agent."""
from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from utils import trvl_toolset, shared_after_tool_callback

TOOLS = [
    "explore_destinations",
    "weekend_getaway",
    "suggest_dates",
    "search_dates",
    "search_deals",
    "destination_info",
    "travel_guide",
    "get_weather",
    "local_events",
    "nearby_places",
    "plan_trip",
]

DISCOVERY_INSTRUCTION = """Handle open-ended destination and date discovery for weekend trips from Seattle.
Called for any request where the destination is unspecified, flexible, or exploratory — including
queries mentioning "flights" without a known route.

Tool selection:
- explore_destinations: first choice for "where can I fly from X" or open price browsing; returns
  destinations sorted by price. If user wants detail on a result, enrich with destination_info or
  get_weather before presenting.
- weekend_getaway: curated flight+hotel bundles for exact departure/return dates. If user picks a
  destination, enrich with travel_guide or local_events before handing to transport/lodging.
- search_deals: price-driven browsing with flexible dates. If a deal looks strong, enrich with
  destination_info and pass to transport for specific flights.
- suggest_dates / search_dates: when destination is known but dates are flexible. Return optimal
  windows; hand off to transport for the actual flight search.
- destination_info / travel_guide / get_weather / local_events / nearby_places: enrich a chosen
  destination with context — use after a destination is selected, not before.
- plan_trip: broad multi-step plan when origin, destination, and dates are all known.

Use profile context only when missing personal defaults would materially change recommendations.
Present the strongest options with timing and trade-offs."""

discovery_agent = LlmAgent(
    name="discovery_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    after_tool_callback=shared_after_tool_callback,
    instruction=DISCOVERY_INSTRUCTION,
    tools=[trvl_toolset(TOOLS)],
)
```

- [ ] **Step 2: Run the tool list tests**

```bash
cd ~/Projects/doctor-adk/agent && python -m pytest tests/test_trip_state.py -v -k "tools"
```

Expected: `test_discovery_tools_has_explore_destinations` PASS, `test_discovery_tools_no_search_natural` PASS

---

### Task 8: Fix `itinerary_agent` tool list and instruction

**Files:**

- Modify: `agent/agents/itinerary.py`

- [ ] **Step 1: Update `TOOLS` and `ITINERARY_INSTRUCTION`**

Replace the entire contents of `agent/agents/itinerary.py` with:

```python
"""Itinerary agent."""
from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from utils import trvl_toolset, shared_after_tool_callback

TOOLS = [
    "create_trip",
    "list_trips",
    "get_trip",
    "update_trip",
    "mark_trip_booked",
    "export_ics",
    "watch_price",
    "watch_opportunities",
    "list_opportunity_watches",
]

ITINERARY_INSTRUCTION = """Maintain trip records and booking follow-through. Called only after a
concrete plan exists — not for discovery or search tasks.

Creating trips:
1. create_trip with a descriptive name (e.g., "Portland Weekend Jun 5-7").
2. update_trip for each leg in order — do not skip any leg.
   - Road trips: type="road_trip", provider="personal_car" or "rental_car".
   - Flights: type="flight", provider=airline name.
3. After all legs: confirm the complete route by listing legs back to the user.
4. mark_trip_booked when user confirms they've booked.

Retrieving trips:
- list_trips → get_trip for detail on a specific trip.
- export_ics after a trip is finalized.

Price watching:
- watch_price: watch a specific flight price on a known route and date.
- watch_opportunities: broader opportunity alerts (deals, significant drops) across a trip.
- list_opportunity_watches: review active watches.

Use profile context only when saved preferences or booking history are needed to complete the
itinerary accurately."""

itinerary_agent = LlmAgent(
    name="itinerary_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    instruction=ITINERARY_INSTRUCTION,
    tools=[trvl_toolset(TOOLS)],
    after_tool_callback=shared_after_tool_callback,
)
```

- [ ] **Step 2: Run all tool list tests**

```bash
cd ~/Projects/doctor-adk/agent && python -m pytest tests/test_trip_state.py -v -k "tools"
```

Expected: all 4 tool list tests PASS

- [ ] **Step 3: Commit**

```bash
cd ~/Projects/doctor-adk
git add agent/agents/discovery.py agent/agents/itinerary.py agent/tests/test_trip_state.py
git commit -m "fix(agents): remove dead tool refs, add explore_destinations to discovery"
```

---

### Task 9: Rewrite `ROOT_INSTRUCTION` in `main.py`

**Files:**

- Modify: `agent/main.py`

- [ ] **Step 1: Replace `ROOT_INSTRUCTION`**

Find `ROOT_INSTRUCTION = """..."""` in `agent/main.py` and replace with:

```python
ROOT_INSTRUCTION = """You are a travel concierge for weekend trips from Seattle, WA.
Call get_current_date before any date reasoning.

Route requests to the correct specialist using these rules:

— discovery: open-ended, exploratory, or destination-unknown requests. Route here even when the
  word "flights" appears if origin + destination + date are not all specified. Examples:
  "show flights near me", "where should I go", "cheap weekend trips", "what can I do for $500",
  "show me deals", "where can I fly from Seattle".

— transport: specific, directed searches where origin, destination, AND date are all known.
  Examples: "flights from SEA to YVR on June 5", "compare airlines for my Portland trip",
  "award availability on Alaska SEA-LAX".

— lodging: any accommodation search, comparison, pricing, or availability watch.

— viability: cost estimation, visa checks, points value, date optimization, "is this trip
  doable", booking optimization.

— itinerary: save, update, retrieve, or export trips; price watches. Only after a plan exists.

— profile: only when the user explicitly asks about preferences, or when a specialist needs a
  specific missing default (home airport, budget, loyalty tier) that would materially change its
  answer. Never call profile as a default first step.

Summarize results clearly. Ask only for missing trip constraints needed to proceed.
"""
```

- [ ] **Step 2: Run the full test suite**

```bash
cd ~/Projects/doctor-adk/agent && python -m pytest tests/ -v
```

Expected: all PASS

- [ ] **Step 3: Commit**

```bash
cd ~/Projects/doctor-adk
git add agent/main.py
git commit -m "fix(agents): rewrite ROOT_INSTRUCTION with explicit routing rules"
```

---

### Task 10: Update `transport_agent` instruction

**Files:**

- Modify: `agent/agents/transport.py`

- [ ] **Step 1: Replace `TRANSPORT_INSTRUCTION`**

Find `TRANSPORT_INSTRUCTION = """..."""` in `agent/agents/transport.py` and replace with:

```python
TRANSPORT_INSTRUCTION = """Search and compare transportation options for trips from Seattle unless
the user specifies another origin. Requires a known origin, destination, and date — if any are
missing, return to the concierge to ask rather than guessing.

Use IATA airport codes for all flight searches.

Tool selection:
- search_flights: primary tool for any specific route+date search.
  → 0 results or all options poor: fall back to find_interactive.
  → Results found + user has lounge access: chain search_lounges.
  → User has no checked bags: proactively surface search_hidden_city savings.
  → User mentions bags or carry-on: chain get_baggage_rules.
- find_interactive: flexible/constraint-relaxing search; use when search_flights comes up empty
  or user wants to trade off stops, dates, or price. Present with which constraints were relaxed.
- plan_flight_bundle: multi-city or bundled itineraries.
- search_route: route overview across all transport modes.
- search_ground: ground transport between cities.
- search_airport_transfers: airport-specific transfers.
- get_baggage_rules: airline baggage allowances; chain after flight results when relevant.
- search_lounges: airport lounge access; chain when user has lounge cards in profile.
- search_hidden_city: hidden-city ticketing savings; only when user has no checked bags.
- search_awards: points/miles redemption on a specific route.

Use profile context only when the user has not supplied origin, airline preferences, loyalty
programs, bags, cabin class, or accessibility constraints."""
```

- [ ] **Step 2: Run tests**

```bash
cd ~/Projects/doctor-adk/agent && python -m pytest tests/ -v
```

Expected: all PASS

---

### Task 11: Update `lodging_agent` instruction

**Files:**

- Modify: `agent/agents/lodging.py`

- [ ] **Step 1: Replace `LODGING_INSTRUCTION`**

Find `LODGING_INSTRUCTION = """..."""` in `agent/agents/lodging.py` and replace with:

```python
LODGING_INSTRUCTION = """Find and compare lodging options for travel.

Tool chain:
- search_hotels: primary search by location and dates.
  → After results: run hotel_prices on the top 3 to compare providers; call out the best
    provider if prices differ significantly.
  → 0 results: suggest expanding the search area or adjusting dates.
- hotel_prices: provider-level pricing comparison; always run on top picks after search_hotels.
- hotel_reviews: fetch on demand or when user asks about quality/reputation.
- hotel_rooms: room-level detail; fetch on demand or for accessibility requirements.
- search_hotel_by_name: use when user names a specific property.
- detect_accommodation_hacks: run proactively after search_hotels; surface savings before the
  final recommendation.
- watch_room_availability: set when a preferred property is sold out for the requested dates.

Use profile context only when missing lodging preferences, budget, companions, or accessibility
needs would materially change the search. Highlight location, value, and constraints."""
```

- [ ] **Step 2: Run tests**

```bash
cd ~/Projects/doctor-adk/agent && python -m pytest tests/ -v
```

Expected: all PASS

---

### Task 12: Update `viability_agent` instruction

**Files:**

- Modify: `agent/agents/viability.py`

- [ ] **Step 1: Replace `VIABILITY_INSTRUCTION`**

Find `VIABILITY_INSTRUCTION = """..."""` in `agent/agents/viability.py` and replace with:

```python
VIABILITY_INSTRUCTION = """Assess trip feasibility and optimize cost, dates, and booking strategy.

Tool chain:
- calculate_trip_cost: primary cost estimate.
  → Over user budget: chain detect_travel_hacks then optimize_booking; present concrete savings.
- check_visa: run proactively for any international trip when destination and user nationality
  are known.
- calculate_points_value: when user has loyalty points; compare cash vs points.
  → Points redemption beats cash: recommend the points path explicitly.
- optimize_trip_dates: when dates are flexible and user wants the cheapest window.
- find_trip_window: when user has a date range but no specific dates.
  → Optimal dates returned: hand off to transport for specific flight search.
- optimize_multi_city: for multi-stop itineraries.
- detect_travel_hacks: proactively surface savings for any trip with a known route.
- optimize_booking: booking strategy and timing optimization.
- assess_trip: holistic go/no-go assessment combining cost, visa, and logistics.
- search_restaurants: when dining context is needed as part of trip planning.

Use profile context only when missing passport, budget, party size, or points materially affect
the verdict. Call out blockers and concrete next steps."""
```

- [ ] **Step 2: Run tests**

```bash
cd ~/Projects/doctor-adk/agent && python -m pytest tests/ -v
```

Expected: all PASS

---

### Task 13: Update `profile_agent` instruction

**Files:**

- Modify: `agent/agents/profile.py`

- [ ] **Step 1: Replace `PROFILE_INSTRUCTION`**

Find `PROFILE_INSTRUCTION = """..."""` in `agent/agents/profile.py` and replace with:

```python
PROFILE_INSTRUCTION = """Manage traveler preferences and profile. Called only when the user
explicitly asks about their profile, or when a specialist needs a specific missing default.

Output contract: return only the specific fields requested, formatted as a flat key-value
summary the calling specialist can use directly. Do not return the full profile when only one
field is needed. Keep responses concise.

Tool selection:
- get_preferences: read current preferences; call before any write operation.
- update_preferences: targeted field updates after reading current state with get_preferences.
- build_profile: infer preferences from conversation context.
- onboard_profile: for users with no existing profile.
- interview_trip: structured interview to gather trip-specific context.
- add_booking: record a confirmed booking to update inferred preferences."""
```

- [ ] **Step 2: Run tests**

```bash
cd ~/Projects/doctor-adk/agent && python -m pytest tests/ -v
```

Expected: all PASS

- [ ] **Step 3: Commit all remaining agent instruction changes**

```bash
cd ~/Projects/doctor-adk
git add agent/agents/transport.py agent/agents/lodging.py agent/agents/viability.py agent/agents/profile.py
git commit -m "feat(agents): sharpen sub-agent instructions with result-conditional tool chains"
```

---

## Self-Review Checklist

- [x] ROOT_INSTRUCTION routing rules cover all specialists with examples ✓
- [x] `search_natural` removed from discovery TOOLS ✓
- [x] `list_watches` / `check_watches` removed from itinerary TOOLS ✓
- [x] `explore_destinations` added to discovery TOOLS and implemented in trvl ✓
- [x] All sub-agent instructions have result-conditional tool chains ✓
- [x] `trvl://preferences` bug in packing-list prompt fixed ✓
- [x] Tests fail before implementation, pass after ✓
- [x] Type names consistent: `ExploreDestinationsArgs` used in Task 1, 2, 3, 4 ✓
- [x] `exploreDestinationsSummary` defined in Task 3, called in Task 3 ✓

---

## Addendum: Full Summary Audit (2026-05-03)

**Context:** `shared_after_tool_callback` strips `structuredContent` from all tool responses — agents only see the text `content`. Summaries that show only 1 result prevent agents from reasoning about options.

**Audit result — already rich (no change needed):**

- `buildWeatherSummary` — full daily forecast ✓
- `buildVisaSummary` — status, max stay, notes ✓
- `buildBaggageSummaryOne/All` — full per-airline tables ✓
- `buildTripWindowSummary` — lists all windows ✓
- `buildGroundRouteSummary` — top 10 with legs ✓
- `buildRouteSummary` — top 10 multi-modal ✓
- `buildAccomHacksSummary` — all hacks with savings ✓
- `multiCitySummary`, `suggestDatesSummary`, `destinationSummary` ✓

**Improved (commit `9f09606`):**

- `flightSummary` → top 5 with price, airline, stops, duration, baggage indicators
- `hotelSummary` → top 5 with price, rating, stars, neighborhood, cross-provider savings
- `loungeSummary` → each lounge listed with name, terminal, hours, access cards
- `localEventsSummary` → top 5 with name, date/time, venue, price range
- `nearbyPlacesSummary` → top 5 rated places with rating, category, distance
- `restaurantSummary` → top 5 with rating, cuisine, price level, insider tip
- `optimizeTripDatesSummary` → top 5 date options with flight+hotel breakdown
- `handleDetectTravelHacks` → all hacks listed with savings and description
- `formatFindSummary` (find_interactive) → top 5 bundles with route, stops, duration
