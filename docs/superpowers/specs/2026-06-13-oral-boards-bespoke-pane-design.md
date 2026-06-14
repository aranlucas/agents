# Oral Boards — bespoke side pane

**Date:** 2026-06-13
**Status:** Approved (design)

## Background

The console was just restructured so each agent owns an explicit route folder
under `/console/<agent>` sharing `console/layout.tsx`. The default experience is
`<AgentWorkspace>` (chat + a generic `ArtifactPanel` that renders one
`stateField` as markdown). Oral Boards is the first agent whose state is richer
than a single markdown blob, so it becomes the first agent to render a bespoke
side pane.

The Oral Boards agent (`agents/oralboards`) writes this shared ADK state
(`OralBoardsState` in `packages/types`):

- `case: string` — the case vignette (markdown)
- `case_sources: CaseSource[]` — citation chips for the case
- `status: "idle" | "presenting" | "questioning" | "feedback" | "complete"`
- `transcript: OralBoardsExchange[]` — completed exchanges, each
  `{ question, answer, feedback, citations }`
- `score_card: string` — final scoring/feedback (markdown)

Today only `case` is surfaced (as plain markdown); the transcript and score card
are invisible in the UI.

## Goals

- Keep chat the primary surface; the two-pane `WorkspaceShell` layout is
  unchanged. Only the side pane is bespoke for Oral Boards.
- The side pane renders **case / question / feedback** distinctly.
- The **case vignette is persistent** — pinned and always available, since it is
  the shared stimulus for every question.
- The case vignette can be **presented aloud** via a play/stop control, at a
  slower-than-normal rate to aid presentation.
- Slim the over-built `speak_question` frontend tool down to a plain "speak this
  question" tool, renamed `ask_question`.

## Non-goals

- No change to the chat surface, `NavRail`, or `WorkspaceShell`.
- No change to other agents' workspaces or the generic `ArtifactPanel`.
- No new TTS engine — reuse the existing Kokoro pipeline with a `speed` option.

## Design

### 1. Workspace boundary

`console/oral-boards/[thread]/page.tsx` renders a new
`<OralBoardsWorkspace agentId="oral-boards" />` instead of `<AgentWorkspace>`.

`OralBoardsWorkspace` composes the **same primitives** as `AgentWorkspace`
(`NavRail`, `ChatSurface`, `WorkspaceShell`, artifact-panel state hook), so chat
behavior is identical. Differences:

- The side pane is `<OralBoardsPanel>` instead of `<ArtifactPanel>`.
- "Has panel" is gated on `state.case` being present (not `selectArtifact`).

To avoid duplicating the new-thread logic, extract it from `AgentWorkspace` into
a small shared hook `useNewThread(agentId)` (aborts an in-flight run, then routes
to a fresh thread id). Both workspaces use it.

Rationale: a sibling component (rather than a generic `renderArtifact` slot on
`AgentWorkspace`) keeps boundaries honest — Oral Boards' panel needs the full
typed state and its own visibility rule, which a generic slot would leak.

### 2. `OralBoardsPanel`

Reads `OralBoardsState` via `useAgent({ agentId, updates: [OnStateChanged] })`.

Structure (top to bottom):

- **`CaseVignette`** — pinned, collapsible.
  - Renders `state.case` (markdown via `Streamdown`, matching `ArtifactPanel`).
  - `case_sources` rendered as citation chips.
  - **Present case** button: play/stop toggle. Play calls `speak(case, { speed: CASE_SPEED })`; stop calls `stopSpeaking()`. Button reflects playing state.
- **Tabs: `Question` | `Feedback`** — auto-selected from `state.status`
  (`questioning` → Question; `feedback`/`complete` → Feedback; `idle`/
  `presenting` default to Question). User can switch manually to revisit; manual
  selection sticks until the next phase change.
  - **`QuestionView`** — the current question text only (see §3 for source).
  - **`FeedbackView`** — `score_card` (markdown, shown when non-empty) above a
    `transcript[]` timeline; each exchange shows the question, the candidate's
    answer, the cited feedback, and `citations` as chips.

### 3. Live-question data flow

The live, unanswered question is not in ADK shared state (it exists only in the
chat and the `ask_question` tool call until `append_exchange` records it). A
tiny module store holds it:

- `apps/web/src/lib/copilotkit/oral-boards-question.ts` — a `useSyncExternalStore`
  store with `setCurrentQuestion(text)`, `clearCurrentQuestion()`, and a
  `useCurrentQuestion()` hook.
- The `ask_question` handler calls `setCurrentQuestion(question)`.
- `QuestionView` reads `useCurrentQuestion()`.

Once answered, the question is in `transcript`, so `FeedbackView` stays purely
state-driven.

### 4. TTS — generalize `speak-question.ts`

- Add a `speed` option threaded into `tts.generate(text, { voice, speed })`
  (Kokoro) and into the browser fallback `SpeechSynthesisUtterance.rate`.
- Expose `speak(text, { speed }?)` as the core; keep a `speakQuestion(text)`
  thin wrapper (speed `1.0`) for compatibility, or update callers — whichever is
  cleaner during implementation.
- Add `stopSpeaking()` that stops the current `Audio` element and calls
  `speechSynthesis.cancel()`, so a long case read can be interrupted. Track the
  active player in module scope.
- Constants: `CASE_SPEED ≈ 0.8` (slower presentation), questions at `1.0`.
- `preloadKokoro` warmup is unchanged.

### 5. `ask_question` rename + slim

- `OralBoardsExtension` (`apps/web/.../agents/oral-boards.tsx`): rename the tool
  `speak_question` → `ask_question`; parameters reduce to `{ question: string }`
  (drop `purpose`, `evaluationFocus`, `sourceBasis`). Handler:
  `setCurrentQuestion(question)` then `speak(question)`. Keep the Kokoro warmup
  effect. Update the `render` (`SpeakQuestionToolCall`) to the slimmer args
  (rename if appropriate).
- `agents/oralboards/src/oralboards_agent/agent.py`: update the prompt where it
  instructs `speak_question(question, purpose, evaluationFocus, sourceBasis)` to
  `ask_question(question)`, and remove the now-irrelevant detail fields from the
  surrounding instructions.
- `registry.ts`: remove Oral Boards' now-unused `artifact` entry (the bespoke
  panel supersedes the generic artifact selection).

## Testing

- Rewrite `speak-question.test.ts`: cover `speak`/`stopSpeaking`; assert `speed`
  reaches `generate` and the browser fallback `utterance.rate`; keep the
  Kokoro-unavailable fallback path.
- Unit-test `oral-boards-question.ts` (set → subscriber notified → get; clear).
- Keep all existing web tests green; `pnpm --filter web build` must pass.
- Optionally add `OralBoardsPanel` render coverage to the all-source smoke test.

## Files touched

**Web (new):**
- `apps/web/src/components/chat/OralBoardsWorkspace.tsx`
- `apps/web/src/components/chat/oral-boards/OralBoardsPanel.tsx` (+ `CaseVignette`, `QuestionView`, `FeedbackView` — split as size warrants)
- `apps/web/src/lib/copilotkit/oral-boards-question.ts`

**Web (changed):**
- `apps/web/src/app/console/oral-boards/[thread]/page.tsx` — render the bespoke workspace
- `apps/web/src/components/chat/AgentWorkspace.tsx` — extract `useNewThread`
- `apps/web/src/components/chat/agents/oral-boards.tsx` — `ask_question` rename/slim
- `apps/web/src/lib/copilotkit/speak-question.ts` — `speak`/`speed`/`stopSpeaking`
- `apps/web/src/lib/copilotkit/speak-question.test.ts`
- `apps/web/src/components/chat/agents/registry.ts` — drop oral-boards `artifact`
- `apps/web/src/components/chat/SpeakQuestionToolCall.tsx` — slimmer args (rename optional)

**Agent:**
- `agents/oralboards/src/oralboards_agent/agent.py` — prompt: `ask_question(question)`
