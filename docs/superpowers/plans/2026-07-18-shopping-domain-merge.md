# Shopping Domain Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Coding delegation (user requirement):** ALL coding steps are executed by **codex subagents** (`Agent` tool with `subagent_type: "codex:codex-rescue"`). Before dispatching the first one, load `codex:codex-cli-runtime`, `codex:codex-result-handling`, and `codex:gpt-5-4-prompting` via the Skill tool. The orchestrating session only reviews diffs, runs verification commands, and commits.

**Goal:** Make agents-gateway (Go/Railway/D1) the single owner of all `/api/grocery/*` data — the pre-existing household/list/recipe library AND the shopping-profile domains (pantry, equipment, orders, preferred store) moved out of ai-shopping-mcp's KV — with the entire surface driven by one hand-authored OpenAPI 3.1 spec, so any client (the Worker, other Go services, future apps) can be generated from it instead of hand-matched.

**Architecture:** `agents/api/openapi/grocery-gateway.yaml` is the single source of truth for the `/api/grocery/*` wire contract — hand-authored, checked in, versioned with the Go module it describes. `oapi-codegen` (pinned as a Go tool dependency) generates Go types, a `StrictServerInterface`, and a Go client into `agents/internal/groceryapi/generated.go`; the gateway's `groceryAPI`/`shoppingAPI` handlers implement that interface (compile-time enforced — a handler that drifts from the spec fails to build) instead of hand-registering `mux.HandleFunc` routes. `openapi-typescript` generates the Worker's typed `openapi-fetch` client from the same YAML file (no intermediary). D1 grows a `ShoppingRepository` for the new domains; the Go grocery/wellness agents gain native ADK function tools over that same repository (in-process, mirroring the existing `savedResourceTools` pattern), and the Kroger MCP toolset is filtered to Kroger-only tools since the Worker's inventory/profile/order tools are superseded. `cmd/contracts` (the existing Go-canonical generator for agent _runtime state_ — `GroceryState`, `TripState`, etc.) is untouched; it is a different contract (session/state shape for the AG-UI stream) from the `/api/grocery/*` HTTP contract this plan covers.

**Tech Stack:** Go 1.26 (`net/http` mux, `google.golang.org/adk/v2`, `oapi-codegen/v2` as a `go tool` dependency), Cloudflare Workers TS (zod v4, neverthrow, `openapi-fetch` + `openapi-typescript`), D1 via Cloudflare HTTP API, pnpm + turbo.

## Global Constraints

- Use `pnpm`; verify with `pnpm check && pnpm test` (repo root). Go-only verification: `pnpm --filter agents test` (= `go test -race ./...`), `pnpm --filter agents lint`, `pnpm --filter agents typecheck`.
- D1 and R2 are mandatory; do not add alternate persistence. Keep Worker names (`ai-meal-planner-mcp`), bindings, and D1 migration history stable — append migration `006`, never edit `001`–`005`.
- Review Go agent changes against the ADK Go reference (https://pkg.go.dev/google.golang.org/adk/v2).
- ai-shopping-mcp: preserve the small-model contract (required IDs in `content[0].text` as `key=value`, responses name the next/recovery tool); never expose refresh tokens through runtime `Props`; validate external JSON from `unknown` with Zod; cache only product/location responses; run `pnpm --filter ai-shopping-list-mcp build && pnpm --filter ai-shopping-list-mcp test` before handoff, plus `pnpm --filter ai-shopping-list-mcp eval:mcp` for response/schema changes.
- `agents/api/openapi/grocery-gateway.yaml` is **hand-authored** — it is not machine-generated and has no "DO NOT EDIT" header. Everything derived from it (`agents/internal/groceryapi/generated.go`, `apps/ai-shopping-mcp/src/services/gateway/schema.d.ts`) IS generated, is checked in, and must stay byte-identical to what its generator produces (`pnpm check` fails otherwise).
- Gateway prod URL: `https://agents-gateway.up.railway.app`. Worker prod URL: `https://ai-meal-planner-mcp.aranlucas.workers.dev`.
- Commit after every task with a conventional-commit message.

## Existing seams (read before any task)

- `agents/internal/groceries/store.go` — D1-backed `Store` (`NewStoreWithArtifacts`). Exact types (verified by reading the source, use these json tags verbatim — do not invent fields):
  - `Household{ID, Name, Role, CreatedBy string; CreatedAt int64}`
  - `Invite{Code, HouseholdID, CreatedBy string; ExpiresAt int64; MaxUses, UsedCount int}`
  - `List{ID string; HouseholdID *string; OwnerUserID, Title, Status string; ArtifactVersion int64 "omitempty"; CreatedAt, UpdatedAt int64; Items []Item}`
  - `Item{ID, ListID, Name, Quantity string; Note *string; Position int; AddedBy string; CheckedBy *string; CheckedAt *int64; UpdatedAt int64}` — Task 2 adds `Upc *string "upc,omitempty"`, backed by the `grocery_list_item_upcs` side table (Task 1), not a native column.
  - `NewItem{Name, Quantity string; Note *string "omitempty"}` — Task 2 adds `Upc *string "upc,omitempty"`, same side-table storage.
  - `ItemPatch{Name, Quantity, Note *string "omitempty"; Checked *bool "omitempty"}`
  - Sentinel errors `ErrNotFound/ErrForbidden/ErrInvalid/ErrInviteExpired/ErrInviteExhausted`. Tests use an `httptest` fake of the Cloudflare D1 HTTP API (see `store_test.go`).
- `agents/internal/groceries/library.go` — exact types:
  - `SavedListInput{HouseholdID *string "omitempty"; Title string; Items []NewItem}`
  - `ListPatch{Title, Status *string "omitempty"}`
  - `Recipe{ID string; HouseholdID *string; OwnerUserID, Title, Description, Servings, Notes, Status string; ArtifactVersion int64 "omitempty"; CreatedAt, UpdatedAt int64; Ingredients []Ingredient; Steps []RecipeStep; Tags []string}`
  - `Ingredient{ID, RecipeID, Name, Quantity, Unit, Note string; Position int}`
  - `RecipeStep{ID, RecipeID, Instruction string; Position int}`
  - `NewIngredient{Name string; Quantity, Unit, Note string "omitempty"}`
  - `RecipeContent{Title string; Description, Servings, Notes string "omitempty"; Ingredients []NewIngredient; Steps []string; Tags []string "omitempty"}`
  - `SavedRecipeInput{HouseholdID *string "omitempty"; RecipeContent embedded}`
  - `LibraryRepository` interface — `*Store` implements it.
- `agents/cmd/gateway/grocery_api.go` — current `/api/grocery/*` handlers (to be flipped onto the generated interface in Task 4). Request wrapper types: `createHouseholdRequest{Name string}`, `createInviteRequest{MaxUses int}`, `createGroceryListRequest{HouseholdID *string; Title string; Items []NewItem "omitempty"}`, `addGroceryItemsRequest{Items []NewItem}`. Helpers `writeGroceryAPIError(w, err)` (maps sentinel errors → 400/403/404/409/410/503 with codes `invalid_grocery_request/grocery_forbidden/grocery_not_found/grocery_invite_expired/grocery_invite_exhausted/grocery_api_unavailable`), `writeGroceryJSON`, `decodeGroceryRequest[T]`, `groceryUserID`.
- `agents/cmd/gateway/main.go` — `withOAuthCredentials` injects `X-Kroger-Access-Token` from Clerk OAuth connections; `registerGroceryAPI(mux, deps.Groceries, deps.Now)` at line ~167; `publicRoutes` map passed to `auth.RequireIdentity` (supports `*` prefix patterns).
- `agents/internal/auth` — `Identity{UserID, Public}`, `FromContext(ctx) (Identity, bool)`, `RequireIdentity(publicRoutes, next, verifiers...)`.
- `agents/grocery/saved_resources.go` — the pattern for repository-backed ADK function tools (`functiontool.New`, results carrying `*agentruntime.StructuredError`, `readState(ctx.State())`, `ctx.UserID()`).
- `agents/grocery/kroger.go` — MCP toolset pulling ALL worker tools with bearer token from session temp state.
- `agents/cmd/contracts/main.go` — **unrelated to this plan**, do not modify. Generates `packages/types/src/generated/agent-contracts.ts` and per-agent JSON Schemas from Go _agent state_ structs (`GroceryState`, etc.) via `jsonschema.ForType`. That is the AG-UI session-state contract, not the `/api/grocery/*` HTTP contract.
- `apps/ai-shopping-mcp/src/utils/user-storage.ts` — `ShoppingPersistence` (KV) with domains `preferredLocation, pantry, equipment, shoppingList, cartSnapshot, cartMirror, cartId, orderHistory`. Tools only touch `ctx.storage.<domain>.<method>` — this is the swap seam.
- `apps/ai-shopping-mcp/src/services/kroger/client.ts` — existing `openapi-fetch` typed-client pattern to mirror for the gateway client.
- Repo build wiring: root `package.json` `"check": "turbo run lint typecheck fmt:check contracts:check"`, `turbo.json` has a `"contracts:check": {"cache": false}` task. This plan adds a parallel `api:check` task the same way.

---

### Task 1: D1 migration 006 — shopping-profile tables + list-item UPC

_(Unchanged from the original plan revision; already dispatched to a codex implementer against `docs/superpowers/plans/2026-07-18-shopping-domain-merge.md` Task 1 as extracted to `.superpowers/sdd/task-1-brief.md`. If resuming this plan later and Task 1 is not yet marked complete in `.superpowers/sdd/progress.md`, re-extract with `scripts/task-brief` — the content below is authoritative.)_

**Files:**

- Create: `agents/migrations/d1/006_shopping_profile.sql`
- Modify: `agents/migrations/d1/embed.go`
- Modify: `agents/internal/cloudflare/migrations.go`

**Interfaces:**

- Consumes: nothing.
- Produces: tables `pantry_items`, `equipment_items`, `shopping_orders`, `shopping_order_items`, `preferred_stores`, `kroger_account_links`, `grocery_list_item_upcs` (a side table, not a column on `grocery_list_items` — see the idempotency note in Step 1). Timestamps are unix **seconds**.

- [ ] **Step 1: Write the migration SQL**

```sql
-- 006_shopping_profile.sql
-- Shopping-profile domains moved from the ai-shopping-mcp Worker's KV into D1,
-- plus the Kroger-sub -> Clerk identity link that unifies both surfaces.

CREATE TABLE IF NOT EXISTS pantry_items (
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    added_at INTEGER NOT NULL,
    expires_at INTEGER,
    PRIMARY KEY (user_id, name_key)
);

CREATE TABLE IF NOT EXISTS equipment_items (
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL,
    category TEXT,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, name_key)
);

CREATE TABLE IF NOT EXISTS shopping_orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    total_items INTEGER NOT NULL,
    estimated_total REAL,
    placed_at INTEGER NOT NULL,
    location_id TEXT,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS shopping_orders_user
    ON shopping_orders (user_id, placed_at DESC);

CREATE TABLE IF NOT EXISTS shopping_order_items (
    order_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    upc TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL,
    PRIMARY KEY (order_id, position),
    FOREIGN KEY (order_id) REFERENCES shopping_orders (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS preferred_stores (
    user_id TEXT PRIMARY KEY,
    location_id TEXT NOT NULL,
    name TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    chain TEXT NOT NULL DEFAULT '',
    set_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kroger_account_links (
    kroger_sub TEXT PRIMARY KEY,
    clerk_user_id TEXT NOT NULL,
    linked_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS kroger_account_links_clerk
    ON kroger_account_links (clerk_user_id);

-- Side table instead of ALTER TABLE grocery_list_items ADD COLUMN: both the
-- production runner (runMigration in migrations.go) and
-- TestEmbeddedMigrationsExecuteTwiceAndProduceRequiredSchema execute every
-- migration's SQL twice against a real SQLite/D1 connection, and SQLite has
-- no ADD COLUMN IF NOT EXISTS, so a plain ALTER TABLE breaks idempotency on
-- the second run. CREATE TABLE IF NOT EXISTS keeps it idempotent without
-- touching shared migration-runner code.
CREATE TABLE IF NOT EXISTS grocery_list_item_upcs (
    item_id TEXT PRIMARY KEY,
    upc TEXT NOT NULL
);
```

**Note on SQL comments:** the migration splitter (`runMigration` in `migrations.go`, and the mirrored logic in `TestEmbeddedMigrationsExecuteTwiceAndProduceRequiredSchema`) does `strings.SplitSeq(source, ";")` with no comment awareness — a `;` inside a `--` comment line produces a spurious split and a malformed statement. Do not put a semicolon inside any comment in this file (the sentence above intentionally avoids one).

- [ ] **Step 2: Register the migration**

In `embed.go` add:

```go
// ShoppingProfile is the pantry/equipment/orders/preferred-store schema and
// the Kroger account-link table.
//
//go:embed 006_shopping_profile.sql
var ShoppingProfile string
```

In `migrations.go`: set `LatestMigrationVersion = "006_shopping_profile"`, append `{version: LatestMigrationVersion, source: d1migrations.ShoppingProfile}` to `migrations` (change the 005 entry to the literal `"005_saved_grocery_resources"`), append the seven new tables (including `grocery_list_item_upcs`) to `requiredSchemaTables` — do **not** add `"upc"` to the `grocery_list_items` column list, there is no such column — and add `"shopping_orders_user"` + `"kroger_account_links_clerk"` to `requiredSchemaIndexes`.

- [ ] **Step 3: Run** `cd agents && go test -race ./internal/cloudflare/...` — expect PASS.
- [ ] **Step 4: Commit** `feat(gateway): add shopping-profile D1 schema (006)`

---

### Task 2: `internal/groceries` — ShoppingRepository (Go domain layer)

**Files:**

- Create: `agents/internal/groceries/shopping.go`
- Modify: `agents/internal/groceries/store.go` (add `Upc *string` to `Item`/`NewItem`; `GetList`'s item query; `AddItems`; `DeleteItem`; new shared `upcStatement` helper — see the exact call-site table below)
- Modify: `agents/internal/groceries/library.go` (`SaveList`, `ReplaceListItems`, `newListItem` — these also construct/insert list items and were missed in the first pass of this plan; see below)
- Test: `agents/internal/groceries/shopping_test.go` (fake-D1 `httptest` pattern from `store_test.go`)

**UPC call-site map (ground truth — verified by reading the current source, not guessed).** There are FOUR places `grocery_list_items` rows are read/written, not one:

| Function           | File           | What it does today                                                                                                                                                    | UPC change needed                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GetList`          | store.go:318   | `SELECT ... FROM grocery_list_items WHERE list_id = ?` (unaliased), decoded via `decodeItem`'s generic `json.Unmarshal`                                               | Add `LEFT JOIN grocery_list_item_upcs glu ON glu.item_id = gli.id` and `glu.upc AS upc` to the SELECT (alias the base table `gli`). No Go code change needed in `decodeItem` — `Item.Upc`'s `json:"upc,omitempty"` tag picks it up automatically since D1 rows decode by column-name-as-JSON-key.                                                                                               |
| `AddItems`         | store.go:365   | Builds its own `INSERT INTO grocery_list_items (...)` per item inline (does NOT call `newListItem` — pre-existing duplication, out of scope to fix)                   | After each item's insert statement, append `upcStatement(id, input.Upc)` (nil-safe) to `statements` if non-nil.                                                                                                                                                                                                                                                                                 |
| `DeleteItem`       | store.go:505   | `DELETE FROM grocery_list_items WHERE id = ? AND list_id = ? AND ...`                                                                                                 | Append `cloudflare.Statement{SQL: "DELETE FROM grocery_list_item_upcs WHERE item_id = ?", Params: []any{itemID}}` to the same batch (order doesn't matter here — no FK).                                                                                                                                                                                                                        |
| `SaveList`         | library.go:104 | Loops `input.Items`, calls `s.newListItem(...)` to build the `Item` struct, then appends its own `INSERT INTO grocery_list_items (...)` per item                      | `newListItem` (below) already threads `Upc` onto the returned `Item`; after each item's insert statement, append `upcStatement(item.ID, item.Upc)` if non-nil.                                                                                                                                                                                                                                  |
| `ReplaceListItems` | library.go:224 | `DELETE FROM grocery_list_items WHERE list_id = ?` then re-inserts every item via `newListItem`                                                                       | Add a **cleanup delete** `DELETE FROM grocery_list_item_upcs WHERE item_id IN (SELECT id FROM grocery_list_items WHERE list_id = ?)` as the FIRST statement in `statements`, before the `DELETE FROM grocery_list_items` (D1 batches execute sequentially — this subselect must see the not-yet-deleted rows). Then, same as `SaveList`, append `upcStatement(item.ID, item.Upc)` per new item. |
| `newListItem`      | library.go:614 | `func (s *Store) newListItem(listID, userID string, input NewItem, position int, updatedAt int64) (Item, error)` — validates and builds an `Item` (does not touch D1) | Set `item.Upc` from `input.Upc` (trimmed; empty string after trim → leave nil; `ErrInvalid` if `len(*input.Upc) > 32`). This is the single place both `SaveList` and `ReplaceListItems` get their `Item`, so validation lives here once.                                                                                                                                                        |

Shared helper (put it in `store.go`, next to `decodeItem`/`stringPointer`):

```go
func upcStatement(itemID string, upc *string) *cloudflare.Statement {
    if upc == nil {
        return nil
    }
    return &cloudflare.Statement{
        SQL:    `INSERT OR REPLACE INTO grocery_list_item_upcs (item_id, upc) VALUES (?, ?)`,
        Params: []any{itemID, *upc},
    }
}
```

Each of the three write call sites appends the result to its `statements` slice only when non-nil (`if stmt := upcStatement(id, upc); stmt != nil { statements = append(statements, *stmt) }`).

**Interfaces:**

- Consumes: `Store`'s existing D1 batch helpers in `store.go`.
- Produces (exact — later tasks depend on these names):

```go
type PantryItem struct {
    Name      string  `json:"name"`
    Quantity  float64 `json:"quantity"`
    AddedAt   int64   `json:"added_at"`
    ExpiresAt *int64  `json:"expires_at,omitempty"`
}

type EquipmentItem struct {
    Name     string  `json:"name"`
    Category *string `json:"category,omitempty"`
    AddedAt  int64   `json:"added_at"`
}

type OrderItem struct {
    UPC      string   `json:"upc"`
    Name     string   `json:"name"`
    Quantity int      `json:"quantity"`
    Price    *float64 `json:"price,omitempty"`
}

type Order struct {
    ID             string      `json:"id"`
    Items          []OrderItem `json:"items"`
    TotalItems     int         `json:"total_items"`
    EstimatedTotal *float64    `json:"estimated_total,omitempty"`
    PlacedAt       int64       `json:"placed_at"`
    LocationID     *string     `json:"location_id,omitempty"`
    Notes          *string     `json:"notes,omitempty"`
}

type PreferredStore struct {
    LocationID string `json:"location_id"`
    Name       string `json:"name"`
    Address    string `json:"address"`
    Chain      string `json:"chain"`
    SetAt      int64  `json:"set_at"`
}

type FrequentItem struct {
    Name          string `json:"name"`
    UPC           string `json:"upc"`
    Orders        int    `json:"orders"`
    TotalQuantity int    `json:"total_quantity"`
}

type ShoppingProfile struct {
    PreferredStore *PreferredStore `json:"preferred_store,omitempty"`
    Pantry         []PantryItem    `json:"pantry"`
    Equipment      []EquipmentItem `json:"equipment"`
    RecentOrders   []Order         `json:"recent_orders"`
    FrequentItems  []FrequentItem  `json:"frequent_items"`
}

type ShoppingRepository interface {
    Pantry(ctx context.Context, userID string) ([]PantryItem, error)
    AddPantryItems(ctx context.Context, userID string, items []PantryItem, now time.Time) ([]PantryItem, error)
    RemovePantryItems(ctx context.Context, userID string, names []string) ([]PantryItem, error)
    SetPantryQuantity(ctx context.Context, userID, name string, quantity float64) ([]PantryItem, error)
    ClearPantry(ctx context.Context, userID string) error
    Equipment(ctx context.Context, userID string) ([]EquipmentItem, error)
    AddEquipment(ctx context.Context, userID string, items []EquipmentItem, now time.Time) ([]EquipmentItem, error)
    RemoveEquipment(ctx context.Context, userID string, names []string) ([]EquipmentItem, error)
    ClearEquipment(ctx context.Context, userID string) error
    RecordOrder(ctx context.Context, userID string, order Order, now time.Time) (Order, error)
    RecentOrders(ctx context.Context, userID string, limit int) ([]Order, error)
    PreferredStore(ctx context.Context, userID string) (*PreferredStore, error)
    SetPreferredStore(ctx context.Context, userID string, store PreferredStore, now time.Time) error
    ClearPreferredStore(ctx context.Context, userID string) error
    ShoppingProfile(ctx context.Context, userID string) (ShoppingProfile, error)
    ResolveShopper(ctx context.Context, krogerSub string) (string, error)
    LinkKrogerAccount(ctx context.Context, krogerSub, clerkUserID string, now time.Time) error
}
```

`*Store` implements `ShoppingRepository`. Also: `Item` gains `Upc *string \`json:"upc,omitempty"\``, `NewItem`gains`Upc *string \`json:"upc,omitempty"\``(trimmed, ≤ 32 chars, else`ErrInvalid`) at the JSON/API level. **Storage:** per Task 1, there is no `upc`column on`grocery_list_items`— UPCs live in the side table`grocery_list_item_upcs(item_id TEXT PRIMARY KEY, upc TEXT NOT NULL)`. `GetList`/list-fetch queries must `LEFT JOIN grocery_list_item_upcs ON grocery_list_item_upcs.item_id = grocery_list_items.id`and populate`Item.Upc`from it.`SaveList`and`AddItems`must, in the same D1 batch as the item insert, also`INSERT OR REPLACE INTO grocery_list_item_upcs (item_id, upc) VALUES (?, ?)`for every`NewItem`whose`Upc`is non-nil.`UpdateItem`/`ItemPatch`does not need an UPC field (not in the existing`ItemPatch`struct — out of scope).`DeleteItem`must additionally`DELETE FROM grocery_list_item_upcs WHERE item_id = ?`in the same batch — do not rely on a foreign key or`ON DELETE CASCADE`, D1's SQLite wrapper is not guaranteed to have `PRAGMA foreign_keys = ON`, and this table has no FK constraint (Task 1 intentionally omits one).

- [ ] **Step 1: Write failing tests** in `shopping_test.go` using the fake-D1 server pattern. Minimum cases:
  - `TestAddPantryItemsMergesCaseInsensitiveNames` — adding "Eggs" then "eggs" yields one row keyed `name_key = lower(trim(name))`, quantity summed, `added_at` refreshed.
  - `TestRecordOrderWritesOrderAndItemsInOneBatch` — order + items land in one D1 batch; `RecentOrders` returns newest-first with items ordered by `position`.
  - `TestResolveShopperFallsBackToKrogerNamespace` — unknown sub returns `"kroger:" + sub`, linked sub returns the Clerk id.
  - `TestLinkKrogerAccountRekeysNamespacedRows` — after linking, rows previously under `kroger:<sub>` in `pantry_items`, `equipment_items`, `shopping_orders`, `preferred_stores`, `grocery_lists`, `recipes` are re-keyed to the Clerk id via `UPDATE OR IGNORE` + cleanup `DELETE` of leftovers; the link row is upserted (`INSERT OR REPLACE`).
  - `TestSaveListPersistsItemUPC` — `SaveList` with `NewItem{Name: "Milk", Quantity: "1", Upc: ptr("0001111041700")}` round-trips through `GetList` (i.e. the join against `grocery_list_item_upcs` returns it).
  - `TestDeleteItemRemovesUPCRow` — deleting an item with a UPC also removes its `grocery_list_item_upcs` row in the same batch.
  - `TestReplaceListItemsCleansUpOrphanedUPCRows` — `ReplaceListItems` on a list whose current items have UPCs, replacing with a new item set, leaves no stale `grocery_list_item_upcs` rows for the removed items and correctly persists UPCs for the new ones.
  - `TestAddItemsPersistsUPC` — `AddItems` with a UPC-bearing `NewItem` is visible via a subsequent `GetList`.
- [ ] **Step 2: Run** `cd agents && go test -race ./internal/groceries/ -run 'Pantry|Order|Shopper|Kroger|UPC'` — expect FAIL (undefined types/methods).
- [ ] **Step 3: Implement** `shopping.go` on `*Store` following `store.go`'s existing batch/scan helpers. Merge-add pantry via `INSERT INTO pantry_items ... ON CONFLICT(user_id, name_key) DO UPDATE SET quantity = pantry_items.quantity + excluded.quantity, added_at = excluded.added_at, expires_at = COALESCE(excluded.expires_at, pantry_items.expires_at)`. Equipment conflict updates `category = COALESCE(excluded.category, equipment_items.category)`. `FrequentItems` via `SELECT name, upc, COUNT(DISTINCT order_id), SUM(quantity) FROM shopping_order_items JOIN shopping_orders ON ... WHERE user_id = ? GROUP BY lower(name) ORDER BY COUNT(DISTINCT order_id) DESC LIMIT 20`. Cap `RecentOrders` limit at 50. Validate inputs (`ErrInvalid` for empty user id/name, quantity < 0).
- [ ] **Step 4: Run** the tests — expect PASS. Then full `go test -race ./internal/groceries/...`.
- [ ] **Step 5: Commit** `feat(gateway): D1-backed shopping repository (pantry, equipment, orders, store, kroger links)`

---

### Task 3: Hand-author the OpenAPI spec + wire oapi-codegen

**Files:**

- Create: `agents/api/openapi/grocery-gateway.yaml` (hand-authored source of truth, checked in, hand-edited going forward — no generated header)
- Create: `agents/internal/groceryapi/oapi-codegen.yaml`
- Create (generated, checked in): `agents/internal/groceryapi/generated.go`
- Modify: `agents/go.mod` (adds a `tool` directive), `agents/go.sum`
- Modify: `agents/package.json` (scripts `api:generate`, `api:check`)
- Modify: root `package.json` (scripts `api:generate` → `pnpm --filter agents api:generate`, `api:check` → `turbo api:check`; add `api:check` to the `check` script's turbo run list)
- Modify: `turbo.json` (add `"api:check": {"cache": false}` task, mirroring `contracts:check`)
- Test: none new (verification is generation determinism + compile), covered in Step 4 below.

**Interfaces:**

- Consumes: the exact Go types listed in "Existing seams" above (`Household`, `Invite`, `List`, `Item`, `NewItem`, `ItemPatch`, `SavedListInput`, `ListPatch`, `Recipe`, `Ingredient`, `RecipeStep`, `NewIngredient`, `RecipeContent`, `SavedRecipeInput`, the gateway request wrapper types) plus Task 2's `ShoppingRepository` types.
- Produces: `agents/internal/groceryapi` package exporting (oapi-codegen v2, `std-http-server: true` + `strict-server: true` + `client: true` + `embedded-spec: true`):
  - `type StrictServerInterface interface { <one method per operationId below> }` — e.g. `GetApiGroceryPantry(ctx context.Context, request GetApiGroceryPantryRequestObject) (GetApiGroceryPantryResponseObject, error)`.
  - `func NewStrictHandler(ssi StrictServerInterface, middlewares []StrictMiddlewareFunc) ServerInterface`
  - `func HandlerFromMux(si ServerInterface, m *http.ServeMux) http.Handler`
  - `func NewClient(server string, opts ...ClientOption) (*Client, error)` (a generated Go HTTP client — usable by any future Go service that wants to call the gateway directly instead of embedding an in-process repository).
  - Request/response types and per-operation `Op200JSONResponse` / `OpdefaultJSONResponse` types.

**The route table (exact — every field is authoritative for the YAML you write):**

Shared components:

```yaml
components:
  parameters:
    ShoppingServiceSecret:
      { name: x-shopping-service-secret, in: header, required: false, schema: { type: string } }
    ShoppingUserId:
      { name: x-shopping-user-id, in: header, required: false, schema: { type: string } }
  responses:
    GroceryError:
      description: Structured grocery API error
      content:
        application/json:
          schema:
            type: object
            required: [error]
            properties: { error: { type: string } }
  securitySchemes:
    clerkBearer:
      {
        type: http,
        scheme: bearer,
        description: "Clerk session JWT, verified by agents/internal/auth upstream of this router.",
      }
```

Every operation below: `security: [{clerkBearer: []}, {}]` (bearer optional at the spec level — `shopperID`'s dual-auth logic, not spec-level security, is what actually enforces it), `parameters` includes `ShoppingServiceSecret` + `ShoppingUserId` refs alongside any path/query params, and `responses.default` is `$ref: '#/components/responses/GroceryError'`.

| operationId (→ Go method)                         | Method & Path                                 | Query/Path params            | Request schema                                                       | Success response               |
| ------------------------------------------------- | --------------------------------------------- | ---------------------------- | -------------------------------------------------------------------- | ------------------------------ |
| `createHousehold` → `CreateHousehold`             | POST /api/grocery/households                  | —                            | `{name: string}`                                                     | 201 `Household`                |
| `listHouseholds` → `ListHouseholds`               | GET /api/grocery/households                   | —                            | —                                                                    | 200 `Household[]`              |
| `createInvite` → `CreateInvite`                   | POST /api/grocery/households/{id}/invites     | path `id`                    | `{max_uses?: integer}`                                               | 201 `Invite`                   |
| `joinHousehold` → `JoinHousehold`                 | POST /api/grocery/invites/{code}/join         | path `code`                  | —                                                                    | 200 `Household`                |
| `listLists` → `ListLists`                         | GET /api/grocery/lists                        | query `householdId?: string` | —                                                                    | 200 `List[]`                   |
| `getList` → `GetList`                             | GET /api/grocery/lists/{id}                   | path `id`                    | —                                                                    | 200 `List`                     |
| `createList` → `CreateList`                       | POST /api/grocery/lists                       | —                            | `{household_id?: string, title: string, items?: NewItem[]}`          | 201 `List`                     |
| `updateList` → `UpdateList`                       | PATCH /api/grocery/lists/{id}                 | path `id`                    | `ListPatch`                                                          | 200 `List`                     |
| `addItems` → `AddItems`                           | POST /api/grocery/lists/{id}/items            | path `id`                    | `{items: NewItem[]}`                                                 | 201 `Item[]`                   |
| `updateItem` → `UpdateItem`                       | PATCH /api/grocery/lists/{id}/items/{itemId}  | path `id`, `itemId`          | `ItemPatch`                                                          | 200 `Item`                     |
| `deleteItem` → `DeleteItem`                       | DELETE /api/grocery/lists/{id}/items/{itemId} | path `id`, `itemId`          | —                                                                    | 204                            |
| `listRecipes` → `ListRecipes`                     | GET /api/grocery/recipes                      | query `householdId?: string` | —                                                                    | 200 `Recipe[]`                 |
| `getRecipe` → `GetRecipe`                         | GET /api/grocery/recipes/{id}                 | path `id`                    | —                                                                    | 200 `Recipe`                   |
| `createRecipe` → `CreateRecipe`                   | POST /api/grocery/recipes                     | —                            | `SavedRecipeInput`                                                   | 201 `Recipe`                   |
| `updateRecipe` → `UpdateRecipe`                   | PUT /api/grocery/recipes/{id}                 | path `id`                    | `RecipeContent`                                                      | 200 `Recipe`                   |
| `getPantry` → `GetPantry`                         | GET /api/grocery/pantry                       | —                            | —                                                                    | 200 `{items: PantryItem[]}`    |
| `addPantryItems` → `AddPantryItems`               | POST /api/grocery/pantry                      | —                            | `{items: [{name: string, quantity?: number, expires_at?: integer}]}` | 200 `{items: PantryItem[]}`    |
| `removePantryItems` → `RemovePantryItems`         | POST /api/grocery/pantry/remove               | —                            | `{names?: string[], all?: boolean}`                                  | 200 `{items: PantryItem[]}`    |
| `setPantryItemQuantity` → `SetPantryItemQuantity` | POST /api/grocery/pantry/quantity             | —                            | `{name: string, quantity: number}`                                   | 200 `{items: PantryItem[]}`    |
| `getEquipment` → `GetEquipment`                   | GET /api/grocery/equipment                    | —                            | —                                                                    | 200 `{items: EquipmentItem[]}` |
| `addEquipment` → `AddEquipment`                   | POST /api/grocery/equipment                   | —                            | `{items: [{name: string, category?: string}]}`                       | 200 `{items: EquipmentItem[]}` |
| `removeEquipment` → `RemoveEquipment`             | POST /api/grocery/equipment/remove            | —                            | `{names?: string[], all?: boolean}`                                  | 200 `{items: EquipmentItem[]}` |
| `getOrders` → `GetOrders`                         | GET /api/grocery/orders                       | query `limit?: integer`      | —                                                                    | 200 `{orders: Order[]}`        |
| `recordOrder` → `RecordOrder`                     | POST /api/grocery/orders                      | —                            | `Order` (id optional; server generates if absent)                    | 201 `Order`                    |
| `getPreferredStore` → `GetPreferredStore`         | GET /api/grocery/preferred-store              | —                            | —                                                                    | 200 `PreferredStore`           |
| `setPreferredStore` → `SetPreferredStore`         | PUT /api/grocery/preferred-store              | —                            | `PreferredStore` (`set_at` ignored; server-stamped)                  | 200 `PreferredStore`           |
| `deletePreferredStore` → `DeletePreferredStore`   | DELETE /api/grocery/preferred-store           | —                            | —                                                                    | 204                            |
| `getShoppingProfile` → `GetShoppingProfile`       | GET /api/grocery/profile                      | —                            | —                                                                    | 200 `ShoppingProfile`          |

**Component schemas** — one `components.schemas.<Name>` per Go type in "Existing seams" (`Household`, `Invite`, `List`, `Item`, `NewItem`, `ItemPatch`, `ListPatch`, `Recipe`, `Ingredient`, `RecipeStep`, `NewIngredient`, `RecipeContent`, `SavedRecipeInput`) and per Task 2 type (`PantryItem`, `EquipmentItem`, `OrderItem`, `Order`, `PreferredStore`, `FrequentItem`, `ShoppingProfile`) with fields/types/nullability matching the Go struct and json tags exactly (a field with `,omitempty` and no pointer is `required` in the response but absent when zero; a pointer field is `nullable: true` and not in `required`). Int64 timestamp fields are `type: integer, format: int64`.

- [ ] **Step 1:** `cd agents && go get -tool github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@latest` — adds a `tool` block to `go.mod` and updates `go.sum`. Run `go build ./...` to confirm the tool resolves.
- [ ] **Step 2:** Write `agents/api/openapi/grocery-gateway.yaml` — `openapi: 3.1.0`, `info: {title: Grocery Gateway API, version: "1.0.0"}`, the shared `components` block above, all 26 operations from the table with their exact schemas. Every operation needs a unique `operationId` exactly as in the table (oapi-codegen derives the Go method/type names from it verbatim).
- [ ] **Step 3:** Write `agents/internal/groceryapi/oapi-codegen.yaml`:

```yaml
package: groceryapi
output: generated.go
generate:
  models: true
  std-http-server: true
  strict-server: true
  client: true
  embedded-spec: true
```

- [ ] **Step 4:** Add to `agents/package.json` `scripts`:

```json
"api:generate": "go tool oapi-codegen -config internal/groceryapi/oapi-codegen.yaml api/openapi/grocery-gateway.yaml",
"api:check": "pnpm run api:generate && git diff --exit-code -- internal/groceryapi/generated.go"
```

- [ ] **Step 5:** Run `pnpm --filter agents api:generate` from repo root — `agents/internal/groceryapi/generated.go` is created. Run `cd agents && go build ./...` — expect PASS (the package compiles standalone; nothing implements `StrictServerInterface` yet, that's Tasks 4–5).
- [ ] **Step 6:** Wire root scripts: in root `package.json` add `"api:generate": "pnpm --filter agents api:generate"` and `"api:check": "turbo api:check"`, and change `"check"` to `"turbo run lint typecheck fmt:check contracts:check api:check"`. In `turbo.json` add `"api:check": {"cache": false}` next to the existing `"contracts:check"` entry.
- [ ] **Step 7:** Run `pnpm --filter agents api:check` — expect PASS (clean diff, nothing to commit beyond the generated file itself already being current). Run `pnpm --filter agents typecheck lint` — expect PASS.
- [ ] **Step 8: Commit** `feat(gateway): hand-authored OpenAPI 3.1 spec + oapi-codegen Go generation for /api/grocery/*`

---

### Task 4: Flip the existing grocery API handlers onto the generated interface

**Files:**

- Modify: `agents/cmd/gateway/grocery_api.go` — rewrite as `StrictServerInterface` method implementations
- Modify: `agents/cmd/gateway/main.go` — route registration
- Test: `agents/cmd/gateway/grocery_api_test.go` (adapt existing tests to call the new methods directly, behavior unchanged)

**Interfaces:**

- Consumes: `groceryapi.StrictServerInterface`, `groceryapi.NewStrictHandler`, `groceryapi.HandlerFromMux` (Task 3); `groceries.LibraryRepository` (unchanged).
- Produces: `type groceryAPI struct { repository groceries.LibraryRepository; now func() time.Time; inviteCode func() (string, error) }` now implements the 15 existing-surface methods from Task 3's table (`CreateHousehold` … `UpdateRecipe`). `registerGroceryAPI` becomes:

```go
func registerGroceryAPI(mux *http.ServeMux, api groceryapi.StrictServerInterface) {
    handler := groceryapi.NewStrictHandler(api, nil)
    groceryapi.HandlerFromMux(handler, mux)
}
```

Task 5 extends the same `groceryAPI` struct (renamed conceptually to cover the full surface, but keep the existing struct — do not split types) with the shopping-profile methods, so `registerGroceryAPI`'s single call in `main.go` ends up registering all 26 operations at once. This task only needs to satisfy the 15 existing ones; add stub/no-op is **not** acceptable — `groceryAPI` will not compile as a full `StrictServerInterface` until Task 5 adds the rest, so in THIS task register only the existing endpoints via `groceryapi.HandlerFromMux` called against a helper adapter that panics on the unimplemented methods, OR (preferred, avoids a throwaway adapter) do this task and Task 5 as one combined build unit: implement all 15 methods here, and leave `main.go`'s `registerGroceryAPI` call site exactly as it is today (still calling the pre-existing signature) until Task 5 finishes the remaining 11 methods and flips the call site once, in Task 5's commit. State this explicitly to the Task 5 implementer via this task's report.

- Behavior must be byte-identical to today: same status codes, same error-code strings (`invalid_grocery_request`, `grocery_forbidden`, `grocery_not_found`, `grocery_invite_expired`, `grocery_invite_exhausted`, `grocery_api_unavailable`), same auth (`groceryUserID` — unchanged, Clerk-only for this task; Task 5 adds the service-secret path via `shopperID` and swaps every handler here plus the new ones to call it).

- [ ] **Step 1: Record the baseline.** Run `cd agents && go test ./cmd/gateway/ -run TestCreateHousehold -v` (or any existing grocery_api test) against current `main` to see the exact JSON shapes asserted — these must not change.
- [ ] **Step 2: Rewrite each handler as a `StrictServerInterface` method.** Example for `createHousehold` (mirror this shape for the other 14):

```go
func (api groceryAPI) CreateHousehold(ctx context.Context, request groceryapi.CreateHouseholdRequestObject) (groceryapi.CreateHouseholdResponseObject, error) {
    userID, ok := groceryapi.ShopperFromContext(ctx) // see note below
    if !ok {
        return groceryapi.CreateHouseholddefaultJSONResponse{StatusCode: http.StatusUnauthorized, Body: groceryapi.Error{Error: "unauthorized"}}, nil
    }
    household, err := api.repository.CreateHousehold(ctx, userID, request.Body.Name, api.currentTime())
    if err != nil {
        return groceryErrorResponse[groceryapi.CreateHouseholddefaultJSONResponse](err), nil
    }
    return groceryapi.CreateHousehold201JSONResponse(household), nil
}
```

Since `StrictServerInterface` methods receive `context.Context` (not `*http.Request`), auth identity must travel through context — it already does: `auth.RequireIdentity` installs `Identity` into the request context via `identityContextKey`, and `groceryapi.HandlerFromMux`'s generated `http.Handler` wraps handlers such that `r.Context()` reaches your strict method unchanged (oapi-codegen's std-http-server passes `r.Context()` straight through — verify this against the actual generated `generated.go` from Task 3; if the generated signature differs, adapt to what was actually generated rather than this sketch). Do NOT add a `ShopperFromContext` helper that duplicates `auth.FromContext` — call `auth.FromContext(ctx)` directly, matching today's `groceryUserID` logic, just moved to accept `ctx` instead of `(w, r)`. Write a small `groceryUserIDFromContext(ctx context.Context) (string, bool)` that is `groceryUserID` minus the `http.ResponseWriter` write-on-failure (the strict method returns the 401 response value instead of writing directly).

- [ ] **Step 3: Write a shared error mapper** replacing `writeGroceryAPIError`'s direct-write version:

```go
func groceryErrorStatus(err error) (int, string) {
    switch {
    case errors.Is(err, groceries.ErrInvalid):
        return http.StatusBadRequest, "invalid_grocery_request"
    case errors.Is(err, groceries.ErrForbidden):
        return http.StatusForbidden, "grocery_forbidden"
    case errors.Is(err, groceries.ErrNotFound):
        return http.StatusNotFound, "grocery_not_found"
    case errors.Is(err, groceries.ErrInviteExpired):
        return http.StatusGone, "grocery_invite_expired"
    case errors.Is(err, groceries.ErrInviteExhausted):
        return http.StatusConflict, "grocery_invite_exhausted"
    default:
        return http.StatusServiceUnavailable, "grocery_api_unavailable"
    }
}
```

Each method's error branch builds that operation's generated `...defaultJSONResponse{StatusCode: status, Body: groceryapi.Error{Error: code}}` value — there is no shared generic helper across operations because each operation's default response type is distinct (Go generics over the per-operation generated types work if you constrain via a small interface `{StatusCode int}` setter — only add this if it removes real duplication after all 15 methods are written; do not add speculative generics before that's clear from the actual duplication).

- [ ] **Step 4: Update `main.go`** — no functional change to the registration call this task (see Interfaces note); this task's diff to `main.go` is limited to whatever import changes result from `grocery_api.go` moving into the `groceryapi`-typed world (e.g. `groceryapi` import may now be needed in `main.go` only if the `groceryAPI` struct's constructor signature changed — check before editing; if unchanged, `main.go` needs no edits in this task).
- [ ] **Step 5: Update `grocery_api_test.go`** to call the new strict methods directly (`api.CreateHousehold(ctx, groceryapi.CreateHouseholdRequestObject{Body: &groceryapi.CreateHouseholdJSONRequestBody{Name: "Home"}})`) instead of building `httptest.NewRequest` + calling a `http.HandlerFunc` — assert on the returned response object's concrete type and fields. Keep every existing test case (same inputs, same expected outputs); this is a mechanical port, not new coverage.
- [ ] **Step 6: Run** `cd agents && go test -race ./cmd/gateway/...` — expect PASS, identical assertions to before the port. `go vet ./...`, `pnpm --filter agents lint typecheck`.
- [ ] **Step 7: Commit** `refactor(gateway): flip existing grocery API handlers onto the generated StrictServerInterface`

---

### Task 5: Shopping-profile handlers + dual auth + lazy Kroger linking

**Files:**

- Create: `agents/cmd/gateway/shopping_api.go`
- Create: `agents/cmd/gateway/kroger_link.go`
- Modify: `agents/cmd/gateway/grocery_api.go` (add the 11 remaining `StrictServerInterface` methods' auth path — see below)
- Modify: `agents/cmd/gateway/main.go` (config, the real `registerGroceryAPI` call site now that `groceryAPI` implements the full interface, publicRoutes, `withOAuthCredentials` linker hook)
- Test: `agents/cmd/gateway/shopping_api_test.go`, `agents/cmd/gateway/kroger_link_test.go`

**Interfaces:**

- Consumes: `groceries.ShoppingRepository` (Task 2), `groceryapi.StrictServerInterface`'s remaining 11 methods (Task 3), `groceryAPI` struct and error mapper from Task 4.
- Produces: `groceryAPI` gains fields `shopping groceries.ShoppingRepository` and `serviceSecret string`, and implements `GetPantry`, `AddPantryItems`, `RemovePantryItems`, `SetPantryItemQuantity`, `GetEquipment`, `AddEquipment`, `RemoveEquipment`, `GetOrders`, `RecordOrder`, `GetPreferredStore`, `SetPreferredStore`, `DeletePreferredStore`, `GetShoppingProfile` (13 methods — table in Task 3 lists 13 new operations, not 11; use the table as ground truth).
- Dual-auth resolver (replaces `groceryUserIDFromContext` as the identity source for every one of the 26 methods — Task 4's 15 methods switch to calling this too, in this task, since this is where the service-secret path is introduced):

```go
// shopperID resolves the acting user from context: a Clerk identity
// installed by auth.RequireIdentity, or the ai-shopping-mcp Worker calling
// with the shared service secret + x-shopping-user-id (a Kroger subject) on
// behalf of a Kroger-authenticated user. Header values arrive as generated
// Params fields on each operation's typed request object — pass them in
// rather than re-reading raw headers.
func (api groceryAPI) shopperID(ctx context.Context, serviceSecret, shoppingUserID *string) (string, *groceryapi.Error, int) {
    if serviceSecret != nil && strings.TrimSpace(*serviceSecret) != "" {
        if api.serviceSecret == "" || subtle.ConstantTimeCompare([]byte(*serviceSecret), []byte(api.serviceSecret)) != 1 {
            return "", &groceryapi.Error{Error: "unauthorized"}, http.StatusUnauthorized
        }
        sub := ""
        if shoppingUserID != nil {
            sub = strings.TrimSpace(*shoppingUserID)
        }
        if sub == "" {
            return "", &groceryapi.Error{Error: "invalid_grocery_request"}, http.StatusBadRequest
        }
        userID, err := api.shopping.ResolveShopper(ctx, sub)
        if err != nil {
            code, msg := groceryErrorStatus(err)
            return "", &groceryapi.Error{Error: msg}, code
        }
        return userID, nil, 0
    }
    identity, ok := auth.FromContext(ctx)
    if !ok || identity.Public || strings.TrimSpace(identity.UserID) == "" {
        return "", &groceryapi.Error{Error: "unauthorized"}, http.StatusUnauthorized
    }
    return identity.UserID, nil, 0
}
```

Every operation's spec parameters include `ShoppingServiceSecret`/`ShoppingUserId` (Task 3), so every generated `...RequestObject` carries `Params.XShoppingServiceSecret *string` and `Params.XShoppingUserId *string` — pass those into `shopperID`.

- Config: `SHOPPING_SERVICE_SECRET` env var read in `main.go` alongside the telegram secret (`cfg.TelegramLinkSecret` pattern); empty ⇒ service-secret path always fails closed (the `api.serviceSecret == ""` branch above).
- `publicRoutes`: add `"/api/grocery/*": true` in `main.go` so a service-secret call (no Clerk bearer) reaches the strict handlers as `Identity{Public: true}` rather than being rejected by `auth.RequireIdentity` before it gets there — `shopperID` still independently rejects any request that has neither a valid service secret nor a valid Clerk identity.
- `kroger_link.go`:

```go
// krogerLinker links a Clerk user to their Kroger MCP subject the first time
// a grocery route runs with a Kroger token, so Worker-side (kroger:<sub>) and
// web-side (Clerk) shopping data become one dataset. Best-effort: failures
// are logged and dropped, never surfaced to the chat request in flight.
type krogerLinker struct {
    repo        groceries.ShoppingRepository
    userinfoURL string // KROGER_MCP_URL origin + "/userinfo"
    client      *http.Client
    mu          sync.Mutex
    linked      map[string]time.Time // clerkUserID -> last attempt
}

func newKrogerLinker(repo groceries.ShoppingRepository, krogerMCPURL string, client *http.Client) *krogerLinker
func (l *krogerLinker) Ensure(ctx context.Context, clerkUserID, krogerToken string)
```

`Ensure` runs in a goroutine from `withOAuthCredentials` (main.go) when `connections.KrogerToken != ""`, with a detached `context.WithTimeout(context.Background(), 10*time.Second)` and at most one attempt per `clerkUserID` per hour (guarded by `l.mu` + `l.linked`). It `GET`s `userinfoURL` with `Authorization: Bearer <krogerToken>`, decodes `{"sub": string}`, calls `repo.LinkKrogerAccount(ctx, sub, clerkUserID, time.Now())`.

- [ ] **Step 1: Write failing tests**:
  - `TestShoppingAPIRejectsWrongServiceSecret` — wrong secret → 401.
  - `TestShoppingAPIServiceCallResolvesKrogerNamespace` — fake `ShoppingRepository` asserts `ResolveShopper("abc")` is invoked and the handler acts as that resolved user.
  - `TestShoppingAPIRejectsAnonymousWithoutSecret` — no bearer, no secret → 401.
  - `TestPantryRoundTripThroughStrictMethods` — `AddPantryItems` then `GetPantry` returns them (fake repo).
  - `TestPreferredStoreNotFoundIs404`.
  - `TestKrogerLinkerLinksOncePerHour` — fake `/userinfo` server; two `Ensure` calls one HTTP hit.
- [ ] **Step 2: Run** `cd agents && go test ./cmd/gateway/ -run 'Shopping|KrogerLinker|Pantry'` — expect FAIL.
- [ ] **Step 3: Implement** `shopping_api.go`, `kroger_link.go`; move `shopperID` (above) into `grocery_api.go` or a new small `auth.go` colocated in `cmd/gateway`, and switch every one of the 26 `StrictServerInterface` methods (Task 4's 15 plus this task's 13 — table says 13, reconcile against the Task 3 table which is ground truth) to call it instead of `groceryUserIDFromContext`. Update `main.go`: env var, publicRoutes entry, real `registerGroceryAPI(mux, api)` call site (now that `groceryAPI` satisfies the whole interface), `withOAuthCredentials` linker hook (`go linker.Ensure(detachedCtx, identity.UserID, connections.KrogerToken)` — fire-and-forget, do not block the response on it).
- [ ] **Step 4: Run** `cd agents && go test -race ./cmd/gateway/...` — expect PASS. `pnpm --filter agents lint typecheck`.
- [ ] **Step 5: Commit** `feat(gateway): shopping-profile endpoints with service-secret auth and lazy Kroger account linking`

---

### Task 6: Worker typed gateway client + persistence swap

**Files:**

- Create: `apps/ai-shopping-mcp/src/services/gateway/schema.d.ts` (generated via `openapi-typescript`, checked in)
- Create: `apps/ai-shopping-mcp/src/services/gateway/client.ts`
- Create: `apps/ai-shopping-mcp/src/utils/gateway-storage.ts`
- Modify: `apps/ai-shopping-mcp/src/utils/user-storage.ts` (shrink to cart-only `CartPersistence`; export the storage interfaces)
- Modify: `apps/ai-shopping-mcp/src/tools/types.ts` (`ToolContext.storage: ShoppingStore; ToolContext.carts: CartStore`)
- Modify: `apps/ai-shopping-mcp/src/server.ts`, `apps/ai-shopping-mcp/src/env.ts`, `apps/ai-shopping-mcp/wrangler.jsonc` (`vars.GATEWAY_URL`), `apps/ai-shopping-mcp/package.json` (script `generate:gateway`)
- Modify: `apps/ai-shopping-mcp/src/tools/cart.ts` (`ctx.storage.cart*` → `ctx.carts.*`)
- Test: update mocks in `apps/ai-shopping-mcp/tests/**` (search `createShoppingPersistence`), add `tests/gateway-storage.test.ts`

**Interfaces:**

- Consumes: `agents/api/openapi/grocery-gateway.yaml` directly (Task 3 — hand-authored, so this points straight at the source file, no intermediate copy) and the live gateway endpoints (Tasks 4–5).
- Produces:

```ts
// src/services/gateway/client.ts
import createClient, { type Client } from "openapi-fetch";
import type { paths } from "./schema.js";

export type GatewayClient = Client<paths>;

export function createGatewayClient(
  baseUrl: string,
  serviceSecret: string,
  getUserId: () => string,
): GatewayClient {
  const client = createClient<paths>({ baseUrl });
  client.use({
    onRequest({ request }) {
      request.headers.set("x-shopping-service-secret", serviceSecret);
      request.headers.set("x-shopping-user-id", getUserId());
      return request;
    },
  });
  return client;
}
```

```ts
// src/utils/gateway-storage.ts — same tool-facing shapes as today's KV store,
// adapted from the gateway wire types (unix seconds -> ISO strings).
export interface ShoppingStore {
  preferredLocation: {
    get(): Promise<PreferredLocation | null>;
    set(location: PreferredLocation): Promise<void>;
    delete(): Promise<void>;
  };
  pantry: {
    getAll(): Promise<PantryItem[]>;
    add(items: PantryItem | PantryItem[]): Promise<PantryItem[]>;
    remove(names: string | string[]): Promise<PantryItem[]>;
    updateQuantity(productName: string, quantity: number): Promise<PantryItem[]>;
    clear(): Promise<void>;
  };
  equipment: {
    getAll(): Promise<EquipmentItem[]>;
    add(items: EquipmentItem | EquipmentItem[]): Promise<EquipmentItem[]>;
    remove(names: string | string[]): Promise<EquipmentItem[]>;
    clear(): Promise<void>;
  };
  shoppingList: {
    create(listId: string, name: string, items: ShoppingListItem[]): Promise<ShoppingList>;
    get(listId: string): Promise<ShoppingList | null>;
    clear(listId: string): Promise<void>;
  };
  orderHistory: {
    getAll(): Promise<OrderRecord[]>;
    add(order: OrderRecord): Promise<OrderRecord[]>;
    getRecent(limit?: number): Promise<OrderRecord[]>;
    clear(): Promise<void>;
  };
}

export function createGatewayShoppingStore(client: GatewayClient): ShoppingStore;
```

- Existing tool-facing types (`PantryItem` with `productName/quantity/addedAt/expiresAt?` etc.) stay exactly as declared today so **no tool file changes** beyond `cart.ts`'s `ctx.carts` rename. Field adapters live only inside `gateway-storage.ts` (`name→productName`, `added_at→addedAt` via `new Date(seconds * 1000).toISOString()`, etc.).
- `shoppingList.create` calls `POST /api/grocery/lists` (personal — no `household_id`) with items `{name: productName, quantity: String(quantity), note: notes ?? null, upc}` and returns a `ShoppingList` whose `id` is the gateway list id; `get` maps gateway `Item`s back (`quantity: Number.parseFloat(quantity) || 1`). `clear` is a no-op that resolves (gateway lists are durable; cart flow only reads).
- Every method wraps non-2xx/network failures by throwing — `safeStorage` in the tools already converts throws into tool errors, so error semantics are preserved.
- `user-storage.ts` keeps ONLY `cartSnapshot`, `cartMirror`, `cartId` as `class CartPersistence` (+ `createCartPersistence`); the moved domains and their zod schemas/keys are deleted.
- `server.ts` wiring inside `buildServer`:

```ts
const gatewayClient = createGatewayClient(
  env.GATEWAY_URL,
  env.SHOPPING_SERVICE_SECRET,
  () => getProps().id,
);
const storage = createGatewayShoppingStore(gatewayClient);
const carts = createCartPersistence(env.USER_DATA_KV, () => ({ userId: getProps().id, sessionId }));
```

- `env.ts`: `AppEnv` gains `GATEWAY_URL: string; SHOPPING_SERVICE_SECRET: string;`. `wrangler.jsonc`: add `"vars": { "GATEWAY_URL": "https://agents-gateway.up.railway.app" }`; document `wrangler secret put SHOPPING_SERVICE_SECRET` in the README deploy section. Run `pnpm --filter ai-shopping-list-mcp cf-typegen` after editing wrangler.jsonc.
- `package.json` script: `"generate:gateway": "openapi-typescript ../../agents/api/openapi/grocery-gateway.yaml -o src/services/gateway/schema.d.ts"`.

- [ ] **Step 1:** Run `pnpm --filter ai-shopping-list-mcp generate:gateway` (after adding the script) — `schema.d.ts` appears.
- [ ] **Step 2: Write failing tests** `tests/gateway-storage.test.ts` (mock `fetch` with the wire JSON, assert adapters: pantry add sends `{"items":[{"name":"Eggs","quantity":12}]}` and returns `productName: "Eggs"`; list create posts personal list with `upc`; headers carry secret + user id).
- [ ] **Step 3: Run** `pnpm --filter ai-shopping-list-mcp test` — new tests FAIL.
- [ ] **Step 4: Implement** client, gateway store, `CartPersistence` split, `ToolContext`/`server.ts`/`cart.ts` rewiring, env/wrangler changes; update existing test mocks (vitest-pool-workers env stubs `GATEWAY_URL`/`SHOPPING_SERVICE_SECRET`, replace `createShoppingPersistence` fixtures with an in-memory `ShoppingStore` fake).
- [ ] **Step 5: Run** `pnpm --filter ai-shopping-list-mcp build && pnpm --filter ai-shopping-list-mcp test && pnpm --filter ai-shopping-list-mcp eval:mcp` — PASS (eval:mcp because response text may change wording only if ids differ in shape; keep `listId=<id>` in `content[0].text` intact).
- [ ] **Step 6: Commit** `feat(shopping-mcp): back non-Kroger storage with typed agents-gateway client`

---

### Task 7: Go agents — native ADK shopping tools + Kroger-only MCP filter

**Files:**

- Create: `agents/grocery/shopping_tools.go`
- Modify: `agents/grocery/agent.go` (`newAgentWithLibrary` also appends shopping tools when the repository implements `groceries.ShoppingRepository`)
- Modify: `agents/grocery/kroger.go` (allowlist filter)
- Modify: `agents/grocery/instructions.md` (tool guidance: pantry/profile/orders are native tools; Kroger MCP is products/stores/cart/deals only)
- Test: `agents/grocery/shopping_tools_test.go`, extend `kroger_test.go`

**Interfaces:**

- Consumes: `groceries.ShoppingRepository` (Task 2); patterns from `saved_resources.go` (`functiontool.New`, `agentruntime.StructuredError` results, `ctx.UserID()`).
- Produces ADK tools (exact names): `get_shopping_profile`, `add_to_pantry`, `remove_from_pantry`, `add_equipment`, `remove_equipment`, `get_recent_orders`, `record_order`, `get_preferred_store`, `set_preferred_store`. Arg/result structs follow the `SavedResources` conventions, e.g.:

```go
type PantryArgs struct {
    Items []PantryItemInput `json:"items" jsonschema:"Pantry items to add; duplicate names merge case-insensitively."`
}
type PantryItemInput struct {
    Name      string   `json:"name"`
    Quantity  *float64 `json:"quantity,omitempty" jsonschema:"Defaults to 1."`
    ExpiresAt *string  `json:"expires_at,omitempty" jsonschema:"RFC3339 date, optional."`
}
type ShoppingProfileResult struct {
    Profile *groceries.ShoppingProfile    `json:"profile,omitempty"`
    Error   *agentruntime.StructuredError `json:"error,omitempty"`
}
```

- `kroger.go`: after `inner.Tools(...)`, filter to the allowlist `map[string]bool{"search_products", "get_product", "search_stores", "get_store", "set_preferred_store", "shop_for_items", "create_shopping_list", "add_shopping_list_to_cart", "view_cart", "get_weekly_deals"}` — the worker's inventory/profile/meal-planning/order tools are superseded by the native tools above (single source of truth, no duplicate tools shown to the model).

- [ ] **Step 1: Write failing tests**: tool registration count/names on an agent built with `NewWithLibrary`; `add_to_pantry` merges via a fake repository; `kroger_test.go` case asserting a fake MCP server advertising `add_to_inventory` does not surface it.
- [ ] **Step 2: Run** `cd agents && go test ./grocery/ -run 'Shopping|Allowlist'` — FAIL.
- [ ] **Step 3: Implement**; wellness gets the same tools automatically if it constructs via the grocery `NewWithLibrary` path — check `agents/wellness` construction in `main.go` and apply the same append if it takes a repository.
- [ ] **Step 4: Run** `cd agents && go test -race ./grocery/... ./wellness/...` — PASS. `pnpm --filter agents lint typecheck`.
- [ ] **Step 5: Commit** `feat(grocery-agent): native shopping-profile ADK tools; Kroger MCP filtered to Kroger-only surface`

---

### Task 8: Worker slimming, docs, and end-to-end verification

**Files:**

- Modify: `apps/ai-shopping-mcp/src/server.ts` (`SERVER_OPTIONS.instructions` — mention data is shared with the user's agents household library)
- Modify: `apps/ai-shopping-mcp/AGENTS.md` (+ `docs/VISION.md` note): non-Kroger persistence lives in agents-gateway behind `agents/api/openapi/grocery-gateway.yaml`; regenerate the Worker's client with `pnpm --filter ai-shopping-list-mcp generate:gateway`
- Modify: `AGENTS.md` (repo root): add one line — "The `/api/grocery/*` contract is spec-canonical: `agents/api/openapi/grocery-gateway.yaml` is hand-authored; `oapi-codegen` generates the Go server/client, `openapi-typescript` generates the Worker client. Agent _runtime state_ contracts remain Go-canonical via `cmd/contracts` — a separate system."
- Delete: dead code — remaining moved-domain schemas/keys in `user-storage.ts`, unused `utils/kv.ts` helpers if orphaned (verify with `pnpm --filter ai-shopping-list-mcp lint` + `tsc`)
- Test: whole-repo gates

- [ ] **Step 1:** Sweep for dead references: `grep -rn "createShoppingPersistence\|ShoppingPersistence" apps/ai-shopping-mcp/src apps/ai-shopping-mcp/tests` → only `CartPersistence` remains.
- [ ] **Step 2:** Update instructions/docs listed above.
- [ ] **Step 3: Full verification** (root): `pnpm check && pnpm test` — PASS. This now includes `api:check` (Task 3) and exercises the flipped handlers (Task 4) and new endpoints (Task 5) transitively via `pnpm --filter agents test`.
- [ ] **Step 4: Live smoke (manual, gated on deploy):** deploy gateway first (Railway applies migration 006 on boot), set `SHOPPING_SERVICE_SECRET` on both Railway and the Worker (`wrangler secret put SHOPPING_SERVICE_SECRET`), `wrangler deploy`, then via the claude.ai Kroger connector: `add_to_inventory` (native tool now backed by the gateway) an item → confirm row in D1 (`pantry_items` under `kroger:<sub>`); open the web grocery agent (Kroger connected) → linker upserts `kroger_account_links` and re-keys the row; `get_shopping_profile` from both surfaces returns the same pantry.
- [ ] **Step 5: Commit** `chore(shopping): docs + cleanup for gateway-owned shopping domain`

---

### Task 9 (optional, after Task 8 verified): one-off KV → D1 backfill

**Files:**

- Create: `apps/ai-shopping-mcp/scripts/backfill-gateway.mjs`

A Node script (run locally, not deployed) that uses `wrangler kv key list --namespace-id d7f0b87afb2b49cdbab0ead481cef6ed` + `wrangler kv key get` to read `user:<id>:pantry|equipment|order_history|preferred_location` keys and POSTs them to the gateway with the service secret and `x-shopping-user-id: <id>`. Idempotent (pantry/equipment merge by name; orders keyed by original `orderId`). Dry-run flag prints the plan without writing. Only worth running if pre-merge KV data should survive; otherwise skip this task.

---

## Self-Review

- Spec coverage: Kroger-only worker core ✅ (Tasks 6–8 move every non-Kroger domain out; Kroger OAuth/cart/product/store/deals untouched); "list moved to gateway" ✅ (already was, Task 3's spec formalizes it; UPC added Tasks 1–2); "agents replace MCP functions with ADK tools" ✅ (Task 7); "typed clients across, typed contract" ✅ (Task 3's hand-authored OpenAPI is now the single canonical contract; Task 4 makes the _existing_ handlers spec-compile-checked too, not just the new ones; Task 6 generates the Worker client from the same file; Task 3's generated Go client means any other Go service gets a typed client for free); "codex subagents do the coding" ✅ (header mandate, unchanged).
- New in this revision (per explicit user direction): the contract direction flipped from Go-canonical (reflecting Go structs into OpenAPI) to spec-canonical (hand-authored OpenAPI, Go and TS both generated from it) specifically for `/api/grocery/*`, and Task 4 was added to bring the _pre-existing_ household/list/recipe endpoints under the same generated interface rather than leaving them hand-matched — "flip them all."
- Explicitly NOT flipped: `cmd/contracts`'s existing Go→TS/JSON-Schema generation for agent _runtime state_ (`GroceryState` etc.) is a different contract (AG-UI session state, not an HTTP API) and stays Go-canonical; conflating the two would require modeling ADK session state in OpenAPI, which doesn't fit.
- Known trade-offs recorded: MCP tool surface is retained as thin proxies rather than deleted (claude.ai connector keeps working; deleting them later is a one-file change per tool); Worker-side users without a Clerk link live under the `kroger:<sub>` namespace until the lazy linker fires; `shoppingList.clear` becomes a no-op (lists are durable now); Task 4/5 are sequenced (5 depends on 4's `groceryAPI` struct and error-mapper existing) so they cannot run as fully independent subagent dispatches — the Task 4 report must hand Task 5 the exact final shape of `groceryErrorStatus` and the struct fields before Task 5 starts.
- Type consistency: `ShoppingRepository` names in Tasks 2/3/5/7 match; wire fields (`added_at` int64 seconds) consistently adapted only in `gateway-storage.ts`; operationId → Go method name table in Task 3 is the single source Tasks 4–5 must use verbatim.
