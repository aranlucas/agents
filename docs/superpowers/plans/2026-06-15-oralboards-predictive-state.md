# Oralboards Predictive State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add token-streaming for the case vignette and score card, plus visible loading-step progress during search/read phases, across case loading and the questioning flow.

**Architecture:** A new `loading_step` string field in `OralBoardsState` is written by a new `set_loading_step` backend tool. Two `PredictStateMapping` entries stream the `case` and `score_card` fields token-by-token as the LLM generates them. The frontend reads `loading_step` from state and surfaces it on the start page and in the questioning pane.

**Tech Stack:** Python (ADK, Pydantic), ag-ui-adk `PredictStateMapping`, TypeScript/React (Next.js), `@copilotkit/react-core/v2`

---

### Task 1: Add `loading_step` field and `set_loading_step` tool

**Files:**

- Modify: `agents/oralboards/src/oralboards_agent/agent.py`
- Modify: `agents/oralboards/tests/test_oralboards_state_tools.py`

- [ ] **Step 1: Write the failing test**

Add to `agents/oralboards/tests/test_oralboards_state_tools.py`, inside the existing import block update and after the existing tests:

```python
# Update the import at the top to include set_loading_step
from oralboards_agent.agent import (
    OralBoardsState,
    append_exchange,
    build_agent,
    set_case,
    set_loading_step,
    set_phase,
    set_score_card,
)
```

Then add this test at the end of the file:

```python
def test_set_loading_step_writes_to_state() -> None:
    context = SimpleNamespace(state={})
    assert set_loading_step(context, "Searching clinical guidelines…") == {"ok": True}
    assert context.state["loading_step"] == "Searching clinical guidelines…"

    # Calling again overwrites the previous step
    set_loading_step(context, "Reading: Pulp therapy guide…")
    assert context.state["loading_step"] == "Reading: Pulp therapy guide…"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
uv run pytest agents/oralboards/tests/test_oralboards_state_tools.py::test_set_loading_step_writes_to_state -v
```

Expected: `ImportError: cannot import name 'set_loading_step'`

- [ ] **Step 3: Add `loading_step` to `OralBoardsState` and implement the tool**

In `agents/oralboards/src/oralboards_agent/agent.py`, update `OralBoardsState`:

```python
class OralBoardsState(BaseModel):
    """Default shared-state shape for the oral-boards examiner agent."""

    case: str = ""
    case_sources: list[CaseSource] = []
    transcript: list[OralBoardsExchange] = []
    score_card: str = ""
    status: str = "idle"
    loading_step: str = ""
```

Then add `set_loading_step` after the existing `set_phase` function (around line 172):

```python
def set_loading_step(tool_context: ToolContext, step: str) -> dict:
    """Report a human-readable progress step during search or generation phases."""
    tool_context.state["loading_step"] = step
    return {"ok": True}
```

Then add `set_loading_step` to the agent's `tools` list in `build_agent()`:

```python
tools=[
    search_docs,
    read_doc,
    set_case,
    set_phase,
    set_loading_step,
    append_exchange,
    set_score_card,
    AGUIToolset(),
],
```

- [ ] **Step 4: Run test to verify it passes**

```bash
uv run pytest agents/oralboards/tests/test_oralboards_state_tools.py::test_set_loading_step_writes_to_state -v
```

Expected: `PASSED`

- [ ] **Step 5: Verify existing tests still pass**

```bash
uv run pytest agents/oralboards/tests/test_oralboards_state_tools.py -v
```

Expected: all tests `PASSED`

- [ ] **Step 6: Check the state-initializer test covers the new field**

The existing `test_state_initializer_preserves_existing_state_and_adds_defaults` checks that `make_state_initializer` backfills defaults for all fields. Because `loading_step` defaults to `""` in `OralBoardsState`, the initializer will backfill it automatically — no code change needed. Verify by checking `loading_step` is present in state after the callback runs. Add this assertion to the existing test:

In `test_state_initializer_preserves_existing_state_and_adds_defaults`, add after the existing assertions:

```python
    assert callback_context.state["loading_step"] == ""
```

- [ ] **Step 7: Also verify instruction test covers `loading_step` placeholder**

In `test_agent_instruction_uses_adk_state_placeholders`, add:

```python
    assert "{loading_step}" in instruction
```

Run:

```bash
uv run pytest agents/oralboards/tests/test_oralboards_state_tools.py -v
```

Expected: all pass (the `make_state_instruction` helper auto-includes all state fields).

- [ ] **Step 8: Commit**

```bash
git add agents/oralboards/src/oralboards_agent/agent.py agents/oralboards/tests/test_oralboards_state_tools.py
git commit -m "feat(oralboards): add loading_step state field and set_loading_step tool"
```

---

### Task 2: Add PredictStateMapping in main.py

**Files:**

- Modify: `agents/oralboards/src/oralboards_agent/main.py`

No unit test for this — it's pure wiring. Covered by the shared `test_build_adk_agent_forwards_predict_state` test in `agents/shared/tests/test_app_factory.py`.

- [ ] **Step 1: Add the predict-state config**

Replace the `register` function in `agents/oralboards/src/oralboards_agent/main.py` so the full file reads:

```python
"""Oral Boards Examiner Agent — wiring (see agent.py / db.py for domain logic)."""

from agents_shared.app_factory import (
    add_agent_routes,
    build_adk_agent,
    streaming_state_mapping,
)
from agents_shared.dependencies import AgentServices
from agents_shared.session_service import check_database_connection
from agents_shared.state import make_extract_state
from dotenv import load_dotenv
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncEngine

from .agent import build_agent
from .db import DB_STARTUP_ERROR

load_dotenv()

ORALBOARDS_PREDICT_STATE = [
    streaming_state_mapping(state_key="case", tool="set_case", tool_argument="case"),
    streaming_state_mapping(
        state_key="score_card", tool="set_score_card", tool_argument="markdown"
    ),
]

_oralboards_agent = build_agent()


async def _health(engine: AsyncEngine) -> dict:
    if DB_STARTUP_ERROR:
        return {"status": "unhealthy", "database": "error", "error": DB_STARTUP_ERROR}
    return await check_database_connection(engine)


def register(app: FastAPI, services: AgentServices):
    add_agent_routes(
        app,
        prefix="/oralboards",
        adk_agent=build_adk_agent(
            _oralboards_agent, services=services, predict_state=ORALBOARDS_PREDICT_STATE
        ),
        extract_state_from_request=make_extract_state(),
        health_check=_health,
    )
```

- [ ] **Step 2: Verify no import errors**

```bash
uv run python -c "from oralboards_agent.main import register; print('ok')"
```

Expected: `ok`

- [ ] **Step 3: Run full Python test suite**

```bash
uv run pytest agents/oralboards/ -v
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add agents/oralboards/src/oralboards_agent/main.py
git commit -m "feat(oralboards): stream case and score_card via PredictStateMapping"
```

---

### Task 3: Update agent instruction to call `set_loading_step`

**Files:**

- Modify: `agents/oralboards/src/oralboards_agent/agent.py`

- [ ] **Step 1: Add the loading-step protocol to `_STATIC_INSTRUCTION`**

In `agents/oralboards/src/oralboards_agent/agent.py`, find the `_STATIC_INSTRUCTION` string. After the `## Exam flow` header and before the numbered steps (around where "1. Pick a topic" appears), insert a new section. Add the `## Loading step protocol` block immediately before `## Exam flow`:

```python
_STATIC_INSTRUCTION = (
    """\
You are an ABPD Oral Clinical Exam (OCE) practice examiner for pediatric dentistry.

The UI canvas is the source of truth.

"""
    + _CANVAS_CONTRACT
    + """

## Source collections
Three bundled collections are available via search_docs and read_doc:
- aapd  — AAPD clinical practice guidelines and best-practice papers
- abpd  — ABPD OCE guides, scoring rubrics, and qualifying-exam structure
- cody  — Oral-boards prep course cases and topic-specific lecture notes

## Grounding rules (non-negotiable)
You MUST call search_docs before producing ANY clinical content — cases, questions,
feedback, or scoring. No exceptions. Never fill in clinical content from memory.

Search strategy:
1. Call search_docs with the topic keyword (no collection filter) to find the
   highest-ranked results across all collections.
2. Call search_docs again with collection="aapd" or collection="abpd" if you need
   guideline-specific or exam-structure content specifically.
3. Call read_doc on the most relevant filepath(s) to read the full document body
   before writing the case or feedback.

If search returns no results for a topic, tell the user the corpus doesn't cover
it and offer adjacent topics you found via search_docs. Do not improvise.

## Loading step protocol

Call set_loading_step at each of these moments to show the user what you are doing:

| Moment | Step text |
|--------|-----------|
| Before the first search_docs call when building a case | "Searching clinical guidelines…" |
| Before each read_doc call | "Reading: <document title>…" (use the actual document title) |
| Immediately before calling set_case | "Composing case vignette…" |
| After a candidate submits an answer, before re-searching | "Reviewing your answer…" |
| Before calling append_exchange | "Composing feedback…" |
| Before calling set_score_card | "Computing score card…" |

Always call set_loading_step before the long operation, not after.

## Exam flow
```

(Keep the rest of `_STATIC_INSTRUCTION` identical — exam flow steps 1–6, blueprint domains, scoring rubric.)

- [ ] **Step 2: Write a test that the static instruction mentions `set_loading_step`**

Add to `agents/oralboards/tests/test_oralboards_state_tools.py`:

```python
def test_agent_static_instruction_includes_loading_step_protocol() -> None:
    agent = build_agent()
    static = agent.static_instruction
    assert isinstance(static, str)
    assert "set_loading_step" in static
    assert "Searching clinical guidelines" in static
    assert "Computing score card" in static
```

- [ ] **Step 3: Run the test**

```bash
uv run pytest agents/oralboards/tests/test_oralboards_state_tools.py::test_agent_static_instruction_includes_loading_step_protocol -v
```

Expected: `PASSED`

- [ ] **Step 4: Run full oralboards test suite**

```bash
uv run pytest agents/oralboards/ -v
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add agents/oralboards/src/oralboards_agent/agent.py agents/oralboards/tests/test_oralboards_state_tools.py
git commit -m "feat(oralboards): instruct agent to call set_loading_step at key phases"
```

---

### Task 4: Add `loading_step` to the TypeScript shared types

**Files:**

- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Add the field**

In `packages/types/src/index.ts`, find `OralBoardsState` (currently around line with `score_card?: string`) and add `loading_step`:

```typescript
export type OralBoardsState = {
  case?: string;
  case_sources?: CaseSource[];
  phase?: OralBoardsPhase;
  transcript?: OralBoardsExchange[];
  score_card?: string;
  status?: OralBoardsPhase | "idle";
  loading_step?: string;
};
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
pnpm --filter @agents/types build 2>&1 | tail -5
```

Expected: exits 0, no type errors.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): add loading_step to OralBoardsState"
```

---

### Task 5: Frontend — start page shows `loading_step`

**Files:**

- Modify: `apps/web/src/components/chat/oral-boards-workspace.tsx`

- [ ] **Step 1: Update `OralBoardsStartPage` to show the live loading step**

In `apps/web/src/components/chat/oral-boards-workspace.tsx`, find the `isGenerating` branch of `OralBoardsStartPage`. It currently receives only `onStart` and `isGenerating` props. We need to also pass `loadingStep`.

Update the prop type:

```tsx
function OralBoardsStartPage({
  onStart,
  isGenerating,
  loadingStep,
}: {
  onStart: (message: string) => void;
  isGenerating: boolean;
  loadingStep: string;
}) {
  if (isGenerating) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="border-primary size-8 animate-spin rounded-full border-2 border-t-transparent" />
        <p className="text-muted-foreground text-sm">
          {loadingStep || "Building your case…"}
        </p>
      </div>
    );
  }
  // ... rest unchanged
```

Then in `OralBoardsWorkspace`, pass `loadingStep` when rendering `OralBoardsStartPage`:

```tsx
<OralBoardsStartPage
  onStart={(m) => void handleStart(m)}
  isGenerating={isGenerating}
  loadingStep={examState.loading_step ?? ""}
/>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter web tsc --noEmit 2>&1 | tail -10
```

Expected: no errors referencing `oral-boards-workspace.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/oral-boards-workspace.tsx
git commit -m "feat(web/oralboards): show live loading_step on start page during case generation"
```

---

### Task 6: Frontend — questioning pane and score card pane fixes

**Files:**

- Modify: `apps/web/src/components/chat/oral-boards/oral-boards-panel.tsx`

- [ ] **Step 1: Add `loadingStep` prop to `QuestioningPane`**

Find the `QuestioningPane` component (currently around line 223). Add `loadingStep` as an optional prop with a default so existing tests don't need to change:

```tsx
function QuestioningPane({
  caseBody,
  sources,
  transcript,
  onAnswer,
  isRunning,
  loadingStep = "",
}: {
  caseBody: string;
  sources: CaseSource[];
  transcript: OralBoardsExchange[];
  onAnswer: (text: string) => void;
  isRunning: boolean;
  loadingStep?: string;
}) {
```

Then find the line that reads:

```tsx
<p className="text-sm leading-relaxed">{question || "Waiting for the next question…"}</p>
```

Replace it with:

```tsx
<p className="text-sm leading-relaxed">
  {question || (isRunning && loadingStep) || "Waiting for the next question…"}
</p>
```

- [ ] **Step 2: Thread `loadingStep` through `OralBoardsPanel`**

Find the `OralBoardsPanel` component props (around line 356). Add `loadingStep` as optional with a default so existing tests don't need updating:

```tsx
export function OralBoardsPanel({
  state,
  fullscreen,
  onClose,
  onToggleFullscreen,
  onReady,
  onAnswer,
  isRunning,
  loadingStep = "",
}: {
  state: OralBoardsState;
  fullscreen: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
  onReady: () => void;
  onAnswer: (text: string) => void;
  isRunning: boolean;
  loadingStep?: string;
}) {
```

Then find the `QuestioningPane` usage and pass `loadingStep`:

```tsx
{
  status === "questioning" && (
    <QuestioningPane
      caseBody={caseBody}
      sources={sources}
      transcript={transcript}
      onAnswer={onAnswer}
      isRunning={isRunning}
      loadingStep={loadingStep}
    />
  );
}
```

- [ ] **Step 3: Fix the `FeedbackPane` gate to support score card streaming**

Find the `FeedbackPane` render condition (currently `status === "complete" || status === "feedback"`). Replace it:

```tsx
{
  (status === "complete" || status === "feedback" || Boolean(scoreCard.trim())) && (
    <FeedbackPane scoreCard={scoreCard} transcript={transcript} />
  );
}
```

- [ ] **Step 4: Pass `loadingStep` from `OralBoardsWorkspace`**

In `apps/web/src/components/chat/oral-boards-workspace.tsx`, find the `OralBoardsPanel` usage and add the prop:

```tsx
<OralBoardsPanel
  state={examState}
  fullscreen={state === "fullscreen"}
  onClose={() => dispatch("close")}
  onToggleFullscreen={() => dispatch("toggle-fullscreen")}
  onReady={handleReady}
  onAnswer={(text) => void handleAnswer(text)}
  isRunning={isRunning}
  loadingStep={examState.loading_step ?? ""}
/>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
pnpm --filter web tsc --noEmit 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 6: Run the existing panel unit tests**

```bash
pnpm --filter web exec vitest run src/components/chat/oral-boards/oral-boards-panel.test.tsx
```

Expected: all pass. `loadingStep` defaults to `""` on both `OralBoardsPanel` and `QuestioningPane`, so no existing test call sites need updating.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/chat/oral-boards/oral-boards-panel.tsx apps/web/src/components/chat/oral-boards-workspace.tsx
git commit -m "feat(web/oralboards): show loading_step in questioning pane; open score card pane early during streaming"
```

---

### Task 7: Final check

- [ ] **Step 1: Run all Python tests**

```bash
uv run pytest agents/oralboards/ -v
```

Expected: all pass.

- [ ] **Step 2: Run all web tests**

```bash
pnpm --filter web exec vitest run
```

Expected: all pass.

- [ ] **Step 3: Run linter and formatter**

```bash
pnpm lint:py && pnpm lint
```

Expected: exits 0.
