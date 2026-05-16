---
name: hotel-search
description: "Search, compare, and optimize hotel bookings across Google Hotels, Trivago, Booking.com, Airbnb, and Hostelworld. Use when the user asks about hotels, accommodation, places to stay, or lodging."
allowed-tools: "search_hotels search_hotel_by_name hotel_prices hotel_reviews hotel_rooms watch_room_availability detect_accommodation_hacks"
---

# Hotel Search Skill

## When to Use

User asks about hotels, accommodation, places to stay, Airbnb, booking.com, or lodging.

## Core Tools

### search_hotels
Multi-provider hotel search (Google Hotels + Trivago + Booking.com + Airbnb + Hostelworld).

Required: `location`, `check_in`, `check_out`
Key optional: `guests`, `stars`, `sort`, `currency`, `min_rating`, `max_distance`, `min_price`/`max_price`, `amenities`, `free_cancellation`, `property_type`, `brand`, `eco_certified`, `enrich_amenities`

Airbnb filters: `min_bedrooms`, `min_bathrooms`, `min_beds`, `room_type`, `superhost`, `instant_book`

### search_hotel_by_name
Cross-provider lookup of a specific property (fuzzy match).

Required: `name`, `check_in`, `check_out`
Optional: `location`, `currency`

### hotel_prices
Provider price comparison for a specific property.

Required: `hotel_id`, `check_in`, `check_out`
Optional: `currency`

### hotel_reviews
Reviews + aggregate stats for a property.

Required: `hotel_id`
Optional: `limit`, `sort` (newest/highest/lowest)

### hotel_rooms
Room types + per-night pricing.

Required: `hotel_name`, `check_in`, `check_out`
Optional: `currency`, `booking_url`

### detect_accommodation_hacks
Split a long stay across 2-3 properties (EUR15/move cost, >=EUR50 + 15% saved threshold).

Required: `city`, `check_in`, `check_out`
Optional: `max_splits`, `guests`, `currency`

## Workflow

1. Call `get_preferences` first to load hotel preferences (min stars, rating, districts, etc.)
2. Use `search_hotels` for general discovery
3. Use `search_hotel_by_name` when user knows specific property
4. Use `hotel_prices` to compare providers for a specific hotel
5. Use `hotel_rooms` for room-level details and pricing
6. Use `hotel_reviews` for quality validation
7. For long stays: run `detect_accommodation_hacks` to find split-stay savings
8. For uncertain availability: use `watch_room_availability`

## Profile-Driven Filters

These profile fields automatically filter hotel results:
- `min_hotel_stars`: Passed to Google Hotels API
- `min_hotel_rating`: Activates 20-review minimum gate
- `preferred_districts`: Strict-filters or prioritizes by neighborhood
- `no_dormitories`: Drops hostels, capsules, guesthouse rooms
- `ensuite_only`: Drops shared-bathroom properties
- `budget_per_night_min/max`: Price range filters
