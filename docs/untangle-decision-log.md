# Untangle decision log

## Scope and baseline

Skill fetched verbatim before work from https://raw.githubusercontent.com/caldoai/skills/main/skills/untangle-codebase/SKILL.md on 2026-11-05. Both optional additions selected: remove implementation-restating comments; clean up tests last, preserving regression coverage. Scope is this entire repository in its bound isolated worktree. Initial working tree clean; base ce2b57d1. No deployments, publication, migration edits, new modules or frontend work.

Baseline `make check && make test`: check fails because golangci-lint is absent (exit 127), so tests did not start. Separate baseline `make test` underway with configured concurrency; results recorded below. Validation commands must remain sequential.

## Inventory before implementation

- `cmd/agents`, `internal/app`, `gateway`, `bootstrap`, `catalog`: composition, process lifecycle, routing, canonical identities and provider selection. Explicit constructors are useful, but custom concurrency and duplicate HTTP loaders are surplus.
- Eleven authored domains under `internal/agents`: colocated instructions, tools, state and datasets. State JSON/session mechanics are copied across all domains; wellness additionally copies grocery profile normalization.
- `internal/agui`: protocol conversion, inbound validation, client-tool interruption/resumption, session execution and CopilotKit compatibility. Protocol cases are externally required. Pacing environment parsing lives here despite configuration keys being owned by config; two representations and option APIs obscure its ownership.
- `internal/providers/openai`, `providerpolicy`, `providererrors`: provider compatibility and fallback policy. Explicit compatibility rules represent provider contracts; avoid collapsing them into opaque generic dispatch.
- `storage`, `migrate`, `migrations/sqlite`: one database with application and ADK session ownership. Preserve append-only SQL and ADK service, readiness and transaction semantics.
- `grocerystore`, `fitnessdata`: domain persistence. Grocery item creation is duplicated between lists and library templates; optional product statements break the implicit one-result-per-item convention. Snapshot scheduler acquisition is duplicated and a Close wrapper exists only for tests.
- `auth`, `clerk`, `rate`, `mcpruntime`, `bravesearch`, `common`, `observability`: external contracts, bounded I/O, scope/tenant enforcement. Preserve credential handling, authorization, JSON errors and deadlines.
- `cmd/evalrun`: independent developer tooling with live-provider boundaries; preserve synthetic recall and rubric contracts.
- Root and hidden configuration, CI, Railway, docs/assets/testdata: retain deployment variables, configured worker limits, fixtures and single-module structure. Recent history already pruned tests/docs (#317/#316); no deletion quotas.

## Design and justified implementation list

1. Put shared state encoding/overlay in agentruntime; keep domain defaults and normalization in each domain. Put shopping-profile normalization with grocery and delegate from wellness.
   - Hidden links: eleven JSON round trips must evolve together; malformed/nil input fallback is copied.
   - Needless link: wellness knows grocery collection internals solely to normalize them.
   - Preserve jobs' legacy-field handling and domain-specific null/empty collection behavior.
2. Use existing x/sync/errgroup for concurrent construction; share the identically configured stateless web loader.
   - Surplus: custom WaitGroup/Once/error accumulator and duplicate loader construction.
   - Preserve first-error labeling, wait-for-all behavior, career model sharing and resource cleanup.
3. Own pacing environment parsing in config and pass one explicit pacing value through gateway to AG-UI.
   - Hidden link: config.Keys advertises keys but gateway rereads environment outside config.Load.
   - Surplus: private/public duplicate policy types and four-scalar bridging API.
   - Preserve defaults, invalid-value fallbacks, disabled smoothing, zero delay and chunking modes.
4. Unify grocery item preparation and explicit batch-result association; return persisted positions from existing snapshot read.
   - Hidden links: optional product writes interleave results; list/library duplicate validation and IDs.
   - Preserve caller-visible validation differences unless a regression is demonstrated and documented.
5. Unify snapshot queue acquisition; remove test-only Close alias.
   - Surplus: duplicated scheduler initialization and pass-through method.
   - Preserve cleanup ordering, shutdown and coalescing behavior.

6. Split full-solution markers from algorithm-hint markers in interview guardrails.
   - Hidden positional link: a numeric slice boundary determines which markers permit requested hints; use named groups without changing classifications. Existing guardrail behavior tests remain.

## Retained requirements / rejected churn

Keep typed agent bindings and explicit construction: compile-time inventory and distinct dependency graphs justify these boundaries. Keep provider-specific adapters, Clerk validation, trigger-aware migration splitting, active-run leases, cancellation and tenant checks: these special cases follow external protocols and persistence requirements. Keep domain handler validation independent of schemas. Do not flatten domain state into a shared universal schema, add plugin mechanisms, move persistence out of storage, or reorganize folders merely for symmetry.

## Validation and review results

Pending implementation and independent iterative review. Test cleanup follows structural edits.

### Resume and review (2026-11-06)

The user subsequently authorized commit/push, PR creation and merge after checks and required reviews; no deployment or protection bypass. Earlier test processes were cancelled by the T3 restart and provide no baseline pass/fail evidence. Missing golangci-lint is a baseline environment limitation; a release binary is now staged outside the repository in /tmp/agents-tools for validation.

All six structural decisions have implementations in the worktree. ADK session state changes were reviewed against https://pkg.go.dev/google.golang.org/adk/v2/session (ReadonlyState.All); domain defaults, jobs user-scoped profile precedence, and tolerant JSON overlay semantics remain. No dependencies or applied migrations changed.

First independent review found no further worthwhile redesign, but identified missing behavior tests, brittle assertions, formatting and stale bookkeeping. Added real-SQLite mixed grocery append coverage for result ordering/positions and product identities, shared state overlay/fallback coverage, and explicit null shopping-collection normalization coverage. Expected positions follow append order after the existing item; encoding failures preserve domain defaults. These catch batch-result misassociation, missing default overlays and null arrays exposed to clients. Retained jobs user-profile precedence and migration idempotency/missing-marker checks. Removed the migration assertion comparing a variable to its defining expression/historical minimum count and replaced the jobs state-key-count assertion with observable required defaults.

Introduced compile errors in the initial resumed test run (old private pacing field names and a dropped strconv import) were corrected; these are not baseline failures. A fresh race-enabled make test is running sequentially; compilation of modernc SQLite is slow under machine memory pressure. Formatting and final make check && make test remain pending.

### CI-only validation constraint

Latest user instruction supersedes local test validation: tests run only in CI. Confirmed no owned make/go test processes remain; the previous race run produced no terminal result and is not claimed to have passed. `make fmt` completed successfully using the staged linter; `git diff --check` passes. Existing PR CI already runs golangci-lint, the full race-enabled `make test` suite (including added regressions), then `make build` sequentially. No workflow change is needed. Final static review is pending; CI results will decide readiness to merge.

Final independent static review found no remaining worthwhile structural issues or correctness regressions; it checked state handling, grocery normalization and batch association, scheduler ordering, constructor concurrency, pacing ownership and regression coverage. CI validation is the remaining gate.
