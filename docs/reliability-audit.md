# Correctness and reliability audit — 2026-11-06

Baseline: remote default `origin/main`, `9c1b969a` (merged untangle pass).
Behavior audit only; public APIs and migration history are preserved. All tests
and builds run in CI; no local test/build execution is authorized.

## Inventory and review boundaries

- `cmd/agents`, `internal/gateway`, `internal/config`, `.railway`: startup,
  provider construction, readiness, shutdown and declared configuration.
- `internal/auth`, `internal/clerk`, `internal/mcpruntime`: JWT-derived user
  identity, public routes, OAuth credential lookup and MCP metadata scope.
- `internal/agui`: bounded input, session ownership, messages/state, interrupts,
  client-tool approvals, SSE ordering, cancellation and cross-replica replay.
- `internal/storage`, `migrations/sqlite`: atomic SQL batches on one SQLite
  file, ADK session service, versioned artifacts, run ownership and pending tools.
- `internal/grocerystore`, `internal/fitnessdata`: user-scoped list/recipe,
  household, shopping-profile and fitness mutations; artifact snapshot recovery.
- `internal/agents`: specialist tool validation, external side effects, provider
  failure reporting; `internal/providers`, `providerpolicy`, `rate`: streaming,
  provider errors, fallback and distributed request limits.
- `internal/common`, `bravesearch`: HTTP deadlines, body limits, redirects,
  SSRF checks and page extraction. `cmd/evalrun`: developer-only live evaluation.
- Existing Go tests protect protocol, authorization, SQL and provider contracts.
  CI retains lint, race tests and deployable-command build in sequence.

## Findings (recorded before implementation)

### R1 — page fetches leave private transport connections idle (medium; high confidence)

Location: `internal/common/web.go`, `WebLoader.Load`, transport clone through
response body cleanup. Each load clones a transport to install the SSRF-safe
dialer, but never closes that clone's idle connections. A successful keepalive
response leaves a connection and transport goroutines behind until its idle
expiry (or indefinitely for a supplied transport with no idle timeout). Repeated
research fetches cannot reuse these pools. Expected: release resources owned by
this per-call transport when the call ends, on success and failure. Fix: defer
`CloseIdleConnections` on the clone; body cleanup must run first. Regression:
a controlled TLS server observes connection closure after Load returns, including
non-2xx and oversized-response paths. Existing extraction/SSRF tests remain.

## Reconciled / rejected hypotheses

- Preferred-store provider might be lost during Kroger account linking: rejected;
  migration 008 declares ON UPDATE CASCADE, so moving the parent preserves it.
- Pending-tool multi-call registration might partially commit: rejected; its
  conditional insert validates the whole incoming batch, within DB.Run's transaction.
- Duplicate client-supplied run IDs might authorize a second execution: rejected;
  BeginActiveRun checks the insert's change count, not just the selected ID.
- Untrusted page DNS might bypass host validation by rebinding: the dialer resolves
  and validates the actual IP it connects to; redirects validate HTTPS and host.
- Provider failures should not be retried speculatively for side-effecting tools;
  no new automatic retries are introduced.

## Framework applicability and validation

There are no tracked `.js`, `.jsx`, `.ts`, `.tsx` or `package.json` files. This
repository is a Go HTTP/agent service and Go developer CLI, with no JS subproject.
The requested tester-army/e2e JavaScript integration therefore does not apply;
no unrelated UI or npm dependency is added. Existing Go integration tests use
controlled HTTP/provider fixtures and SQLite without production credentials.

Independent static review completed in two sequential review rounds. Review
confirmed R1 and discovered R2; final review verified the production approach and
caught an accepted-query HTTP fixture protocol mismatch and import grouping,
both corrected. No additional proven defects remained. CI evidence pending.

The CI reproduction step substitutes only the two baseline implementation files,
keeps the new regression assertions, requires each specific failure message,
restores the fixed files, and then executes the full checks/race suite and build
sequentially. No local tests or builds were run.

### R2 — dataset guard misses unquoted table paths (high; high confidence)

Location: `internal/agents/trends/bigquery.go`, `validateTables`.
GoogleSQL accepts unquoted qualified table paths; the existing guard examines
only backtick-delimited names. Thus generated SQL referencing another dataset
can reach billable execution if the service identity can read it. Expected:
restrict execution to the configured project/dataset regardless of SQL spelling.
Use the existing BigQuery SDK's dry-run table metadata, require SELECT metadata,
and reject incomplete/missing metadata before executing. BigQuery documents that
references may be incomplete above 50 tables; reject 50 or more conservatively.
Keep the existing early backtick check for compatibility. Regressions use a fake
BigQuery HTTP service, assert the dry run occurs and no billable request occurs
for outside/missing metadata. No production credentials are used.
References: GoogleSQL lexical table-name documentation and BigQuery SDK
QueryConfig.DryRun/QueryStatistics.ReferencedTables contracts.
