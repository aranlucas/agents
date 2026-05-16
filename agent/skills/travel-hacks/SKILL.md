---
name: travel-hacks
description: "Detect 37 travel savings opportunities including hidden city, throwaway returns, error fares, positioning flights, and deal feeds. Use after flight searches or when user wants to save money."
allowed-tools: "detect_travel_hacks detect_accommodation_hacks search_hidden_city search_deals"
---

# Travel Hacks Skill

## When to Use

After any flight or hotel search, when user wants to save money, find deals, or explore alternative booking strategies.

## Core Tools

### detect_travel_hacks
Runs 37 parallel detectors for flight savings opportunities.

Required: `origin`, `destination`, `date`
Optional: `return_date`, `currency`, `carry_on`

Detectors include: throwaway, hidden_city, positioning, split, stopover, date_flex, open_jaw, group_split, error_fare, flash_sale, departure_tax, back_to_back, mileage_run, low_cost_carrier, currency_arbitrage, tuesday_booking, fare_breakpoint, destination_airport, self_transfer, eu261, day_use, multimodal variants, rail_fly_arbitrage, eurostar_return, cross_border_rail, ferry_cabin, ferry_positioning, regional_pass, rail_competition, calendar_conflict, accommodation_split, fuel_surcharge, home_stopover, flight_combo

### search_hidden_city
Skiplagged-style hidden-city offers with risk scoring.

Required: `offers`, `allow_hidden_city` (explicit user consent)
Optional: `direct_baseline`, `depart_date`, `max_layover_risk`, `top_k`

### search_deals
Free RSS deal feeds (Secret Flying, Fly4Free, Holiday Pirates, TPG).

Required: `origins`
Optional: `max_price`, `type`, `hours`

### detect_accommodation_hacks
Split-stay optimization for hotels.

Required: `city`, `check_in`, `check_out`
Optional: `max_splits`, `guests`, `currency`

## Risk Rules

- Hidden city: Carry-on ONLY, last leg only, never check bags, never on round-trip with skip leg first
- Self-transfer: >=3h buffer on separate tickets, >=4h with passport control
- Error fares: Flag urgency — price may be fixed within hours
- Throwaway RT: Book RT, skip final leg only, never middle segments
- EU261: Surface compensation rights for EU-departing delays/cancellations

## Workflow

1. Always run `detect_travel_hacks` after every flight search
2. For long hotel stays: run `detect_accommodation_hacks`
3. For deal discovery: use `search_deals` with user's home airports
4. Hidden city requires explicit user consent — never enable without `allow_hidden_city=true`
