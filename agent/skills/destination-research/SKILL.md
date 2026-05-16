---
name: destination-research
description: "Research destinations including weather, safety, events, restaurants, airport lounges, and travel guides. Use when the user asks about a destination, weather, local events, restaurants, or nearby places."
allowed-tools: "destination_info get_weather travel_guide local_events nearby_places search_restaurants search_lounges"
---

# Destination Research Skill

## When to Use

User asks about a destination, weather, local events, restaurants, airport lounges, travel guides, safety, or nearby places.

## Core Tools

### destination_info
Weather + safety + currency + holidays for any city.

Required: `location`
Optional: `travel_dates` (YYYY-MM-DD,YYYY-MM-DD)

Returns: weather forecast, country info, public holidays, safety advisory (1-5), currency exchange rates, timezone.

### get_weather
Open-Meteo forecast for a city.

Required: `location`
Optional: `travel_dates`

### travel_guide
Wikivoyage travel guide page.

Required: `location`

### local_events
Events during trip dates (Ticketmaster + free RSS).

Required: `location`, `start_date`, `end_date`

### nearby_places
OpenStreetMap POIs near coordinates.

Required: `lat`, `lon`
Optional: `category`, `radius` (meters)

### search_restaurants
Restaurants near a location.

Required: `location`
Optional: `cuisine`, `budget`, `limit`

### search_lounges
Airport lounge access via cards/status.

Required: `airport` (IATA code)

Auto-annotates with user's lounge cards and FF status from preferences.

## Workflow

1. For general destination overview: use `destination_info`
2. For detailed weather: use `get_weather`
3. For travel tips and guides: use `travel_guide`
4. For events during trip: use `local_events`
5. For food recommendations: use `search_restaurants`
6. For airport lounge access: use `search_lounges`
7. For POI discovery near coordinates: use `nearby_places`
