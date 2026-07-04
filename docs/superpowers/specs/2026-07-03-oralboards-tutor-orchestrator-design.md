# Oral-Boards Tutor on a Custom BaseAgent Orchestrator

**Date:** 2026-07-03
**Status:** Approved design, pending implementation plan
**Supersedes:** the Workflow-based `/oralboards-v2` variant and the v1 monolithic `/oralboards` agent (web); `build_telegram_agent` is retained.

## Problem

The oral-boards agent must deliver a reliable tutoring experience. On the
free-tier models used so far it fails on all four axes: reliability/latency,
protocol breakage, weak tutoring quality, and poor grounding. Model choice is
now open (experience first, cost second), but the architecture must stop
depending on the model following a long protocol perfectly.

Two variants exist:

- **v1 monolith** (`agent.py` + `instructions.md`, `/oralboards`): one LlmAgent
  with a ~200-line protocol (grounding, loading steps, HITL `ask_question`,
  phases, rubric). Free models cannot follow it consistently.
- **v2 Workflow** (`workflow_agent.py`, `/oralboards-v2`): the right
  decomposition (case_builder → questioner → evaluator → scorer, small prompts,
  deterministic routing) on the wrong container. `ag-ui-adk` 0.7.0 traverses
  only `sub_agents`; ADK 2.x `Workflow` keeps children in `graph.nodes`. The
  70-line `_WorkflowWithSubAgents` shim bridges them by depending on four
  private APIs across both libraries (`_shallow_copy_agent_tree`,
  `_update_agent_tools_recursive`, `Workflow._get_static_node_by_name`, the
  `parent_agent` root walk) and has already cost ~10 fix commits and forced
  dropping the `ask_question` HITL tool.

Upstream will not fix this soon: the exact bug (ag-ui #2036, filed by us) is
closed NOT_PLANNED with zero maintainer comments; "[Feature]: ADK 2.x Support"
(#1849) is unanswered; the adk-middleware test suite is red under google-adk
2.x (#1947); the workflow STEP-events PR (#2076) is stalled.

**Decision:** keep the decomposition, drop the `Workflow` container. A custom
`BaseAgent` with real `sub_agents` is the shape both libraries natively
support, and `BaseAgent._run_async_impl` is the public, documented extension
point that `Workflow`, `LlmAgent`, and ag-ui-adk's supported composites all
build on.

## Design

### 1. Foundation — orchestrator port + consolidation

New `agents/oralboards/src/oralboards_agent/orchestrator.py`:

```python
class OralBoardsOrchestrator(BaseAgent):
    """Deterministic phase router: one phase per invocation, resumed by state."""

    def _route(self, state) -> str:
        # verbatim port of workflow_entry_router
        status = state.get("status", "idle")
        if status == "feedback":
            return "evaluator"
        if status == "complete":
            return "scorer"
        if status == "idle" or not state.get("case"):
            return "case_builder"
        return "questioner"

    async def _run_async_impl(self, ctx):
        node = self._nodes[self._route(ctx.session.state)]
        async for event in node.run_async(ctx):
            yield event
        # verbatim port of questioning_router
        if node.name == "evaluator" and ctx.session.state.get("interview_complete"):
            async for event in self._nodes["scorer"].run_async(ctx):
                yield event
```

- `sub_agents=[case_builder, questioner, evaluator, scorer]` — real
  `sub_agents`, so ag-ui-adk's per-run copy and `AGUIToolset` →
  `ClientProxyToolset` replacement work with **zero shim**.
- The four phase agents and their prompts move over unchanged initially.
- The proven turn-based backbone stays: **each invocation runs one phase and
  ends the turn**; the frontend sends the answer as a new message and the
  router picks the next phase. Blocking `ask_question` HITL becomes possible
  again but is deliberately **out of scope** — deterministic routing is more
  robust for free models, and the state-mirrored question panel
  (`current_question` + `useEffect` in `oral-boards.tsx`) already delivers the
  UX (panel display + speech).

Consolidation:

- The orchestrator mounts at `/oralboards`. Delete: the v1 monolithic web
  agent path (`build_agent` + `instructions.md` protocol sections it alone
  needs), `workflow_agent.py`'s `_WorkflowWithSubAgents` shim, the
  `/oralboards-v2` mount (`workflow_main.py` merges into `main.py`), and the
  duplicate `apps/web` console route (`/console/oral-boards-v2`).
- **Telegram carve-out:** `build_telegram_agent` (chat-only monolith on Gemini
  flash-lite) is retained — Telegram has no canvas/state UI, so state-driven
  phases don't fit it.
- Registry, health routes, and mobile config updated to the single agent id.

### 2. Reliability + model assignment

Model choice is open (experience first, cost second). The decomposition still
pays off even with strong models — small per-phase prompts cut latency and
cost, and deterministic routing removes the protocol burden regardless of
model quality. Assign by pedagogical criticality:

| Phase        | Model                                     | Rationale                                 |
| ------------ | ----------------------------------------- | ----------------------------------------- |
| evaluator    | strongest available (e.g. Claude Sonnet / | pedagogically critical: feedback quality, |
|              | Gemini 2.5 Pro / `mistral-large-latest`)  | probing judgment, grounded ideal answers  |
| case_builder | strong long-context (same tier or one     | vignette composition from retrieved       |
|              | below evaluator)                          | passages                                  |
| questioner   | fast/cheap (Groq, `mistral-small`)        | mechanical: one question                  |
| scorer       | mid-tier                                  | transcript synthesis + study sheet        |

Exact model ids are an implementation-plan decision based on which keys are
configured; the matrix above fixes the _tiering_, not the vendor.

- Keep `include_contents="none"` + state-fed context everywhere (small prompts
  → fewer rate-limit hits, fewer protocol breaks).
- Keep `DEFAULT_RETRY_CONFIG`, `on_model_error_callback`, ambient LiteLLM
  fallback chain, `strip_thinking_before_model`.
- Routing unit tests per phase: protocol correctness enforced by code, not by
  the model.

### 3. Coaching depth (exam mode)

1. **Evaluator gets `search_docs` back.** Today it grounds only on
   `case_passages` captured at case-build time — feedback goes generic the
   moment a candidate raises anything adjacent. Prompt: re-search only when
   the answer raises material outside the stored passages.
2. **One bounded probing follow-up.** When an answer is partial (would score
   2), the evaluator may ask exactly one probe on that skillset before
   scoring — mirrors real examiner behavior. Bounded: max one probe per
   skillset, tracked in state.
3. **Prompt upgrades.** Feedback must quote the specific passage it relies
   on; model "what a 3 looks like" contrastively (what you said / what was
   missing / what a 3 answer sounds like).

### 4. Session review artifact

- New `set_study_sheet` tool + `study_sheet` state field (markdown +
  structured citations).
- After `set_score_card`, the scorer writes a study sheet: missed concepts per
  skillset, cited corpus readings to review, 2-3 suggested next case topics.
- Web workspace renders it with an export/copy affordance.

### 5. Adaptive difficulty

- Rolling per-skillset performance profile in **`user:`-prefixed state**
  (persists across sessions in the existing Postgres session service — no new
  infra). Shape: `user:skill_profile = {skillset: {attempts, rolling_score}}`.
- Scorer updates it; case_builder reads it to bias topic selection toward weak
  domains; questioner prompt gets "probe deeper on domains listed as weak."
- Cold start: empty profile → current behavior.

### 6. Study mode

- New `mode: "exam" | "study"` state field and router branch.
- New `study_tutor` sub-agent: Socratic teaching of a chosen blueprint domain
  (leading questions, hints, spaced concepts), grounded via `search_docs`,
  never scores.
- Mode toggle in the web workspace.
- Comes last: reuses orchestrator, retrieval, and profile machinery from
  phases 1-5.

## Sequencing

Six phases, each independently shippable:

1. Orchestrator port + consolidation (deletes the shim; fixes the
   protocol-breakage class)
2. Reliability: model matrix, routing unit tests
3. Coaching depth: evaluator search access, bounded probe, prompt upgrades
4. Session review artifact
5. Adaptive difficulty (`user:` state)
6. Study mode

## Error handling

- Router sees unknown/corrupt `status` → falls through to `questioner` (same
  as today's `__DEFAULT__` edge); state initializer guarantees defaults.
- Model failure inside a phase: existing retry config + ambient fallback chain;
  on terminal failure the turn ends with the error surfaced, state unchanged —
  the next invocation re-enters the same phase (idempotent routing).
- `user:skill_profile` read/write failures degrade to cold-start behavior.
- SQLite corpus errors already return structured `{status: error}` results;
  phase prompts keep the "tell the user the corpus doesn't cover it" rule.

## Testing

- Unit: `_route` truth table (all `status` × `case`/`interview_complete`
  combinations); evaluator probe bound; `user:skill_profile` update math.
- Integration: existing custom eval scripts
  (`agents/oralboards/scripts/run_*.py`, 5 local metrics) re-pointed at the
  orchestrator; new golden cases for evaluator feedback quality (phase 3).
- Frontend: existing `oral-boards.test.tsx` updated for the single route;
  study-sheet render test (phase 4); mode toggle test (phase 6).
- The `adk optimize` GEPA flow stays available per-node afterward (each phase
  agent is a plain LlmAgent with its own prompt).

## Explicitly out of scope

- Restoring blocking `ask_question` HITL (possible again, not needed now).
- Upstream ag-ui PR for `graph.nodes` traversal (optional good-citizen
  follow-up; this design does not depend on it).
- Mobile-specific UI work beyond keeping the existing screen pointed at the
  consolidated agent.
