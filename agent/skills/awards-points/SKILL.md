---
name: awards-points
description: "Search award availability, calculate points value, and explore loyalty program sweet spots including Flying Blue, Avios, Aeroplan, Virgin Atlantic, and Alaska. Use for award flights, points redemptions, and transfer partners."
allowed-tools: "search_awards calculate_points_value list_sweet_spots partner_award_paths stopover_rules award_holds transfer_bonuses transfer_path chat_awards"
---

# Awards & Points Skill

## When to Use

User asks about award flights, points redemptions, miles, loyalty programs, transfer partners, or award sweet spots.

## Core Tools

### search_awards
Cross-program award sweet-spot scanner including MR/UR/Bilt transfers.

Required: `seats` (award seat fixtures), `balances` (user point balances)
Optional: `transfer_ratios`, `min_cpp`, `cabin`, `origin`, `destination`, `start_date`, `end_date`

### calculate_points_value
Points-vs-cash redemption value comparison.

Required: `cash_price`, `points_required`, `program`

Returns: effective cents-per-point, floor/ceiling valuation, verdict (use points/pay cash/borderline).

### list_sweet_spots
Browse known award sweet spots.

Optional: `cabin`, `program`, `airline`, `tier` (legendary/excellent/good)

### partner_award_paths
See which programs can book a specific carrier's award space.

Required: `carrier` (airline name or IATA)

### stopover_rules
Which programs allow free stopovers on award tickets.

Optional: `program` (omit to list all)

### award_holds
Which programs allow holding award space before booking.

Optional: `program` (omit to list all)

### transfer_bonuses
Active transfer bonuses from credit card points.

Optional: `from_program`, `to_program`, `active_only`

### transfer_path
Calculate transfer ratio from credit card points to loyalty program.

Required: `from_currency`, `to_program`, `points`

### chat_awards
Natural language award availability Q&A with session continuity.

Required: `query`
Optional: `session` (from prior response to continue)

## Programs Supported

Transferable Points: Chase UR, Amex MR, Bilt, Citi ThankYou, Capital One Miles
Award Programs: Flying Blue, Avios, Aeroplan, Virgin Atlantic, Alaska Mileage Plan

## Workflow

1. For award availability search: use `search_awards` with pre-fetched seat fixtures
2. For points value comparison: use `calculate_points_value`
3. For sweet spot discovery: use `list_sweet_spots`
4. For transfer planning: use `transfer_path` + `transfer_bonuses`
5. For program research: use `stopover_rules`, `award_holds`, `partner_award_paths`
6. For conversational award help: use `chat_awards`
