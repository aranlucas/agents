# Agent Prompts Improvement Design

**Date:** 2026-05-03
**Scope:** doctor-adk Python agents + trvl MCP server

## Problem

Two categories of issues observed:

1. **Wrong specialist routing** — open-ended queries like "show flights near me" route to `transport_agent` because the root instruction uses vague category names rather than explicit routing rules. The word "flights" triggers transport even when the intent is discovery/browsing.
2. **Dead tool references** — three tools listed in agent TOOL lists do not exist on the live MCP server: `search_natural` (discovery), `list_watches` and `check_watches` (itinerary).
3. **Missing tool** — `explore_destinations` is documented, has a full internal package and CLI implementation, and is referenced by the `where-should-i-go` MCP prompt, but is not registered as an MCP tool in the live server.
4. **Vague sub-agent instructions** — agents lack tool selection guidance and result-conditional chaining rules, leading to suboptimal tool use.

---

## Changes

### 1. ROOT_INSTRUCTION — Explicit routing rules

Replace the current vague "route X work to the matching specialist" with explicit boundary definitions for each specialist. Key distinction:

- **discovery** handles anything open-ended or exploratory: "show flights near me", "where should I go", "cheap weekend trips", "what can I do for $500". Routes here even if the word "flights" appears, unless origin+destination+date are all known.
- **transport** handles specific directed searches: known origin, destination, and date. "Flights from SEA to YVR on June 5", "compare airlines for my Portland trip", "award availability".
- **lodging** — any accommodation search, comparison, or watch.
- **viability** — cost, visa, points value, date optimization, "is this trip doable", booking optimization.
- **itinerary** — save, update, retrieve trips; price watches; calendar export. Only called after a concrete plan exists.
- **profile** — only when user explicitly asks about preferences, or when a specialist needs a specific missing default (home airport, budget, loyalty tier) that would materially change its answer. Never called as a default first step.

Keep: `get_current_date` call before any date reasoning. Keep: "ask only for missing trip constraints needed to proceed."

---

### 2. Sub-agent instructions — quality pass with result-conditional tool chains

#### discovery_agent

**Scope:** Open-ended destination and date discovery. Handles queries with unspecified destination, flexible budget, or exploratory intent — including queries that mention "flights" without a specific route.

**Tool chain:**

- `explore_destinations` — first choice for "where can I fly from X" / "show me options" queries; returns destination list sorted by price
- `weekend_getaway` — for curated getaway suggestions with flight+hotel bundled
- `search_deals` — for price-driven browsing with flexible dates
- `suggest_dates` / `search_dates` — when destination is known but dates are flexible
- `destination_info` / `travel_guide` / `get_weather` / `local_events` / `nearby_places` — to enrich a chosen destination with context
- `plan_trip` — for broad multi-step plans with a known origin+destination+dates

**Result-conditional:**

- `explore_destinations` returns destinations → if user wants to drill in, enrich with `destination_info` or `get_weather` before presenting
- `weekend_getaway` or `search_deals` return options → user picks one → route to transport/lodging for specifics; or enrich with `travel_guide` / `local_events` if user wants destination context first
- `suggest_dates` returns optimal windows → hand off dates to transport for specific flight search

#### transport_agent

**Scope:** Specific, directed transportation searches. Requires a known origin, destination, and date. If any of these are missing, do not attempt to search — return to the concierge to ask.

**Tool chain:**

- `search_flights` — primary tool for flight search with known route and date
- If `search_flights` returns 0 results or poor options → fall back to `find_interactive` for flexible/constraint-relaxing search
- `plan_flight_bundle` — for multi-city or bundled itineraries
- `search_route` — for route overview across all modes
- `search_ground` — ground transport options; `search_airport_transfers` for airport-specific transfers
- `get_baggage_rules` — chain after flight results if user mentions bags or carry-on
- `search_lounges` — chain if user has lounge access in profile
- `search_hidden_city` — surface proactively if no checked bags (from profile or confirmed by user)
- `search_awards` — when user asks about points/miles redemption on a specific route

**Result-conditional:**

- `search_flights` returns results → if user has lounge access, chain `search_lounges`; if user has no checked bags, surface `search_hidden_city`; if user mentions baggage, chain `get_baggage_rules`
- `find_interactive` returns results → present with note that constraints were relaxed (show which ones)

#### lodging_agent

**Scope:** Accommodation search, comparison, pricing, reviews, and availability watching.

**Tool chain:**

- `search_hotels` — primary search by location and dates
- After `search_hotels` → run `hotel_prices` on top 3 results to compare provider pricing
- `hotel_reviews` — on demand or when user asks about quality/reputation
- `hotel_rooms` — on demand for room-level detail or accessibility needs
- `search_hotel_by_name` — when user names a specific property
- `detect_accommodation_hacks` — run proactively after `search_hotels`; surface any savings opportunities found
- `watch_room_availability` — when a preferred property is sold out for the dates

**Result-conditional:**

- `search_hotels` returns 0 results → suggest expanding area or adjusting dates before giving up
- `hotel_prices` shows significant provider price differences → call out the best provider explicitly
- `detect_accommodation_hacks` finds savings → present before final recommendation

#### viability_agent

**Scope:** Trip feasibility assessment — cost, visa, points optimization, booking optimization, and date/window optimization.

**Tool chain:**

- `calculate_trip_cost` — primary tool for total cost estimate
- If cost exceeds user budget → chain `detect_travel_hacks` + `optimize_booking` to find savings
- `check_visa` — whenever destination or user nationality is known; call proactively for international trips
- `calculate_points_value` — when user has loyalty points; compare cash vs points
- `optimize_trip_dates` — when dates are flexible and user wants cheapest window
- `find_trip_window` — when user has a date range but no specific dates
- `optimize_multi_city` — for multi-stop itineraries
- `search_restaurants` — when dining context or recommendations are needed as part of trip planning
- `assess_trip` — for holistic go/no-go assessment combining multiple factors

**Result-conditional:**

- `calculate_trip_cost` over budget → chain `detect_travel_hacks` then `optimize_booking`; present concrete savings
- `calculate_points_value` shows points redemption beats cash → recommend points path explicitly
- `optimize_trip_dates` or `find_trip_window` returns optimal dates → hand off to transport for specific flight search

#### itinerary_agent

**Scope:** Trip record management and booking follow-through. Only invoked after a concrete plan exists.

**Tool chain (creating trips):**

1. `create_trip` — first, with a descriptive name
2. `update_trip` — for each leg in order; do not skip legs
   - Road trips: `type="road_trip"`, `provider="personal_car"` or `"rental_car"`
   - Flights: `type="flight"`, `provider=airline name`
3. After all legs added — confirm completeness by listing legs back to the user
4. `mark_trip_booked` — when user confirms they've booked

**Tool chain (price watching):**

- `watch_price` — for watching a specific flight price on a known route and date
- `watch_opportunities` — for broader opportunity alerts (deals, significant price drops) across a trip
- `list_opportunity_watches` — to review active watches; use instead of the non-existent `list_watches`

**Tool chain (retrieval/export):**

- `list_trips` → `get_trip` for detail on a specific trip
- `export_ics` — after trip is finalized

#### profile_agent

**Scope:** Read and write traveler preferences. Called only when user explicitly asks about their profile, or when a specialist needs a specific missing default.

**Output contract:** Return only the specific fields requested, formatted as a flat key-value summary the calling specialist can use directly. Do not return the full profile when only one field is needed. Keep responses concise.

**Tool selection:**

- `get_preferences` — read current preferences; always call this before any write
- `update_preferences` — targeted field updates
- `build_profile` — infer preferences from conversation context
- `onboard_profile` — for new users with no profile
- `interview_trip` — structured interview to gather trip-specific context
- `add_booking` — record a confirmed booking to update inferred preferences

---

### 3. Tool list corrections (doctor-adk)

**Remove (don't exist on live server):**

- `search_natural` from `discovery_agent` TOOLS
- `list_watches` from `itinerary_agent` TOOLS
- `check_watches` from `itinerary_agent` TOOLS

**Add:**

- `explore_destinations` to `discovery_agent` TOOLS — must happen after Section 4 (trvl MCP registration)

---

### 4. Add `explore_destinations` MCP tool (trvl)

**File:** `trvl/mcp/tools_destinations.go`

Add handler `handleExploreDestinations` calling `explore.SearchExplore(ctx, client, origin, opts)`. Args struct:

```go
type ExploreDestinationsArgs struct {
    Origin    string `json:"origin"`     // required, IATA code
    StartDate string `json:"start_date"` // optional, YYYY-MM-DD
    EndDate   string `json:"end_date"`   // optional, YYYY-MM-DD
    TripType  string `json:"trip_type"`  // optional: "round-trip" | "one-way"
}
```

Output: summary text + structured `models.ExploreResult`. Registration follows the same `AddTool` pattern as `destination_info` and `weekend_getaway`.

---

### 5. MCP prompt quality pass (trvl/mcp/prompts.go)

- `where-should-i-go` — already references `explore_destinations` correctly; will work once tool is registered
- Other prompts (`plan-trip`, `find-cheapest-dates`, `compare-hotels`, `packing-list`, `setup_profile`, `setup_providers`) — light pass for clarity, no structural changes
