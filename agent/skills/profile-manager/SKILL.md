---
name: profile-manager
description: "Manage traveler preferences, profiles, and booking history. Use at the start of any travel conversation or when the user mentions preferences, travel style, or wants to set up their travel profile."
allowed-tools: "get_preferences update_preferences onboard_profile build_profile add_booking"
---

# Profile Manager Skill

## When to Use

At the start of any travel conversation, when user mentions preferences, travel style, or wants to set up their travel profile.

## Core Tools

### get_preferences
Read live preferences. ALWAYS call first in every conversation. No parameters.

If profile is empty, response includes interview instructions — run `onboard_profile` instead of guessing.

### update_preferences
Save confirmed preference changes. Only send fields you want to change.

Fields: `home_airports`, `display_currency`, `min_hotel_stars`, `min_hotel_rating`, `no_dormitories`, `carry_on_only`, `notes`

Always confirm with user before calling.

### onboard_profile
5-phase progressive interview for new users.

Required: `phase` (0-5)
- Phase 0: LLM context confirmation
- Phase 1: Basics (home, frequency, companions)
- Phase 2: Travel style (accommodation, budget, transport)
- Phase 3: Deep preferences (favourite cities, properties)
- Phase 4: Specifics (companion, wishlist)
- Phase 5: Reasoning and strategies

### build_profile
Build profile from booking history.

Optional: `source` ("email" to scan Gmail, or empty for manual)

### add_booking
Add a known booking to history.

Required: `type`, `provider`
Optional: `date`, `travel_date`, `from`, `to`, `price`, `currency`, `nights`, `stars`, `source`, `reference`, `notes`

## Profile Fields and Their Effects

| Field | Behavior |
|-------|----------|
| home_airports | Default origin for flight/trip/weekend/discover searches |
| display_currency | Price display across all tools |
| no_dormitories | Filters out hostels, capsules, guesthouse rooms |
| min_hotel_stars | Passed to Google Hotels API as search filter |
| min_hotel_rating | Activates 20-review minimum gate |
| preferred_districts | Strict-filters or prioritizes by neighborhood |
| carry_on_only | Gates hidden-city and throwaway hack eligibility |
| nationality | ISO 3166-1 alpha-2 for visa warnings |
| loyalty_airlines | Airline preferences and FF programs |
| budget_per_night_max | Max hotel price per night |
| flight_time_earliest | No flights before this time |

## Workflow

### New User
1. Call `get_preferences` — if empty, start `onboard_profile` at phase 0
2. Phase 0 confirms LLM inferences before asking redundant questions
3. Progress through phases 1-5, skipping questions the profile already answers

### Returning User
1. Call `get_preferences` first — never assume
2. Update preferences with `update_preferences` after confirming changes

### Continuous Learning
- Watch reactions to results to infer preferences
- Always confirm before saving preference changes
- Show what changed after each update
