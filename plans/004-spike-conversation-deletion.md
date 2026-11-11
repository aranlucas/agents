# Plan 004 (spike): Decide how users delete a conversation and its data

> **Executor instructions**: This is a design spike, not a build plan. Produce
> the decision note described in "Deliverable" and stop. Do not change product
> code. Update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 501e937d..HEAD -- internal/agui internal/storage migrations/sqlite`

## Status

- **Priority**: P3
- **Effort**: M (spike S; implementation M)
- **Risk**: MED — deletion is irreversible and crosses four stores
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `501e937d`, 2026-11-11

## Why this matters

Users can list their conversations (`GET /threads`, `internal/agui/copilotkit_threads.go`)
but cannot remove one. A thread's data lives in ADK sessions/events
(`session/database`), `artifacts` (migration 010, keyed by app/user/session),
`agui_active_runs`/`agui_active_run_events` (migration 009) and
`pending_client_tools`. SECURITY.md treats user data as private, and
ROADMAP.md's measurements exclude private content, so a user-controlled delete
is a reasonable expectation. The code's own comment records the current
decision: "rename/archive/delete and realtime metadata subscriptions remain
managed Intelligence capabilities", and CopilotKit documents
`PATCH`/`DELETE /threads/:threadId` and `POST /threads/:threadId/archive` as
Intelligence-only, rejected in SSE mode. So this is a maintainer decision, not
a bug.

## Questions the spike must answer

1. Does the Oral Boards client (`github.com/aranlucas/oral-boards`) expose
   delete when `/info.threadEndpoints.mutations` is true, and which routes would it call?
2. Should the gateway diverge from CopilotKit's "Intelligence-only" contract, or
   offer deletion through a gateway-specific route (the HTTP surface is limited
   to AG-UI, runtime and health endpoints per AGENTS.md)?
3. Order and atomicity: ADK `session.Service.Delete` runs through GORM, while
   artifacts, active runs and pending tools use `storage.DB.Run`. Same SQLite
   file — can one transaction cover all, or is "delete app rows, then session"
   with idempotent retry acceptable?
4. Must an active run be stopped first (`RequestActiveRunStop`) and the delete
   refused with 409 while it is running?

## Deliverable

`docs/thread-deletion.md` (or a comment on a GitHub issue) answering 1–4 with a
recommended route shape, the deletion order, and the test list (cross-user
isolation, running-thread refusal, artifact cleanup).

## STOP conditions

- The maintainer reaffirms the Intelligence-only decision: record it under
  "rejected" in `plans/README.md` and stop.
