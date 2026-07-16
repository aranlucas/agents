# Shared grocery lists — implementation plan (v1)

Executable plan for ROADMAP.md Phase 2: two people maintain one grocery
list and both see updates. Scope is deliberately v1: invite codes, CRUD +
check-off, polling sync. No realtime infrastructure, no push notifications.

## Architecture decisions

- Persistence: new append-only D1 migration in `agents/migrations/d1/`
  (`004_shared_lists.sql`). Existing migrations and Worker bindings stay
  untouched (repo rule).
- Backend: Go service (`agents/`) — a new store package using the existing
  `internal/cloudflare` D1 client, plus authenticated HTTP endpoints
  following the existing gateway handler + `internal/auth` Clerk middleware
  patterns. Identity is the Clerk user id already flowing via
  `x-clerk-user-id`.
- Agent: one new ADK tool (`save_list_to_household`) registered in
  `agents/grocery/agent.go`, implemented like the handlers in
  `agents/grocery/handlers.go`, reviewed against the ADK Go reference.
- Mobile: new Expo Router screens in `apps/grocery-mobile` reusing the
  existing component patterns (`ui.tsx`, theme tokens) — RNR migration
  (COMPONENT_PLAN.md) happens independently; do not block on it.
- Sync: refetch on screen focus + a 30s foreground interval. Last-write-wins
  per item. No websockets/Durable Objects until polling proves insufficient.

## Milestone 1 — Schema and store (Go)

1. `004_shared_lists.sql`:
   - `households` (id TEXT PK, name TEXT, created_by TEXT, created_at).
   - `household_members` (household_id, clerk_user_id, role
     `owner`|`member`, joined_at; PK (household_id, clerk_user_id)).
   - `household_invites` (code TEXT PK, household_id, created_by,
     expires_at, max_uses INTEGER, used_count INTEGER).
   - `grocery_lists` (id TEXT PK, household_id TEXT NULL — null means
     personal, owner_user_id TEXT, title, status `active`|`archived`,
     created_at, updated_at).
   - `grocery_list_items` (id TEXT PK, list_id, name, quantity TEXT, note
     TEXT NULL, position INTEGER, added_by TEXT, checked_by TEXT NULL,
     checked_at INTEGER NULL, updated_at).
   - Indexes on `household_members(clerk_user_id)`,
     `grocery_lists(household_id)`, `grocery_list_items(list_id)`.
2. Store package (e.g. `agents/internal/groceries/`): typed CRUD +
   membership checks; unit tests against the same D1 test harness used by
   `internal/cloudflare/d1_test.go`.

## Milestone 2 — HTTP API (Go gateway)

Authenticated with the existing Clerk middleware; every handler authorizes
household membership before touching rows.

- `POST /api/grocery/households` — create (creator becomes owner).
- `GET /api/grocery/households` — households for the caller.
- `POST /api/grocery/households/{id}/invites` — owner-only; returns a
  short code (8 chars, 7-day expiry, multi-use up to max_uses).
- `POST /api/grocery/invites/{code}/join` — redeem; idempotent for
  existing members.
- `GET /api/grocery/lists?householdId=…` and `GET /api/grocery/lists/{id}`
  (items included).
- `POST /api/grocery/lists` — create personal or household list.
- `POST /api/grocery/lists/{id}/items` — add items (batch).
- `PATCH /api/grocery/lists/{id}/items/{itemId}` — rename, quantity,
  check/uncheck (sets `checked_by`/`checked_at`).
- `DELETE /api/grocery/lists/{id}/items/{itemId}`.

Table-driven handler tests for authz (non-member 403), invite expiry, and
check-off attribution.

## Milestone 3 — Agent integration

1. Tool `save_list_to_household(household_id?, title)`: writes the current
   thread's `shopping_list` (with quantities from product matches when
   present) into a new `grocery_lists` row via the store; returns the list
   id so the agent can tell the user where it went. When the user has
   exactly one household, default to it; otherwise require the id.
2. Instructions update in `agents/grocery/instructions.md`: after
   `mark_list_ready`, offer to save to the shared list; when planning,
   mention items already on the active shared list if the user asks.
3. Contract update if `GroceryState` gains fields — regenerate
   `packages/types` schemas rather than hand-editing generated files.

## Milestone 4 — Mobile (apps/grocery-mobile)

1. `src/lib/household-api.ts`: typed fetch client for the endpoints above,
   using the same authenticated-request helper pattern as `lib/auth.ts`
   (Clerk token + `x-clerk-user-id`).
2. Screens:
   - `/households` — list households, create one, join by code (paste
     code v1; deep link `groceryagent://join/<code>` can follow).
   - `/shared-list` (or extend the existing `/list` screen) — items with
     check-off, who-added attribution line, add-item composer,
     pull-to-refresh; refetch on focus + 30s interval while focused.
3. Chat menu gains "Shared lists" entry next to Saved recipes.
4. Empty/error states use the existing `InlineError`/card patterns.
5. Unit tests for the API client (fetch mocked) and any list-merging
   logic; keep component logic thin.

## Acceptance (end of v1)

- User A creates a household and an invite code; user B joins with the
  code; both add and check off items on the same list from separate
  devices, and each sees the other's changes within one poll interval.
- Agent can save a ready plan into the household list via chat.
- `pnpm check && pnpm test` and `go test ./...` (workspace) pass; D1
  migration applies cleanly on a fresh database.

## Explicitly out of scope for v1

Push notifications, realtime fan-out, item claiming/split shopping, list
comments, offline queueing, multiple stores, web UI.
