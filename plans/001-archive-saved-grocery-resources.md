# Plan 001: Let users archive and restore saved grocery lists and recipes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 501e937d..HEAD -- internal/grocerystore internal/agents/grocery`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `501e937d`, 2026-11-11

## Why this matters

The grocery agent lets a signed-in user save, list, open and edit lists and
recipes in a personal or household library, but nothing can remove a saved
resource. Every saved list and recipe stays in `list_saved_lists` /
`list_saved_recipes` output forever, so the library fills with stale weekly
lists, and the agent has no tool to honour "delete my old Thanksgiving list".
The schema already anticipates this: `grocery_lists.status` and
`recipes.status` are `CHECK (status IN ('active', 'archived'))`, and
`Store.UpdateList` already validates a `Status` patch, yet no tool sets it and
no listing filters on it. Archiving (rather than hard deletion) is reversible,
which matters because household lists are shared with other members, and it
needs no migration or artifact cleanup. ROADMAP.md item 3 ("Reusable results")
asks for grocery results whose edits survive and that need explicit approval
before changes, which this plan honours.

## Current state

- `migrations/sqlite/004_shared_lists.sql` — `grocery_lists.status TEXT NOT NULL CHECK (status IN ('active', 'archived'))`.
- `migrations/sqlite/005_saved_grocery_resources.sql` — `recipes.status` with the same CHECK.
- `internal/grocerystore/library.go`
  - `LibraryRepository` interface (lines 26–36): `SaveList`, `ListPersonalLists`,
    `UpdateList`, `ReplaceListItems`, `SaveRecipe`, `ListRecipes`, `GetRecipe`,
    `UpdateRecipe`. No recipe status setter.
  - `UpdateList` (line ~190) already accepts `ListPatch.Status`:
    ```go
    if patch.Status != nil {
        status := strings.TrimSpace(*patch.Status)
        if status != "active" && status != "archived" {
            return List{}, ErrInvalid
        }
        sets, params = append(sets, "status = ?"), append(params, status)
    }
    ```
    and it repeats the access predicate inside the transaction:
    ```go
    accessSQL := `SELECT gl.id FROM grocery_lists gl WHERE gl.id = ? AND (gl.owner_user_id = ? OR EXISTS (
          SELECT 1 FROM household_members hm WHERE hm.household_id = gl.household_id AND hm.clerk_user_id = ?
        ))`
    ```
    then `changed(results) == 0` → `ErrNotFound`, then `refreshListSnapshot`.
    **This is the pattern to copy for recipes.**
  - `refreshRecipeSnapshot(ctx, userID, recipeID, now)` re-reads the recipe and
    republishes its artifact snapshot when one exists.
- `internal/agents/grocery/saved_resources.go`
  - `SavedResourceScopeArgs{HouseholdID *string}` is the input of
    `ListSavedLists` / `ListSavedRecipes`; both return every row regardless of
    status.
  - `savedResourceTools` registers 9 tools from a `definitions` slice of
    `{name, description, build}`.
  - Handlers return `(Result, nil)` with a `StructuredError` on failure via
    `savedListRepositoryFailure` / `savedRecipeRepositoryFailure`. Match it.
- `internal/agents/grocery/instructions.md` — the agent prompt; the paragraph
  starting "Finish a complete list with `mark_list_ready`" governs saved resources.
- Tests to model: `internal/agents/grocery/saved_resources_test.go`
  (`TestGroceryLibraryToolsRegistersOneListAndRecipeLibrarySurface`,
  `TestUpdateSavedListInvalidItemsDoNotRenamePersistedList` uses a real
  in-memory store) and `internal/grocerystore/library_edit_test.go`
  (`newLibraryEditStore`).

Conventions (AGENTS.md): validate tool arguments in application handlers;
tests protect observable contracts; one SQLite file; migrations are
append-only (none is needed here).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Lint | `make check LINT_FLAGS=--concurrency=1` | exit 0, `0 issues.` |
| Focused tests | `go test -p 1 -race ./internal/grocerystore/ ./internal/agents/grocery/` | `ok` for both |
| Full tests | `make test GOFLAGS=-p=1` | exit 0 |
| Build | `make build` | exit 0 |

On memory-constrained machines also export `GOMAXPROCS=2` and never run lint
and tests at the same time.

## Scope

**In scope**:
- `internal/grocerystore/library.go`
- `internal/grocerystore/library_edit_test.go`
- `internal/agents/grocery/saved_resources.go`
- `internal/agents/grocery/saved_resources_test.go`
- `internal/agents/grocery/instructions.md`

**Out of scope**:
- Migrations — the status columns already exist; do not add a migration.
- Hard deletion and artifact cleanup — archiving is the reversible primitive;
  deletion is a separate decision for the maintainer.
- `internal/grocerystore/store.go` household list endpoints and item tools.
- Any HTTP route — the HTTP surface is limited to AG-UI/runtime/health.

## Steps

### Step 1: Add `SetRecipeStatus` to the store

In `internal/grocerystore/library.go`, add `SetRecipeStatus(context.Context, string, string, string, time.Time) (Recipe, error)`
to `LibraryRepository` and implement it on `*Store`:
- `s.ready()`; trim inputs; status must be `active` or `archived`, otherwise `ErrInvalid`.
- One `UPDATE recipes SET status = ?, updated_at = ? WHERE id IN (<recipe access predicate>)`
  where the predicate mirrors UpdateList's (owner or household member).
- `changed(results) == 0` → `ErrNotFound`; then `return s.refreshRecipeSnapshot(...)`.

**Verify**: `go build ./...` → exit 0.

### Step 2: Store tests

In `internal/grocerystore/library_edit_test.go` add tests (in-memory DB):
- Archiving a list via `UpdateList(... ListPatch{Status: "archived"})` persists `Status == "archived"` and
  restoring sets it back to `active`; a non-member gets `ErrNotFound` and the row is unchanged.
- `SetRecipeStatus` archives/restores a recipe the user owns; a household
  member may archive a household recipe; an outsider gets `ErrNotFound`; an
  unknown status gets `ErrInvalid`.

**Verify**: `go test -p 1 -race ./internal/grocerystore/` → `ok`.

### Step 3: Agent tools and listing filter

In `internal/agents/grocery/saved_resources.go`:
- Add `IncludeArchived bool` (`json:"include_archived,omitempty"`) to `SavedResourceScopeArgs`;
  `ListSavedLists` / `ListSavedRecipes` drop rows whose `Status == "archived"`
  unless it is true.
- Add `ArchiveSavedResourceArgs{ID string; Restore bool}`.
- Add handlers `ArchiveSavedList` (calls `UpdateList` with only `Status`) and
  `ArchiveSavedRecipe` (calls `SetRecipeStatus`); empty id → `invalid_saved_list` /
  `invalid_saved_recipe` structured error without calling the repository.
- Register tools `archive_saved_list` and `archive_saved_recipe` whose
  descriptions say they hide the resource from the library only after the user
  explicitly asks to remove it, and that `restore: true` brings it back.

**Verify**: `go build ./...` → exit 0.

### Step 4: Tool tests and prompt

- Update the registration test to expect 11 tools including the two new names.
- Add a real-store test: save a list row, archive via the tool, `list_saved_lists` hides it,
  `include_archived: true` shows it, `restore: true` brings it back; same for a recipe.
- Add a test that an empty id returns a structured error without touching the repository.
- In `instructions.md`, extend the saved-resources paragraph: archive only after
  the user explicitly asks to remove/delete a saved list or recipe and the exact
  id is confirmed via list/get; archived resources are hidden but restorable.

**Verify**: `go test -p 1 -race ./internal/agents/grocery/` → `ok`.

## Done criteria

- [ ] `make check` exits 0
- [ ] `make test` exits 0; new store and tool tests pass
- [ ] `make build` exits 0
- [ ] `git diff --stat` touches only in-scope files plus `plans/`

## STOP conditions

- `grocery_lists.status` or `recipes.status` lacks the `archived` CHECK value.
- Another caller of `LibraryRepository` outside `internal/agents/grocery` would
  need a new method implementation you can't add in scope.
- A grocery eval fixture (`internal/agents/grocery/eval`) asserts an exact tool
  count or tool list and fails.

## Maintenance notes

- If hard deletion is added later, it must also remove the
  `grocery_resource_artifacts` row and the `grocery_library` artifacts.
- Archived resources remain readable with `get_saved_*` by exact id, and
  editable; reviewers should confirm that is acceptable.
- Status filtering happens in the tool layer; if listings get paginated, move
  the filter into SQL.
