---
name: ground-transport
description: "Search buses, trains, ferries, and airport transfers across 20+ providers including FlixBus, Eurostar, DB, SNCF, and ferry operators. Use for ground transport, multi-modal routing, or airport transfers."
allowed-tools: "search_ground search_route search_airport_transfers"
---

# Ground Transport Skill

## When to Use

User asks about ground transport, buses, trains, ferries, Eurostar, FlixBus, DB, airport transfers, or multi-modal routing.

## Core Tools

### search_ground
Buses, trains, ferries via 20+ providers.

Required: `from`, `to`, `date`
Optional: `currency`, `type` (bus/train/ferry/taxi/shuttle), `max_price`, `providers`, `allow_browser_fallbacks`

### search_route
Pareto-optimal multi-modal itineraries combining flights + trains + buses + ferries through hub cities.

Required: `origin`, `destination`, `date`
Optional: `depart_after`, `arrive_by`, `max_transfers`, `max_price`, `currency`, `prefer`, `avoid`, `sort`, `allow_browser_fallbacks`

### search_airport_transfers
Airport to city transfers + taxi estimates.

Required: `airport_code`, `destination`, `date`
Optional: `arrival_time`, `currency`, `type` (bus/train/taxi/tram/metro/mixed), `max_price`, `providers`

## Supported Providers

Bus: FlixBus, RegioJet
Train: Eurostar/Snap, DB, OBB, NS, VR, SNCF, Trainline, Transitous, Renfe, European Sleeper, Snalltaget
Ferry: Ferryhopper, Tallink, Viking Line, EckerO Line, Finnlines, Stena Line, DFDS

## Workflow

1. For point-to-point ground transport: use `search_ground`
2. For multi-modal journeys (flight + train + bus): use `search_route` first
3. For airport arrival/departure logistics: use `search_airport_transfers`
4. When flight is expensive or unavailable: check `search_ground` as alternative
5. For European routes under 4 hours: ground often beats flying when you factor in airport time
