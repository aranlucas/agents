---
name: flight-search
description: "Search, compare, and optimize flights. Use when the user asks about flights, airfare, booking flights, finding cheap dates, or planning air travel. Covers Google Flights, Kiwi, and Skiplagged."
allowed-tools: "search_flights search_dates suggest_dates optimize_trip_dates find_trip_window plan_flight_bundle find_interactive optimize_booking plan_trip calculate_trip_cost weekend_getaway optimize_multi_city explore_destinations"
---

# Flight Search Skill

## When to Use

User asks about flights, airfare, booking flights, finding cheap dates, or planning air travel.

## Core Tools

### search_flights
Point-to-point flights via Google Flights + Kiwi + Skiplagged merge.

Required: `origin`, `destination`, `departure_date`
Key optional: `return_date`, `cabin_class`, `max_stops`, `sort_by`, `alliances`, `depart_after`/`depart_before`, `max_price`, `max_duration`, `exclude_basic`, `carry_on_bags`, `checked_bags`, `require_checked_bag`, `currency`, `min_layover_minutes`, `layover_at`, `no_early_connection`, `lounge_required`, `provider`

### search_dates
Cheapest-by-date across a date range (one price per day).

Required: `origin`, `destination`, `start_date`, `end_date`
Optional: `trip_duration`, `is_round_trip`

### suggest_dates
3 cheapest dates near a target + weekday/weekend analysis.

Required: `origin`, `destination`, `target_date`
Optional: `flex_days`, `round_trip`, `duration`

### optimize_trip_dates
Cheapest pair dates for fixed trip length (single API call).

Required: `origin`, `destination`, `from_date`, `to_date`
Optional: `trip_length`, `guests`, `currency`

### find_trip_window
Calendar-aware optimal window intersecting price calendar with busy/preferred intervals.

Required: `destination`, `window_start`, `window_end`
Optional: `origin`, `busy_intervals`, `preferred_intervals`, `min_nights`, `max_nights`, `budget`

### optimize_booking
Unified optimizer with 9 expansion strategies (alt origins/dests, rail+fly, date flex, hidden city, departure tax, rail competition, ferry cabin).

Required: `origin`, `destination`, `departure_date`, `return_date`
Optional: `flex_days`, `guests`, `currency`, `max_results`, `carry_on_only`, `need_checked_bag`

### plan_flight_bundle
Mental-model search: home-fan origin expansion, rail+fly origins, long-layover filter, lounge-coverage filter.

Required: `destination`, `departure_date`
Optional: `origin` (or "home"), `return_date`, `cabin`, `min_layover_minutes`, `layover_at`, `no_early_connection`, `lounge_required`, `hidden_city`, `top_n`

## Workflow

1. Always call `get_preferences` first to load user's home airport and flight preferences
2. Ask: From? To? When (date/window)? Flex? Travelers? Budget? Carry-on vs checked?
3. For unclear dates: use `find_trip_window` with calendar busy_intervals or `optimize_trip_dates`
4. For comprehensive optimization: use `optimize_booking` first (explores 9 strategies in parallel)
5. For specific route: use `search_flights` with appropriate filters
6. Run `detect_travel_hacks` in parallel after flight search
7. Show top 3 options with all-in costs (bag fees adjusted for FF status)
8. Always show: Naive price -> Optimized price -> Savings

## Hub-Carrier Throwaway Pattern

When user wants to end at a hub-carrier's home airport:
- Book round-trip from origin to third city via hub
- Use outbound + inbound-to-hub leg, skip final hub->origin leg
- Pass `layover_at` with ALL hubs of carrier group:
  - KLM/AF: AMS, CDG, ORY
  - Lufthansa Group: FRA, MUC, VIE, ZRH, BRU, DUS
  - British Airways: LHR, LGW, LCY
  - Combine with `alliances` param to lock route through alliance

## Risk Rules

- Hidden city / throwaway: carry-on ONLY, last leg only, never check bags
- Self-transfer: include >=3h buffer on separate tickets, >=4h with passport control
- Never skip middle segments
- Never on multi-passenger PNR if companions need skipped leg
