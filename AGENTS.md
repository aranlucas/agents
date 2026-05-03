# Agent Instructions

This project is a Google ADK travel concierge backed by the TRVL MCP server at:

`https://trvl-production.up.railway.app/mcp`

The live MCP `tools/list` response was captured on 2026-05-03 and saved as a raw reference at:

`docs/reference/trvl-mcp-tools-raw.json`

Use that file when exact JSON Schema details are needed. Keep this document as the operational guide, not a schema dump.

## Core Conventions

- Use the smallest specialist agent that can complete the request.
- Prefer read-only tools before state-changing tools.
- Dates must be explicit `YYYY-MM-DD`. If the user says "today", "tomorrow", or "this weekend", resolve it using the current runtime date before calling MCP tools.
- Flight locations should be IATA airport codes unless the tool explicitly accepts city/location names.
- Country inputs for visa checks must be ISO 3166-1 alpha-2 country codes.
- Provider tools are useful for extending search coverage with external integrations.
- Hidden-city and watch tools support advanced planning flows and should preserve the user's stated constraints in the tool input.
- Booking and saved-trip tools should be used when the user wants persistent itinerary state.

## Agent Map

### `profile_agent`

Purpose: manage traveler defaults, preferences, inferred profile, and booking history.

Tools:

- `get_preferences`: no input. Returns home airports/cities, currency, hotel constraints, loyalty data, budget defaults, nationality, dietary needs, and notes.
- `update_preferences`: optional preference fields such as `home_airports`, `display_currency`, `min_hotel_stars`, `min_hotel_rating`, `no_dormitories`, `carry_on_only`, `notes`. Returns the merged preference profile.
- `build_profile`: optional `source`. Refreshes inferred profile from email/manual/empty source.
- `add_booking`: required `type`, `provider`; optional booking date, travel date, route, price, currency, nights, stars, source, reference, notes. Returns updated inferred travel profile.
- `onboard_profile`: required `phase`. Returns phased onboarding questions and next phase.
- `interview_trip`: no input. Returns structured trip questions and profile summary.

Use this agent when personal defaults materially change another specialist's answer: origin airport, currency, budget, bags, hotel minimums, loyalty programs, passport/nationality, dietary needs, or companion count.

### `discovery_agent`

Purpose: discover destinations, dates, deals, destination context, weather, events, guides, and broad trip plans.

Tools:

- `weekend_getaway`: required `origin`, `departure_date`, `return_date`; optional `max_budget`. Returns candidate destinations with flight/hotel/total price.
- `suggest_dates`: required `origin`, `destination`, `target_date`; optional flex, round-trip flag, duration. Returns cheapest nearby dates under `result`.
- `search_dates`: required `origin`, `destination`, `start_date`, `end_date`; optional trip duration and round-trip flag. Returns date-price candidates.
- `search_deals`: required `origins`; optional max price, type, hours. Returns deal list.
- `destination_info`: required `location`; optional `travel_dates`. Returns country, weather, holidays, safety, currency, timezone.
- `travel_guide`: required `location`. Returns summary, guide sections, URL.
- `get_weather`: required `city`; optional date range. Returns up to 14 days of forecasts.
- `local_events`: required `location`, `start_date`, `end_date`. Returns event candidates.
- `nearby_places`: required `lat`, `lon`; optional category, radius. Returns POIs/attractions.
- `search_natural`: available in code if exposed by server; use only after confirming it exists in the raw reference.
- `plan_trip`: required `origin`, `destination`, `depart_date`, `return_date`; optional guests/currency. Returns outbound flights, return flights, hotels, context, and summary.

Use this agent for "where should I go?", "when is cheapest?", "what is there to do?", and first-pass trip construction.

### `transport_agent`

Purpose: flights, routes, ground transport, transfers, baggage, lounges, hidden-city analysis, and award sweet spots.

Tools:

- `search_flights`: required `origin`, `destination`, `departure_date`; many optional filters including return date, cabin, bags, currency, max price, stops, time windows, lounges, emissions, provider, sorting. Returns flights, suggestions, and hacks.
- `plan_flight_bundle`: required `destination`, `departure_date`; optional origin, return date, cabin, layover filters, lounge, hidden-city, top N. Returns ranked flight bundles.
- `find_interactive`: required `origin`, `destination`, `departure_date`; optional return/filter fields. Can elicit relaxed filters when no results.
- `search_route`: required `origin`, `destination`, `date`; optional departure/arrival constraints, transfers, price, currency, preferred/avoided mode, sorting. Returns multimodal itineraries.
- `search_ground`: required `from`, `to`, `date`; optional currency, type, max price, providers, browser fallback. Returns train/bus/ferry routes.
- `search_airport_transfers`: required `airport_code`, `destination`, `date`; optional arrival time, currency, transfer type, max price, providers. Returns airport transfer routes.
- `get_baggage_rules`: required `airline_code` or `all`. Returns airline baggage rules.
- `search_lounges`: required `airport`. Returns lounges.
- `search_hidden_city`: required `offers`; requires `allow_hidden_city=true` for candidates. Returns hidden-city ranking.
- `search_awards`: required `seats`, `balances`; optional transfer ratios, min CPP, cabin, origin, destination. Returns sweet spots.

Before the first flight search in a conversation, call `get_preferences` through `profile_agent` when the user has not supplied origin, currency, bags, cabin, or loyalty context.

### `lodging_agent`

Purpose: hotel search, named hotel lookup, rooms, prices, reviews, accommodation hacks, and room watches.

Tools:

- `search_hotels`: required `location`, `check_in`, `check_out`; optional guests, stars, sort, price/rating/distance limits, amenities, cancellation, property type, brand, room/bed/bath constraints, meal plan, sold-out inclusion. Returns hotels, provider statuses, suggestions.
- `search_hotel_by_name`: required `name`, `check_in`, `check_out`; optional location/currency. Returns matching hotels.
- `hotel_rooms`: required `hotel_name`, `check_in`, `check_out`; optional currency, booking URL. Returns room types and pricing.
- `hotel_prices`: required `hotel_id`, `check_in`, `check_out`; optional currency. Returns provider prices.
- `hotel_reviews`: required `hotel_id`; optional limit/sort. Returns summary and reviews.
- `detect_accommodation_hacks`: required `city`, `checkin`, `checkout`; optional currency, max splits, guests. Returns split-stay opportunities.
- `watch_room_availability`: required `hotel_name`, `check_in`, `check_out`, `keywords`; optional below/currency. Creates an availability watch.

Use this agent for lodging comparison. Only create watches when the user explicitly asks to monitor availability.

### `viability_agent`

Purpose: determine practicality, cost, visa/entry, points value, optimization, travel hacks, multi-city feasibility, restaurants.

Tools:

- `assess_trip`: required `origin`, `destination`, `depart_date`, `return_date`; optional guests, passport, currency. Returns verdict, reason, checks, total cost, nights.
- `calculate_trip_cost`: required `origin`, `destination`, `depart_date`, `return_date`; optional guests/currency. Returns total cost under `result`.
- `check_visa`: required `passport`, `destination` country codes. Returns visa requirement and notes.
- `calculate_points_value`: required `cash_price`, `points_required`, `program`. Returns cents-per-point and verdict.
- `detect_travel_hacks`: required `origin`, `destination`, `date`; optional return date, currency, carry-on flag. Returns money-saving hacks.
- `optimize_booking`: required `origin`, `destination`, `departure_date`, `return_date`; optional flex, guests, currency, bag constraints, max results/API calls. Returns booking strategy under `result`.
- `optimize_trip_dates`: required `origin`, `destination`, `from_date`, `to_date`; optional trip length, guests, currency. Returns date optimization under `result`.
- `find_trip_window`: required `destination`, `window_start`, `window_end`; optional origin, busy/preferred intervals, min/max nights, candidate count, budget. Returns travel-window candidates.
- `optimize_multi_city`: required `home_airport`, `cities`, `depart_date`; optional return date. Returns optimal order, segments, total cost, savings.
- `search_restaurants`: required `location`; optional cuisine, budget, limit. Returns restaurants.

Use this agent after discovery or transport/lodging searches when the user asks "is this worth it?", "can I do this?", "what will it cost?", or "optimize it."

### `itinerary_agent`

Purpose: saved trips, calendar export, booked status, price watches, and opportunity watches.

Tools:

- `create_trip`: required `name`; optional initial `legs`. Returns saved trip.
- `list_trips`: no input. Returns trips.
- `get_trip`: required `id`. Returns trip details.
- `update_trip`: required `trip_id`; optional name, notes, status, tags, replacement legs. Returns updated trip.
- `mark_trip_booked`: required `trip_id`, `provider`, `reference`. Returns booked trip.
- `export_ics`: required `trip_id`. Returns iCalendar data, trip name, event count.
- `watch_price`: required `type`, `target_price`; optional origin/destination/location/date/currency. Creates flight or hotel price watch.
- `list_watches`: available in code if exposed by server; use only after confirming exact schema in raw reference.
- `check_watches`: available in code if exposed by server; use only after confirming exact schema in raw reference.
- `watch_opportunities`: optional favourites/window/score/night constraints. Creates rolling opportunity watch.
- `list_opportunity_watches`: no input. Lists rolling opportunity watches.

For multi-destination trips, call `create_trip` first, then `update_trip` with all legs in chronological order. For road trips, use `type="road_trip"` and `provider="personal_car"` or `provider="rental_car"` even though the schema description lists common transport types.

### `provider_admin_agent`

Purpose: manage external provider integrations for expanded hotel, ground, restaurant, and review coverage.

Tools:

- `suggest_providers`: optional category. Returns provider catalog and config skeletons.
- `list_providers`: no input. Returns configured providers.
- `configure_provider`: required provider ID, name, category, endpoint, results path, field mapping; optional auth/header/query/body/TLS/cookie/rate-limit fields. Returns normalized provider configuration.
- `test_provider`: required `id`; optional location/check-in/check-out. Returns diagnostics.
- `provider_health`: no input. Returns provider health stats.
- `remove_provider`: required `id`. Removes provider.

This agent is useful for future flows where the app can add, test, and monitor external data providers.

### `diagnostics_agent`

Purpose: MCP progress and integration diagnostics.

Tools:

- `test_tool_with_progress`: no input. Reports progress notifications.

This agent is useful for validating progress notifications and client rendering.

## Output Handling

The MCP server commonly returns one of these shapes:

- Direct objects with `success`, `error`, and domain fields.
- Wrapped objects such as `{ "result": { ... } }`.
- Tool responses with `structuredContent` and `content`.

Use `structuredContent` first when available. If only text content is present, parse the first text item as JSON. When a tool returns `success=false` or an `error` field, report the failure and ask for the smallest missing or corrected input.

## State Updates

The shared callback updates `active_trip` for these tools:

- `search_flights`
- `search_route`
- `search_hotels`
- `assess_trip`
- `plan_trip`
- `create_trip`
- `get_trip`
- `update_trip`
- `mark_trip_booked`

If a new agent uses additional trip-producing tools, update `agent/utils.py` so `active_trip` remains consistent.

## Maintenance

When the MCP endpoint changes, refresh the raw reference with `initialize`, `notifications/initialized`, and `tools/list`, then update this guide only for meaningful contract or routing changes.
