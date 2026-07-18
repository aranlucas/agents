# Grocery Agent roadmap: shared lists and pantry management

Forward-looking plan for the next major Grocery Agent capabilities. Local
Android polish lives in [PLAN.md](./PLAN.md); store release work lives in
[STORE_RELEASE_TODO.md](./STORE_RELEASE_TODO.md).

## Where we are today

- Pantry is per-thread agent state (`update_pantry` tool writing
  `GroceryState.pantry`). It resets with every new chat and is invisible
  outside the conversation that created it.
- Grocery lists and structured recipes begin as reviewable thread state. The
  user can explicitly save either one to a personal or household library;
  D1 owns the editable record and the ADK artifact service writes an R2
  snapshot.
- Identity is Clerk (`x-clerk-user-id` reaches the Go agent), persistence is
  D1 (`sessions`, `app_states`, `user_states`, `session_events`) plus R2 for
  artifacts. Kroger is connected per user.

## Phase 1 — Durable per-user pantry

Goal: the pantry survives across chats and devices, and the agent plans
around it automatically.

1. D1 migration (append-only, keep existing migration history): a
   `pantry_items` table keyed by Clerk user id — name, normalized name,
   quantity, unit, category, updated_at, source (`manual` | `agent` |
   `order`).
2. Go agent tools: `get_pantry`, `add_pantry_items`, `remove_pantry_items`
   backed by D1 instead of thread state. Keep `update_pantry` emitting the
   same client-visible state so the mobile UI keeps working during the
   transition.
3. Agent instructions: consult the pantry before building a shopping list;
   subtract owned items; propose depletion updates after a confirmed cart
   add ("you bought rice 2 weeks ago — still stocked?").
4. Mobile: a Pantry screen (list, search, quick add/adjust/remove) reachable
   from the chat menu; chat stays the primary way to mutate it.
5. Auto-restock signal: when an order is recorded, offer to merge purchased
   items into the pantry in one confirmation step.

Acceptance: a new chat immediately knows the pantry; edits from the Pantry
screen and from chat converge on the same D1 rows; `pnpm check && pnpm test`
plus Go agent tests stay green.

## Phase 2 — Shared grocery lists (households)

Goal: two people maintain one list and both see updates.

1. D1 migrations: `households` (id, name, created_by), `household_members`
   (household_id, clerk_user_id, role `owner` | `member`, joined_at),
   `grocery_lists` (id, household_id nullable for personal lists, title,
   status), `grocery_list_items` (list_id, name, quantity, note, added_by,
   checked_by, checked_at, position).
2. Invites: short-lived invite code created by the owner, redeemed in-app
   (deep link `groceryagent://join/<code>`); no email infrastructure needed
   for v1.
3. Gateway endpoints (keep Worker names and bindings stable): CRUD for
   households, lists, and items, authorized by Clerk user id and household
   membership.
4. Agent integration: `save_current_list` makes a chat-produced plan personal
   by default or shared when the user selects a household; list/get/update
   tools let the agent work with the same records as HTTP clients.
5. Mobile: Lists tab — personal and household lists, item check-off,
   who-added attribution, pull-to-refresh first; lightweight polling (e.g.
   refetch on focus + 30s interval) before any push/realtime work.
6. Later in the phase: push notifications ("Alex added 6 items"), item
   claiming for in-store split shopping.

Acceptance: user A creates a household, user B joins by code, both edit the
same list from separate devices, and check-offs reconcile without data loss
(last-write-wins per item is acceptable for v1).

## Phase 3 — Pantry x meal planning loop

Goal: the three data sets (pantry, meal plan, shared list) feed each other.

1. Meal plans persist per household; picking a recipe diffs its ingredients
   against the pantry and appends only the gap to the shared list.
2. Post-shop flow: confirming a Kroger cart add updates the shared list
   (mark purchased) and offers a pantry merge in one step.
3. Depletion heuristics: purchase cadence from recorded orders drives
   "running low" suggestions and a weekly restock prompt.
4. Saved recipes gain "cook it" — decrement pantry quantities and log the
   meal.

## Phase 4 — Store-mode and quality-of-life

- In-store mode: aisle-sorted list, large touch targets, screen-awake.
- Weekly deals cross-referenced against household staples.
- Budget tracking per household per week from recorded orders.
- Offline tolerance: queue item check-offs locally and replay on reconnect.

## Constraints and non-goals

- D1 and R2 remain the only persistence (repo rule); no alternate stores.
- Worker names, bindings, and existing D1 migration files stay untouched;
  all schema work is new append-only migrations.
- No realtime infrastructure (websockets/DO fan-out) until polling proves
  insufficient; shared lists are low-write-rate data.
- Kroger remains the only commerce integration for now.
