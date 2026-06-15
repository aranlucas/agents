# Oralboards: Predictive State & Loading Progress

**Date:** 2026-06-15
**Status:** Approved

## Problem

Case generation has two silent phases that leave the user staring at a blank spinner:

1. **Search/read phase** — agent calls `search_docs` and `read_doc` multiple times before writing anything to state. No visible progress.
2. **Generation phase** — LLM writes the full case/score card text but state isn't updated until the tool call completes. Panel opens all at once.

The same gap recurs during the questioning phase: after a candidate submits an answer, there is no feedback until `append_exchange` fires with the complete exchange.

## Goals

- Show human-readable progress steps during all search/read phases (case loading, between answers, score card).
- Stream the case vignette token-by-token so the panel opens and renders progressively.
- Stream the score card token-by-token so the feedback pane opens early.
- Show meaningful status in `QuestioningPane` while waiting for the next question.

## Out of scope (follow-on)

Streaming per-exchange `feedback` via a `current_feedback` state field. Requires frontend logic to switch between streaming preview and committed `lastExchange.feedback`. Deferred — `loading_step` already covers the waiting signal.

---

## Architecture

### State model (agent.py)

Add one field to `OralBoardsState`:

```python
class OralBoardsState(BaseModel):
    case: str = ""
    case_sources: list[CaseSource] = []
    transcript: list[OralBoardsExchange] = []
    score_card: str = ""
    status: str = "idle"
    loading_step: str = ""   # progress label during search/generation phases
```

### New backend tool (agent.py)

```python
def set_loading_step(tool_context: ToolContext, step: str) -> dict:
    """Report a human-readable progress step during search or generation."""
    tool_context.state["loading_step"] = step
    return {"ok": True}
```

Add to the agent's `tools` list alongside existing tools.

### PredictStateMapping (main.py)

```python
ORALBOARDS_PREDICT_STATE = [
    streaming_state_mapping(state_key="case",       tool="set_case",       tool_argument="case"),
    streaming_state_mapping(state_key="score_card", tool="set_score_card", tool_argument="markdown"),
]
```

Pass to `build_adk_agent(..., predict_state=ORALBOARDS_PREDICT_STATE)`.

### Agent instruction additions (agent.py)

Add a `set_loading_step` protocol to the static instruction, mapping each phase:

| When | Call |
|---|---|
| Before first `search_docs` (case build) | `set_loading_step("Searching clinical guidelines…")` |
| Before each `read_doc` | `set_loading_step("Reading: {doc title}…")` |
| Before calling `set_case` | `set_loading_step("Composing case vignette…")` |
| After candidate answer, before re-search | `set_loading_step("Reviewing your answer…")` |
| Before calling `append_exchange` | `set_loading_step("Composing feedback…")` |
| Before calling `set_score_card` | `set_loading_step("Computing score card…")` |

---

## Frontend changes

### oral-boards-workspace.tsx — start page

`OralBoardsStartPage` currently shows hardcoded "Building your case…". Replace with `examState.loading_step`:

```tsx
<p className="text-muted-foreground text-sm">
  {examState.loading_step || "Building your case…"}
</p>
```

`examState` is already in scope via `agent?.state`.

### oral-boards-panel.tsx — questioning pane

`QuestioningPane` currently shows hardcoded "Waiting for the next question…". Replace with `loadingStep` prop:

```tsx
<p className="text-sm leading-relaxed">
  {question || (isRunning && loadingStep) || "Waiting for the next question…"}
</p>
```

`OralBoardsPanel` receives `loadingStep: string` from `OralBoardsWorkspace` via `examState.loading_step`.

### oral-boards-panel.tsx — pane switching

`FeedbackPane` is currently gated on `status === "complete" || status === "feedback"`. With `score_card` streaming, `status` doesn't flip to `"complete"` until `set_score_card` finishes. Show the pane as soon as `score_card` has content:

```tsx
{(status === "complete" || status === "feedback" || scoreCard.trim()) && (
  <FeedbackPane scoreCard={scoreCard} transcript={transcript} />
)}
```

---

## Data flow summary

```
search_docs / read_doc
  → set_loading_step("…")        → loading_step in state → UI shows step label

set_case(case=…)
  → PredictStateMapping streams  → case streams token-by-token into panel
  → tool completes               → case + status="presenting" committed

set_score_card(markdown=…)
  → PredictStateMapping streams  → score_card streams into FeedbackPane early
  → tool completes               → score_card + status="complete" committed
```

---

## Files touched

| File | Change |
|---|---|
| `agents/oralboards/src/oralboards_agent/agent.py` | Add `loading_step` to state; add `set_loading_step` tool; update instructions |
| `agents/oralboards/src/oralboards_agent/main.py` | Add `ORALBOARDS_PREDICT_STATE`; pass to `build_adk_agent` |
| `apps/web/src/components/chat/oral-boards-workspace.tsx` | Show `loading_step` in start page |
| `apps/web/src/components/chat/oral-boards/oral-boards-panel.tsx` | Pass `loadingStep` to `QuestioningPane`; fix `FeedbackPane` gate |
