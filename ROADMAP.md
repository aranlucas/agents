# Agents gateway feature roadmap

Updated 2026-10-26. Proposed sequence, not delivery dates. Success targets below are unvalidated pilot gates, not adoption or revenue results.

## User and current baseline

A user wants an agent to finish a bounded job and leave a reusable result, without an unexplained sequence of expensive tool calls.

The Go gateway already hosts specialist ADK workflows, AG-UI/runtime endpoints and persistent SQLite sessions. Client products should share these runs and domain results rather than implement separate agent engines.

Planning source: [README](README.md) at `21faeb80c779`. This is a focused planning pass, not a new comprehensive code audit or live-service validation.

## Prioritized releases

| Order | Feature                                           | Useful scope                                                                                                                                         | Release acceptance                                                                                                                                                       |
| ----- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Now   | A task with a visible scope and stop condition    | Expose the requested outcome, selected workflow, current step and a user-selected work budget through the existing runtime stream.                   | The gateway stops scheduling work at its limit and returns completed work, uncertainty and a resumable next action; provider-reported usage is separated from estimates. |
| Next  | Resume interrupted work safely                    | Restore the same run and domain result after a connection/provider interruption, distinguishing finished actions from uncertain side effects.        | A mobile reconnect cannot start the same job twice or replay an uncertain cart/message mutation automatically.                                                           |
| Next  | Deliver a result the user can act on              | For one grocery or travel journey, return a reviewable domain result with sources, unresolved choices and explicit approval before external changes. | The mobile and MCP-facing clients reference the same result identity and revisions; edits survive returning to chat.                                                     |
| Later | Choose workflows based on demonstrated usefulness | Expose a small set of dependable job starters and measure completion before expanding the catalog.                                                   | A new specialist ships only with a complete useful result, recovery behavior and a user-visible reason to choose it.                                                     |

## Measure before expanding

Baseline five bounded grocery/travel tasks: useful completion, provider usage, elapsed time, repeated tool calls and interventions. Proposed gate: every stop produces a usable handoff and at least four tasks yield an accepted result within the chosen budget.

Collect the baseline before implementation. Use voluntary feedback and aggregate operational events without private content, credentials or account identifiers. If users do not return to the first workflow, revisit it before adding the later milestones.

## Dependencies and limits

Clerk client identity and shared Auth/MCP provider identity are distinct contracts today. Link them explicitly before cross-product account assumptions. Keep one existing SQLite store and native ADK/runtime mechanisms. Broad autonomous writes and more agents are lower priority than predictable task completion.

Use existing libraries and native test commands. Attach reliability work to the feature acceptance it enables. Update this file with shipped user outcomes and observed pilot results; refactors or passing tests alone do not demonstrate product value.
