# Plan 003: Accept GET /threads without agentId, as CopilotKit SSE runtimes do

> **Executor instructions**: Follow step by step; run each verification; on a
> STOP condition stop and report. Update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 501e937d..HEAD -- internal/agui/copilotkit_threads.go internal/agui/copilotkit_test.go`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (protocol contract)
- **Planned at**: commit `501e937d`, 2026-11-11

## Why this matters

CopilotKit's runtime-endpoint docs (showcase/shell-docs `backend/runtime-endpoints.mdx`)
say of `GET /threads`: "With Intelligence, the `agentId` query parameter is
required. Without Intelligence, it is optional and filters the list." The
gateway advertises `mode: "sse"` from `/info` yet rejects a missing `agentId`
with 400, so a client that lists all of a user's conversations gets an error
instead of a list.

## Current state

`internal/agui/copilotkit_threads.go`:

```go
func (r *CopilotKitRuntime) listThreads(w http.ResponseWriter, request *http.Request) {
    agentID := strings.TrimSpace(request.URL.Query().Get("agentId"))
    agent, ok := r.byID[agentID]
    if !ok {
        writeJSONErrorMessage(w, http.StatusBadRequest, "Invalid request", "Valid agentId query param is required")
        return
    }
    r.runner.listThreads(w, request, agentID, agent.entry)
}
```

`SessionAgentRunner.listThreads` lists one app's sessions for the
authenticated user and sorts by `UpdatedAt` desc then id. The existing test is
at `internal/agui/copilotkit_test.go` (search `"/threads?agentId=resume"`).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Tests | `go test -p 1 -race ./internal/agui/` | `ok` |
| Gates | `make check LINT_FLAGS=--concurrency=1`, `make test`, `make build` | exit 0 |

## Scope

**In scope**: `internal/agui/copilotkit_threads.go`, `internal/agui/copilotkit_test.go`.
**Out of scope**: thread mutations (see plan 004), `/info` flags, auth middleware.

## Steps

1. Refactor `SessionAgentRunner.listThreads` into a helper returning `[]runtimeThread`
   for one agent; the handler keeps 401 for missing identity.
2. Empty `agentId` → concatenate every agent's threads (`r.agents` order), then sort with the
   existing comparator. Unknown non-empty `agentId` keeps the 400.
3. Tests: no `agentId` returns threads from two agents for the caller only; unknown id → 400.
   **Verify**: `go test -p 1 -race -run Threads ./internal/agui/` → `ok`.

## Done criteria

- [ ] Gates pass; the two new cases pass
- [ ] A bad `agentId` still returns 400

## STOP conditions

- Listing all agents needs per-agent timeouts that exceed the request deadline in tests.
- The Oral Boards client is found to depend on the 400 (check with the maintainer).

## Maintenance notes

Unbounded listing: if session counts grow, add the `limit`/cursor CopilotKit
defines (`nextCursor` is already in the response type, always null).
