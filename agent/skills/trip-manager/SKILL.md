---
name: trip-manager
description: "Create, manage, and export trips including CRUD operations, calendar export, and booking status. Use when the user wants to save a trip, track itinerary, export to calendar, or manage trip legs."
allowed-tools: "create_trip update_trip get_trip list_trips mark_trip_booked export_ics"
---

# Trip Manager Skill

## When to Use

User wants to save a trip, track itinerary, export to calendar, mark as booked, or manage trip legs.

## Core Tools

### create_trip
Start a persistent trip object with optional initial legs.

Required: `name`
Optional: `legs` (list of TripLegInput)

### update_trip
Update trip name, notes, status, tags, or legs.

Required: `trip_id`
Optional: `name`, `notes`, `status`, `tags`, `legs`

### get_trip
Read a specific trip by ID.

Required: `id`

### list_trips
List all saved trips. No parameters.

### mark_trip_booked
Mark trip as booked with provider and reference.

Required: `trip_id`, `provider`, `reference`

### export_ics
Export trip as ICS calendar feed.

Required: `trip_id`

## TripLegInput Fields

| Field | Required | Values |
|-------|----------|--------|
| type | yes | flight, train, bus, ferry, hotel, activity |
| from | yes | Origin city or location |
| to | yes | Destination city or location |
| provider | no | Provider name |
| start_time | no | ISO datetime |
| end_time | no | ISO datetime |
| price | no | Leg price |
| currency | no | Currency code |
| booking_url | no | Booking URL |
| confirmed | no | Boolean |
| reference | no | Booking reference or PNR |

## Trip Status Lifecycle

planning -> booked -> in_progress -> completed
                  -> cancelled (at any point)

## Workflow

1. When user confirms a trip plan: use `create_trip` with name and legs
2. As user adds/modifies legs: use `update_trip` to keep state current
3. When user books: use `mark_trip_booked` with provider and reference
4. For calendar sync: use `export_ics` to generate ICS feed
5. To review past trips: use `list_trips` then `get_trip`
