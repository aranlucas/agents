# Plan 002: Authorize saved-recipe edits inside the write transaction

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report. When done, update this plan's row in
> `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 501e937d..HEAD -- internal/grocerystore/library.go internal/grocerystore/library_edit_test.go`
> If either file changed, compare the excerpts below with the live code first.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (independent of 001; if 001 landed, `SetRecipeStatus` already shows the target pattern)
- **Category**: bug (authorization consistency)
- **Planned at**: commit `501e937d`, 2026-11-11

## Why this matters

`Store.UpdateRecipe` checks access with a separate read (`GetRecipe`) and then
writes with `WHERE id = ?` alone. The two statements run in different
transactions (`storage.DB.Run` opens one transaction per call), so a user
removed from a household between the read and the write can still overwrite
the shared recipe, and the write itself can never report "no access". The
sibling `UpdateList` deliberately repeats the access predicate in every write
("so a failed authorization can never delete or insert items"); recipes should
match it.

## Current state

`internal/grocerystore/library.go`, `UpdateRecipe` (around line 436 at the planned SHA):

```go
existing, err := s.GetRecipe(ctx, userID, recipeID)
...
statements := []storage.Statement{
    {SQL: `UPDATE recipes SET title = ?, description = ?, servings = ?, notes = ?, updated_at = ? WHERE id = ?`, Params: []any{..., recipeID}},
    {SQL: `DELETE FROM recipe_ingredients WHERE recipe_id = ?`, Params: []any{recipeID}},
    {SQL: `DELETE FROM recipe_steps WHERE recipe_id = ?`, Params: []any{recipeID}},
    {SQL: `DELETE FROM recipe_tags WHERE recipe_id = ?`, Params: []any{recipeID}},
}
_, replacement, err := s.materializeRecipe(recipeID, existing.OwnerUserID, existing.HouseholdID, content, updatedAt)
statements = append(statements, replacement[1:]...)
```

Exemplar to copy: `UpdateList` in the same file builds
`accessSQL := "SELECT gl.id FROM grocery_lists gl WHERE gl.id = ? AND (gl.owner_user_id = ? OR EXISTS (SELECT 1 FROM household_members hm ...))"`
and appends it to every UPDATE/DELETE/INSERT, then returns `ErrNotFound` when
`changed(results) == 0`.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests | `go test -p 1 -race ./internal/grocerystore/` | `ok` |
| Lint | `make check LINT_FLAGS=--concurrency=1` | `0 issues.` |
| Full | `make test` then `make build` | exit 0 |

## Scope

**In scope**: `internal/grocerystore/library.go` (`UpdateRecipe` only),
`internal/grocerystore/library_edit_test.go`.

**Out of scope**: `materializeRecipe` signature; list code; migrations.

## Steps

1. Define a recipe access predicate
   (`SELECT r.id FROM recipes r WHERE r.id = ? AND (r.owner_user_id = ? OR EXISTS (SELECT 1 FROM household_members hm WHERE hm.household_id = r.household_id AND hm.clerk_user_id = ?))`)
   and add `WHERE id IN (<predicate>)` / `WHERE recipe_id IN (<predicate>)` to the UPDATE and three DELETEs.
   Wrap each replacement INSERT from `materializeRecipe` as `INSERT ... SELECT ... WHERE EXISTS (<predicate>)`
   (or, simpler, keep the inserts but make the first statement the guarded UPDATE and return `ErrNotFound`
   when it changed 0 rows — SQLite aborts nothing on 0 changes, so in that case
   **all** later statements must be guarded too). Keep `GetRecipe` for the owner/household lookup.
   **Verify**: `go build ./...` → exit 0.
2. Add a test: seed a household recipe, remove the member from `household_members`,
   call `UpdateRecipe` as that former member → `ErrNotFound`, and the recipe's
   title, ingredients and steps are unchanged.
   **Verify**: `go test -p 1 -race -run UpdateRecipe ./internal/grocerystore/` → `ok`.

## Done criteria

- [ ] `make check`, `make test`, `make build` exit 0
- [ ] New former-member test passes and fails if the predicate is removed
- [ ] Only in-scope files changed

## STOP conditions

- Guarding the INSERTs requires changing `materializeRecipe`'s callers outside `UpdateRecipe`.
- Existing recipe tests fail after the change.

## Maintenance notes

Any future recipe mutation must reuse the same predicate; consider extracting
it as a shared helper once there are three call sites.
