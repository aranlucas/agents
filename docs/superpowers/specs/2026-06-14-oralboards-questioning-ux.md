# Oral Boards — Questioning UX Redesign

**Date:** 2026-06-14  
**Scope:** `OralBoardsPanel.tsx` · `OralBoardsWorkspace.tsx` · `agents/oralboards/src/oralboards_agent/agent.py`

---

## Problem

1. **No answer input in the panel.** Candidates type answers in the CopilotKit sidebar chat, making the exam panel passive. The sidebar is meant for reasoning, not interaction.
2. **AI self-answering.** After `ask_question`, the agent continues its reasoning loop before the candidate submits — likely because the sidebar can trigger an agent run independently of user intent.
3. **Questioning pane layout is cluttered.** The current pane shows the full transcript as a scrolling list, crowding the current question.

---

## Goal

The exam panel is the sole interaction surface during questioning. The sidebar becomes a read-only reasoning log. Submitting an answer from the panel is the only way to advance the agent.

---

## Questioning Pane Layout

### Prior exchanges — chip row

Completed Q&A pairs collapse to small pills above the active card:

```
Q1 · Initial impression ✓    Q2 · Data gathering ✓
```

Each chip is clickable and expands inline to show the full question, the candidate's answer, and feedback. Chips stay collapsed by default to keep focus on the current question.

### Active question card

The current question occupies a highlighted card with an indigo border:

```
┌─────────────────────────────────────────────────┐ ← indigo border
│ Q3 — MANAGEMENT                                 │
│                                                 │
│ What is your recommended treatment plan for     │
│ this pulp exposure?                             │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ Type your answer…                           │ │
│ └─────────────────────────────────────────────┘ │
│                              🎙 Record  Submit  │
└─────────────────────────────────────────────────┘
```

- **Interview phase label** (e.g. "Q3 — Management") derived from the question number and the `ask_question` sequence.
- **Textarea** — free-text, grows to fill available space.
- **Record button** — toggle-record: click to start, click to stop; transcript populates the textarea. Reuses the existing `TranscribeButton` / Groq transcription path.
- **Submit button** — calls `onAnswer(text)` and clears the textarea. Disabled while agent is running.

### Case vignette (bottom)

Collapsed `<details>` at the bottom of the panel. Same as present.

---

## Sidebar — Read-only reasoning log

`CopilotSidebar` is rendered with `defaultOpen={false}`. The input area is hidden via a CSS override scoped to the sidebar container so the sidebar becomes a reasoning-only view. No text input, no submit — the candidate cannot trigger an agent run from the sidebar.

```tsx
<CopilotSidebar defaultOpen={false} labels={{ title: "Agent reasoning" }} />
```

CSS override (global or scoped):

```css
/* Hide sidebar input toolbar */
[data-copilotkit-sidebar] form,
[data-copilotkit-sidebar] [role="toolbar"] {
  display: none;
}
```

If CopilotSidebar does not expose a stable selector, wrap it in a `<div>` with a known className and scope the override to that class.

---

## Answer submission flow

`OralBoardsWorkspace` adds `handleAnswer`:

```ts
const handleAnswer = useCallback(
  async (text: string) => {
    if (!agent || !text.trim()) return;
    agent.addMessage({ id: crypto.randomUUID(), role: "user", content: text });
    await copilotkit.runAgent({ agent });
  },
  [agent, copilotkit],
);
```

`OralBoardsPanel` receives `onAnswer: (text: string) => void`. The submit button in `QuestioningPane` calls `onAnswer(answerText)` and clears local state.

The agent is invoked **only** from this path — not from the sidebar.

---

## AI self-answering fix — three layers

### Layer 1: Panel owns `runAgent`

The sidebar has no input. The only `runAgent` call in the questioning phase comes from `handleAnswer`. This eliminates accidental re-invocations.

### Layer 2: System prompt hardened

Replace the current step 4 instruction in `_STATIC_INSTRUCTION` with:

```
4. For each question:
   a. Call ask_question with the exact question text.
   b. Write ONLY that question in chat — one sentence, no elaboration.
   c. STOP COMPLETELY. Do not call any tool. Do not write any more text.
      Do not proceed until a candidate message arrives.
```

### Layer 3: `ask_question` return value

The tool handler returns `"ok"` (already changed). The system prompt references this: returning `"ok"` signals the tool succeeded; the agent must treat this as a hard stop.

---

## `useAnswerRecorder` hook

New hook in `apps/web/src/lib/copilotkit/use-answer-recorder.ts`:

```ts
export function useAnswerRecorder(onTranscript: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  // Uses the browser MediaRecorder API + CopilotKit's existing
  // /api/copilotkit/transcribe endpoint (Groq under the hood)
  const toggle = useCallback(() => { ... }, []);
  return { recording, toggle };
}
```

- Click to start: `MediaRecorder` begins capturing mic audio.
- Click to stop: audio blob sent to `/api/copilotkit/transcribe`, transcript appended to the textarea.
- While recording: Record button shows a red pulsing dot and "Stop" label.

**Alternative:** reuse `TranscribeButton` from `ChatSurface` if it can be used standalone outside the `PromptInput` context. Check this first before writing a new hook — prefer reuse.

---

## Component changes

### `OralBoardsPanel.tsx`

| Change                | Detail                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------- |
| `QuestioningPane`     | Replace transcript list with: chip row + active question card + answer input            |
| New prop `onAnswer`   | `(text: string) => void` on `OralBoardsPanel` and `QuestioningPane`                     |
| Chip expand           | Click chip → expands to show full Q + answer + feedback inline, click again to collapse |
| Submit disabled state | Button disabled when `isRunning` (passed from workspace via new `isRunning` prop)       |

### `OralBoardsWorkspace.tsx`

| Change           | Detail                                                               |
| ---------------- | -------------------------------------------------------------------- |
| `handleAnswer`   | New callback: `addMessage + runAgent`                                |
| Pass `onAnswer`  | Pass `handleAnswer` to `OralBoardsPanel`                             |
| Pass `isRunning` | `agent?.isRunning ?? false` — panel disables submit while agent runs |
| Sidebar CSS      | Scoped override to hide sidebar input                                |

### `agent.py`

| Change                          | Detail                                                           |
| ------------------------------- | ---------------------------------------------------------------- |
| Step 4 in `_STATIC_INSTRUCTION` | Rewrite to explicit 3-step: ask_question → write question → STOP |

---

## Out of scope

- Feedback display in chips after `append_exchange` — chips show "✓" only during active session; feedback is still visible in the `complete` / score card pane.
- Mobile (`apps/mobile`) oral-boards UI.
- Sidebar visual customization beyond hiding the input.
