# Oral Boards Bespoke Side Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Oral Boards agent a bespoke two-pane console where the side pane renders the case (persistent, with a slower "Present case" TTS), the live question, and feedback/score-card distinctly — instead of the generic markdown artifact panel.

**Architecture:** A dedicated `OralBoardsWorkspace` reuses the shared `WorkspaceShell`/`NavRail`/`ChatSurface` primitives but swaps in an `OralBoardsPanel`. The panel reads typed `OralBoardsState` from CopilotKit. The live (unanswered) question lives in a small `useSyncExternalStore` module set by the slimmed-down `ask_question` frontend tool. TTS is generalized to accept a `speed` and a `stopSpeaking()`.

**Tech Stack:** Next.js 16 (App Router), React 19, CopilotKit v2, `kokoro-js` (local WASM TTS), `streamdown`, vitest, Python ADK (agent prompt only).

---

## File Structure

**New (web):**
- `apps/web/src/lib/copilotkit/oral-boards-question.ts` — live-question store
- `apps/web/src/lib/copilotkit/oral-boards-question.test.ts`
- `apps/web/src/components/chat/use-new-thread.ts` — shared new-thread hook
- `apps/web/src/components/chat/oral-boards/OralBoardsPanel.tsx` — the bespoke pane (+ `CaseVignette`, `QuestionView`, `FeedbackView`, `CitationChips`, `tabForStatus`)
- `apps/web/src/components/chat/oral-boards/tab-for-status.ts` — pure phase→tab helper
- `apps/web/src/components/chat/oral-boards/tab-for-status.test.ts`
- `apps/web/src/components/chat/OralBoardsWorkspace.tsx`

**Modified (web):**
- `apps/web/src/lib/copilotkit/speak-question.ts` — `speak(text,{speed})`, `stopSpeaking()`
- `apps/web/src/lib/copilotkit/speak-question.test.ts`
- `apps/web/src/components/chat/agents/oral-boards.tsx` — `ask_question` rename/slim
- `apps/web/src/components/chat/SpeakQuestionToolCall.tsx` — slim params, tool name
- `apps/web/src/components/chat/AgentWorkspace.tsx` — use `useNewThread`
- `apps/web/src/components/chat/agents/registry.ts` — drop oral-boards `artifact`
- `apps/web/src/components/chat/artifact.ts` — remove dead oral-boards branch + helper
- `apps/web/src/app/console/oral-boards/[thread]/page.tsx` — render `OralBoardsWorkspace`

**Modified (agent):**
- `agents/oralboards/src/oralboards_agent/agent.py` — prompt: `ask_question(question)`

---

## Task 1: Generalize TTS with `speed` and `stopSpeaking`

**Files:**
- Modify: `apps/web/src/lib/copilotkit/speak-question.ts`
- Test: `apps/web/src/lib/copilotkit/speak-question.test.ts`

- [ ] **Step 1: Update the failing tests**

Replace the first two `it(...)` blocks in `speak-question.test.ts` and add a speed + stop test. Add `import { speak, stopSpeaking } from "./speak-question";` to the existing import line (keep `preloadKokoro`, `speakQuestion`).

```ts
  it("passes speed through to Kokoro generate", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const generate = vi.fn().mockResolvedValue({
      toBlob: () => new Blob(["audio"], { type: "audio/wav" }),
    });
    const fromPretrained = vi.fn().mockResolvedValue({ generate });
    const importKokoro = vi.fn().mockResolvedValue({
      KokoroTTS: { from_pretrained: fromPretrained },
    });

    await speak("Read the case slowly.", {
      speed: 0.8,
      AudioCtor: class MockAudio {
        constructor(public src: string) {}
        addEventListener = vi.fn();
        play = play;
      } as unknown as typeof Audio,
      createObjectURL: vi.fn().mockReturnValue("blob:case"),
      importKokoro,
      revokeObjectURL: vi.fn(),
    });

    expect(generate).toHaveBeenCalledWith("Read the case slowly.", { voice: "af_sky", speed: 0.8 });
    expect(play).toHaveBeenCalledOnce();
  });

  it("defaults speed to 1 for speakQuestion", async () => {
    const generate = vi.fn().mockResolvedValue({
      toBlob: () => new Blob(["audio"], { type: "audio/wav" }),
    });
    const importKokoro = vi.fn().mockResolvedValue({
      KokoroTTS: { from_pretrained: vi.fn().mockResolvedValue({ generate }) },
    });

    await speakQuestion("What is your diagnosis?", {
      AudioCtor: class MockAudio {
        constructor(public src: string) {}
        addEventListener = vi.fn();
        play = vi.fn().mockResolvedValue(undefined);
      } as unknown as typeof Audio,
      createObjectURL: vi.fn().mockReturnValue("blob:q"),
      importKokoro,
      revokeObjectURL: vi.fn(),
    });

    expect(generate).toHaveBeenCalledWith("What is your diagnosis?", { voice: "af_sky", speed: 1 });
  });

  it("applies speed to the browser fallback rate", async () => {
    const speakSpy = vi.fn();
    const utterances: { text: string; rate?: number }[] = [];
    class RateUtterance {
      rate?: number;
      constructor(public text: string) {
        utterances.push(this);
      }
    }

    await speak("Read the case slowly.", {
      speed: 0.8,
      importKokoro: vi.fn().mockRejectedValue(new Error("model unavailable")),
      speechSynthesis: { cancel: vi.fn(), speak: speakSpy } as unknown as SpeechSynthesis,
      SpeechSynthesisUtteranceCtor: RateUtterance as unknown as typeof SpeechSynthesisUtterance,
    });

    expect(utterances[0]?.rate).toBe(0.8);
    expect(speakSpy).toHaveBeenCalledOnce();
  });

  it("stopSpeaking cancels browser speech and the active player", () => {
    const cancel = vi.fn();
    stopSpeaking({ speechSynthesis: { cancel } as unknown as SpeechSynthesis });
    expect(cancel).toHaveBeenCalledOnce();
  });
```

Update the existing "uses local Kokoro TTS by default" test's assertion from
`{ voice: "af_sky" }` to `{ voice: "af_sky", speed: 1 }`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web exec vitest run src/lib/copilotkit/speak-question.test.ts`
Expected: FAIL — `speak`/`stopSpeaking` not exported; `generate` called without `speed`.

- [ ] **Step 3: Implement the generalization**

In `speak-question.ts`:

Add `speed` to the deps type:

```ts
type SpeakQuestionDeps = {
  AudioCtor?: typeof Audio;
  createObjectURL?: (blob: Blob) => string;
  importKokoro?: () => Promise<KokoroModule>;
  revokeObjectURL?: (url: string) => void;
  speechSynthesis?: SpeechSynthesis;
  SpeechSynthesisUtteranceCtor?: typeof SpeechSynthesisUtterance;
  speed?: number;
};
```

Add a module-scoped handle to the active player (declare near `kokoroTtsPromise`):

```ts
let activePlayer: HTMLAudioElement | undefined;
```

Thread `speed` into Kokoro generate (default 1):

```ts
async function speakWithKokoro(text: string, deps: SpeakQuestionDeps) {
  const tts = await loadKokoro(deps.importKokoro);
  const audio = await tts.generate(text, { voice: KOKORO_VOICE, speed: deps.speed ?? 1 });
  await playBlob(await audioToBlob(audio), deps);
}
```

Track the player in `playBlob` so it can be stopped (replace the existing body):

```ts
async function playBlob(blob: Blob, deps: SpeakQuestionDeps) {
  const AudioPlayer = deps.AudioCtor ?? globalThis.Audio;
  const { createObjectURL, revokeObjectURL } = getObjectUrlApi(deps);
  const url = createObjectURL(blob);
  const player = new AudioPlayer(url);
  activePlayer = player;
  try {
    await player.play();
    player.addEventListener("ended", () => revokeObjectURL(url), { once: true });
    player.addEventListener("error", () => revokeObjectURL(url), { once: true });
  } catch (error) {
    revokeObjectURL(url);
    throw error;
  }
}
```

Apply `speed` to the browser fallback rate (replace `speakWithBrowserSpeech`):

```ts
function speakWithBrowserSpeech(text: string, deps: SpeakQuestionDeps, message: string) {
  const { speech, Utterance } = getBrowserSpeech(deps);
  if (!speech || !Utterance) {
    return `${message} Browser speech synthesis is unavailable.`;
  }
  speech.cancel();
  const utterance = new Utterance(text);
  if (deps.speed != null) utterance.rate = deps.speed;
  speech.speak(utterance);
  return message;
}
```

Add the generic `speak` and `stopSpeaking`, and make `speakQuestion` a thin
wrapper. Add `speak` as the core (rename the body of the old `speakQuestion`):

```ts
export async function speak(text: string, deps: SpeakQuestionDeps = {}): Promise<string> {
  try {
    await speakWithKokoro(text, deps);
    return "Used local Kokoro TTS.";
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    kokoroTtsPromise = undefined;
    return speakWithBrowserSpeech(
      text,
      deps,
      `Local Kokoro TTS unavailable (${detail}); used browser speech synthesis.`,
    );
  }
}

export function speakQuestion(question: string, deps: SpeakQuestionDeps = {}): Promise<string> {
  return speak(question, { ...deps, speed: deps.speed ?? 1 });
}

export function stopSpeaking(deps: Pick<SpeakQuestionDeps, "speechSynthesis"> = {}): void {
  const speech = deps.speechSynthesis ?? globalThis.speechSynthesis;
  speech?.cancel();
  if (activePlayer) {
    activePlayer.pause();
    activePlayer = undefined;
  }
}
```

Delete the now-duplicated old `speakQuestion` implementation body (the one that
called `speakWithKokoro` directly). Keep `speakQuestionWithBrowserSpeech` as-is.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web exec vitest run src/lib/copilotkit/speak-question.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/copilotkit/speak-question.ts apps/web/src/lib/copilotkit/speak-question.test.ts
git commit -m "Add speed option and stopSpeaking to TTS"
```

---

## Task 2: Live-question store

**Files:**
- Create: `apps/web/src/lib/copilotkit/oral-boards-question.ts`
- Test: `apps/web/src/lib/copilotkit/oral-boards-question.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";

import {
  clearCurrentQuestion,
  getCurrentQuestion,
  setCurrentQuestion,
  subscribeCurrentQuestion,
} from "./oral-boards-question";

describe("oral-boards question store", () => {
  it("stores and returns the current question", () => {
    setCurrentQuestion("What is your management?");
    expect(getCurrentQuestion()).toBe("What is your management?");
  });

  it("notifies subscribers on change and clear", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCurrentQuestion(listener);
    setCurrentQuestion("Q1");
    clearCurrentQuestion();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    setCurrentQuestion("Q2");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run src/lib/copilotkit/oral-boards-question.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the store**

```ts
"use client";

import { useSyncExternalStore } from "react";

let current = "";
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setCurrentQuestion(question: string) {
  if (question === current) return;
  current = question;
  emit();
}

export function clearCurrentQuestion() {
  setCurrentQuestion("");
}

export function getCurrentQuestion() {
  return current;
}

export function subscribeCurrentQuestion(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCurrentQuestion() {
  return useSyncExternalStore(subscribeCurrentQuestion, getCurrentQuestion, getCurrentQuestion);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run src/lib/copilotkit/oral-boards-question.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/copilotkit/oral-boards-question.ts apps/web/src/lib/copilotkit/oral-boards-question.test.ts
git commit -m "Add live-question store for oral-boards pane"
```

---

## Task 3: Rename + slim `ask_question` frontend tool

**Files:**
- Modify: `apps/web/src/components/chat/agents/oral-boards.tsx`
- Modify: `apps/web/src/components/chat/SpeakQuestionToolCall.tsx`

- [ ] **Step 1: Slim `SpeakQuestionToolCall`**

Replace its params type and body to drop the detail fields, point the replay at
the captured question, and use the `ask_question` tool name. Replace the whole
file body below the imports (change the `speakQuestion` import to `speak`):

```tsx
"use client";

import { useCallback } from "react";
import { RotateCcwIcon, Volume2Icon } from "lucide-react";

import { Button } from "@agents/ui";
import { Tool, ToolContent, ToolHeader } from "@/components/ai-elements/tool";
import { speak } from "@/lib/copilotkit/speak-question";
import { toToolState } from "./tool-adapter";

export type SpeakQuestionToolParams = {
  question?: string;
};

const EMPTY_PARAMS: SpeakQuestionToolParams = {};

export function SpeakQuestionToolCall({
  status,
  parameters = EMPTY_PARAMS,
  result,
}: {
  status: "inProgress" | "executing" | "complete";
  parameters?: SpeakQuestionToolParams;
  result?: unknown;
}) {
  const replay = useCallback(() => {
    const question = parameters.question?.trim();
    if (question) void speak(question);
  }, [parameters.question]);
  const resultText = typeof result === "string" ? result : "";

  return (
    <Tool>
      <ToolHeader type="dynamic-tool" toolName="ask_question" state={toToolState(status)} />
      <ToolContent>
        <div className="space-y-3 border-t px-3 py-3">
          <div className="flex items-start gap-3">
            <div className="border-border bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md border">
              <Volume2Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Spoken examiner question
              </p>
              <p className="text-sm leading-relaxed">
                {parameters.question ?? "Preparing audio..."}
              </p>
            </div>
            {status === "complete" && (
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={replay}>
                <RotateCcwIcon className="size-3.5" />
                Replay
              </Button>
            )}
          </div>
          {resultText && <p className="text-muted-foreground text-xs">{resultText}</p>}
        </div>
      </ToolContent>
    </Tool>
  );
}
```

- [ ] **Step 2: Rename + slim the tool in `oral-boards.tsx`**

Update imports to add the store and keep the warmup; replace the `useFrontendTool`
call. New imports block:

```tsx
import { useFrontendTool } from "@copilotkit/react-core/v2";
import { z } from "zod";

import { SpeakQuestionToolCall } from "@/components/chat/SpeakQuestionToolCall";
import { preloadKokoro, speak } from "@/lib/copilotkit/speak-question";
import { setCurrentQuestion } from "@/lib/copilotkit/oral-boards-question";
import type { AgentId } from "./registry";
```

Replace the `useFrontendTool({...}, [agentId])` call with:

```tsx
  useFrontendTool(
    {
      name: "ask_question",
      description: "Speak the next oral boards examiner question aloud in the chat UI.",
      available: true,
      agentId,
      parameters: z.object({
        question: z.string().describe("The exact examiner question to speak aloud"),
      }),
      handler: ({ question }) => {
        setCurrentQuestion(question);
        return speak(question);
      },
      render: ({ status, args, result }) => (
        <SpeakQuestionToolCall status={status} parameters={args ?? {}} result={result} />
      ),
    },
    [agentId],
  );
```

Leave the `preloadKokoro` warmup `useEffect` unchanged.

- [ ] **Step 3: Verify type-check / lint passes**

Run: `pnpm --filter web exec vitest run` then `pnpm lint`
Expected: existing tests PASS, lint clean. (No new unit test — covered by the smoke + Task 8.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat/agents/oral-boards.tsx apps/web/src/components/chat/SpeakQuestionToolCall.tsx
git commit -m "Rename speak_question to ask_question and slim its args"
```

---

## Task 4: Update the agent prompt

**Files:**
- Modify: `agents/oralboards/src/oralboards_agent/agent.py`

- [ ] **Step 1: Read the prompt section**

Run: `grep -n "speak_question\|purpose\|evaluationFocus\|sourceBasis\|detail fields" agents/oralboards/src/oralboards_agent/agent.py`
Then open the surrounding instruction block (around the question-asking step).

- [ ] **Step 2: Apply the edits**

Replace the question-asking instructions so the model calls `ask_question` with
only the question text. Replace the block that currently reads (approximately):

```
   For every examiner question, first call the frontend tool speak_question
   before writing the question in chat. Include:
   - question: the exact question text.
   - purpose: why this question is being asked in the oral-board flow.
   - evaluationFocus: the clinical reasoning or ABPD competency being evaluated.
   - sourceBasis: the source document/guideline/case fact motivating the question.
```

with:

```
   For every examiner question, first call the frontend tool ask_question with
   the exact question text before writing the question in chat.
```

And replace the later reference:

```
5. Ask the next question, again calling speak_question with the exact text
   and detail fields before writing the question in chat.
```

with:

```
5. Ask the next question, again calling ask_question with the exact question
   text before writing the question in chat.
```

Search for any remaining `speak_question` occurrences and rename them to
`ask_question`.

- [ ] **Step 3: Verify no stale references and lint Python**

Run: `grep -rn "speak_question" agents/oralboards` (expect no matches)
Run: `pnpm lint:py`
Expected: no matches; Ruff clean.

- [ ] **Step 4: Commit**

```bash
git add agents/oralboards/src/oralboards_agent/agent.py
git commit -m "Update oral-boards prompt to call ask_question"
```

---

## Task 5: Remove the dead generic oral-boards artifact path

**Files:**
- Modify: `apps/web/src/components/chat/agents/registry.ts`
- Modify: `apps/web/src/components/chat/artifact.ts`

- [ ] **Step 1: Drop the registry `artifact` for oral-boards**

In `registry.ts`, in the `"oral-boards"` config object, delete the entire
`artifact: { ... }` block (the one with `stateField: "case"`). Leave the rest of
the oral-boards config (`id`, `label`, `glyph`, `colorVar`, `placeholder`,
`welcome`, `suggestions`) unchanged.

- [ ] **Step 2: Remove the dead branch + helper in `artifact.ts`**

Replace the `content` assignment in `selectArtifact` (lines ~80-83):

```ts
  const content = toContent(state[config.artifact.stateField]);
```

Then delete the now-unused `renderOralBoardsContent` function and, if they become
unused, the `renderSource` and `isRecord` helpers (verify with grep first).

- [ ] **Step 3: Verify usage is gone and tests pass**

Run: `grep -rn "renderOralBoardsContent" apps/web/src` (expect no matches)
Run: `pnpm --filter web exec vitest run`
Expected: no matches; all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat/agents/registry.ts apps/web/src/components/chat/artifact.ts
git commit -m "Drop generic artifact path for oral-boards"
```

---

## Task 6: Extract a shared `useNewThread` hook

**Files:**
- Create: `apps/web/src/components/chat/use-new-thread.ts`
- Modify: `apps/web/src/components/chat/AgentWorkspace.tsx`

- [ ] **Step 1: Create the hook**

```ts
"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAgent, UseAgentUpdate } from "@copilotkit/react-core/v2";

import type { AgentId } from "@/components/chat/agents/registry";

/**
 * Returns a "start a new thread" callback for the given agent: aborts any
 * in-flight run, then routes to a fresh thread id (the URL is the source of
 * truth for the active thread, so a new id starts a clean CopilotKit/ADK
 * session and the result is refreshable and shareable).
 */
export function useNewThread(agentId: AgentId) {
  const router = useRouter();
  const { agent } = useAgent({ agentId, updates: [UseAgentUpdate.OnRunStatusChanged] });
  return useCallback(() => {
    if (agent?.isRunning) agent.abortRun();
    router.push(`/console/${agentId}/${crypto.randomUUID()}`);
  }, [agent, agentId, router]);
}
```

- [ ] **Step 2: Use it in `AgentWorkspace`**

In `AgentWorkspace.tsx`, add `import { useNewThread } from "@/components/chat/use-new-thread";`,
delete the local `startNewThread` `useCallback` (and the now-unused `useRouter`
import only if nothing else uses it — `router.push` for `onSwitchAgent` still
needs it, so keep `useRouter`), and replace it with:

```tsx
  const startNewThread = useNewThread(agentId);
```

Keep everything else (the `onSwitchAgent={(id) => router.push(...)}` still uses
`router`).

- [ ] **Step 3: Verify build/tests**

Run: `pnpm --filter web exec vitest run && pnpm lint`
Expected: PASS, clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat/use-new-thread.ts apps/web/src/components/chat/AgentWorkspace.tsx
git commit -m "Extract useNewThread hook"
```

---

## Task 7: Build the `OralBoardsPanel`

**Files:**
- Create: `apps/web/src/components/chat/oral-boards/tab-for-status.ts`
- Test: `apps/web/src/components/chat/oral-boards/tab-for-status.test.ts`
- Create: `apps/web/src/components/chat/oral-boards/OralBoardsPanel.tsx`

- [ ] **Step 1: Write the failing test for the phase→tab helper**

```ts
import { describe, expect, it } from "vitest";

import { tabForStatus } from "./tab-for-status";

describe("tabForStatus", () => {
  it("maps questioning to the question tab", () => {
    expect(tabForStatus("questioning")).toBe("question");
  });

  it("maps feedback and complete to the feedback tab", () => {
    expect(tabForStatus("feedback")).toBe("feedback");
    expect(tabForStatus("complete")).toBe("feedback");
  });

  it("defaults idle/presenting/undefined to the question tab", () => {
    expect(tabForStatus("idle")).toBe("question");
    expect(tabForStatus("presenting")).toBe("question");
    expect(tabForStatus(undefined)).toBe("question");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter web exec vitest run src/components/chat/oral-boards/tab-for-status.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

```ts
import type { OralBoardsPhase } from "@agents/types";

export type OralBoardsTab = "question" | "feedback";

export function tabForStatus(status: OralBoardsPhase | "idle" | undefined): OralBoardsTab {
  return status === "feedback" || status === "complete" ? "feedback" : "question";
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter web exec vitest run src/components/chat/oral-boards/tab-for-status.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `OralBoardsPanel`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Streamdown } from "streamdown";
import { Maximize2Icon, Minimize2Icon, PlayIcon, SquareIcon } from "lucide-react";

import type { CaseSource, OralBoardsExchange, OralBoardsState } from "@agents/types";
import { Button } from "@agents/ui";
import {
  Artifact,
  ArtifactActions,
  ArtifactAction,
  ArtifactClose,
  ArtifactContent,
  ArtifactHeader,
  ArtifactTitle,
} from "@/components/ai-elements/artifact";
import { speak, stopSpeaking } from "@/lib/copilotkit/speak-question";
import { useCurrentQuestion } from "@/lib/copilotkit/oral-boards-question";
import { tabForStatus, type OralBoardsTab } from "./tab-for-status";

const CASE_SPEED = 0.8;

function CitationChips({ sources }: { sources: CaseSource[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {sources.map((s) => (
        <span
          key={`${s.collection}-${s.docid}`}
          className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 text-[11px]"
        >
          {s.collection} #{s.docid} · {s.title}
        </span>
      ))}
    </div>
  );
}

function CaseVignette({ caseBody, sources }: { caseBody: string; sources: CaseSource[] }) {
  const [open, setOpen] = useState(true);
  const [playing, setPlaying] = useState(false);

  const present = () => {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    void speak(caseBody, { speed: CASE_SPEED }).finally(() => setPlaying(false));
  };

  return (
    <section className="border-border rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
        >
          {open ? "▾" : "▸"} Case vignette
        </button>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={present}>
          {playing ? <SquareIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
          {playing ? "Stop" : "Present case"}
        </Button>
      </div>
      {open && (
        <div className="space-y-2">
          <Streamdown>{caseBody}</Streamdown>
          <CitationChips sources={sources} />
        </div>
      )}
    </section>
  );
}

function QuestionView({ fallback }: { fallback: string }) {
  const live = useCurrentQuestion();
  const question = live || fallback;
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Current question
      </p>
      <p className="text-sm leading-relaxed">{question || "Waiting for the next question…"}</p>
    </div>
  );
}

function FeedbackView({
  scoreCard,
  transcript,
}: {
  scoreCard: string;
  transcript: OralBoardsExchange[];
}) {
  return (
    <div className="space-y-4">
      {scoreCard.trim() && <Streamdown>{scoreCard}</Streamdown>}
      {transcript.map((x, i) => (
        <div key={i} className="border-border space-y-1 border-t pt-3 text-sm">
          <p className="font-medium">Q{i + 1}. {x.question}</p>
          {x.answer && <p className="text-muted-foreground">Your answer: {x.answer}</p>}
          {x.feedback && <p>{x.feedback}</p>}
          <CitationChips sources={x.citations ?? []} />
        </div>
      ))}
      {!scoreCard.trim() && transcript.length === 0 && (
        <p className="text-muted-foreground text-sm">No feedback yet.</p>
      )}
    </div>
  );
}

export function OralBoardsPanel({
  state,
  fullscreen,
  onClose,
  onToggleFullscreen,
}: {
  state: OralBoardsState;
  fullscreen: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
}) {
  const phaseTab = tabForStatus(state.status ?? state.phase);
  const [tab, setTab] = useState<OralBoardsTab>(phaseTab);
  // Auto-follow the phase; manual selection sticks until the phase changes again.
  useEffect(() => setTab(phaseTab), [phaseTab]);

  const transcript = state.transcript ?? [];
  const lastQuestion = transcript.at(-1)?.question ?? "";

  return (
    <Artifact className="h-full rounded-none border-0 border-l">
      <ArtifactHeader>
        <ArtifactTitle>Oral board</ArtifactTitle>
        <ArtifactActions>
          <ArtifactAction
            icon={fullscreen ? Minimize2Icon : Maximize2Icon}
            tooltip={fullscreen ? "Restore split" : "Fullscreen"}
            onClick={onToggleFullscreen}
          />
          <ArtifactClose aria-label="Close panel" onClick={onClose} />
        </ArtifactActions>
      </ArtifactHeader>
      <ArtifactContent className="space-y-3">
        <CaseVignette caseBody={state.case ?? ""} sources={state.case_sources ?? []} />
        <div className="flex gap-1 text-xs">
          {(["question", "feedback"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={
                tab === t
                  ? "bg-primary rounded-md px-2 py-1 text-white capitalize"
                  : "text-muted-foreground rounded-md px-2 py-1 capitalize"
              }
            >
              {t}
            </button>
          ))}
        </div>
        {tab === "question" ? (
          <QuestionView fallback={lastQuestion} />
        ) : (
          <FeedbackView scoreCard={state.score_card ?? ""} transcript={transcript} />
        )}
      </ArtifactContent>
    </Artifact>
  );
}
```

Note: `ArtifactContent` accepting `className` matches existing usage; if its
prop type rejects `className`, wrap children in a `<div className="space-y-3">`
instead.

- [ ] **Step 6: Run tests + lint**

Run: `pnpm --filter web exec vitest run && pnpm lint`
Expected: PASS, clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/chat/oral-boards/
git commit -m "Add OralBoardsPanel with pinned case, question/feedback tabs"
```

---

## Task 8: `OralBoardsWorkspace` + wire the route

**Files:**
- Create: `apps/web/src/components/chat/OralBoardsWorkspace.tsx`
- Modify: `apps/web/src/app/console/oral-boards/[thread]/page.tsx`
- Modify: `apps/web/src/all-source-smoke.test.tsx`

- [ ] **Step 1: Create `OralBoardsWorkspace`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useAgent, UseAgentUpdate } from "@copilotkit/react-core/v2";

import type { OralBoardsState } from "@agents/types";
import { getAgentConfig } from "@/components/chat/agents/registry";
import { AgentExtensionSlot } from "@/components/chat/agents/extensions";
import { AgentSuggestions } from "@/components/chat/agents/suggestions";
import { ChatSurface } from "@/components/chat/ChatSurface";
import { NavRail } from "@/components/chat/NavRail";
import { OralBoardsPanel } from "@/components/chat/oral-boards/OralBoardsPanel";
import { useNewThread } from "@/components/chat/use-new-thread";
import { WorkspaceShell, useArtifactPanel } from "@/components/workspace-shell";
import { cssVars } from "@/lib/css";

const AGENT_ID = "oral-boards" as const;

export function OralBoardsWorkspace() {
  const router = useRouter();
  const config = getAgentConfig(AGENT_ID);
  const { state, dispatch } = useArtifactPanel(AGENT_ID);
  const { agent } = useAgent({ agentId: AGENT_ID, updates: [UseAgentUpdate.OnStateChanged] });
  const startNewThread = useNewThread(AGENT_ID);

  // CopilotKit agent state is dynamic; this is the single typed boundary.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const examState = (agent?.state ?? {}) as OralBoardsState;
  const hasPanel = Boolean(examState.case && examState.case.trim());

  return (
    <main className="h-dvh" style={cssVars({ "--page-color": `var(${config.colorVar})` })}>
      <AgentExtensionSlot agentId={AGENT_ID} />
      <AgentSuggestions config={config} />
      <WorkspaceShell
        hasArtifact={hasPanel}
        panelState={state}
        rail={<NavRail activePath={`/console/${AGENT_ID}`} onNewThread={startNewThread} />}
        chat={
          <ChatSurface
            config={config}
            onSwitchAgent={(id) => router.push(`/console/${id}`)}
            onOpenArtifact={() => dispatch("open")}
          />
        }
        artifact={
          hasPanel ? (
            <OralBoardsPanel
              state={examState}
              fullscreen={state === "fullscreen"}
              onClose={() => dispatch("close")}
              onToggleFullscreen={() => dispatch("toggle-fullscreen")}
            />
          ) : null
        }
      />
    </main>
  );
}
```

- [ ] **Step 2: Wire the route page**

Replace `apps/web/src/app/console/oral-boards/[thread]/page.tsx` with:

```tsx
"use client";

import { use } from "react";

import { OralBoardsWorkspace } from "@/components/chat/OralBoardsWorkspace";

export default function Page({ params }: { params: Promise<{ thread: string }> }) {
  const { thread } = use(params);
  return <OralBoardsWorkspace key={`oral-boards:${thread}`} />;
}
```

- [ ] **Step 3: Add smoke coverage**

In `all-source-smoke.test.tsx`, add an import to the `Promise.all([...])` array
(after the `import("./app/console/settings/page")` line, with a matching
destructured name like `OralBoardsPanelModule`):

```ts
      import("./components/chat/oral-boards/OralBoardsPanel"),
```

Add a destructured binding `OralBoardsPanelModule` to the array on the left-hand
side, then add a render call alongside the other `render(...)` calls:

```tsx
    await render(
      "oral-boards-panel",
      <OralBoardsPanelModule.OralBoardsPanel
        state={{
          case: "7-year-old with trauma to #8.",
          case_sources: [{ docid: 1, title: "AAPD trauma", collection: "aapd" }],
          status: "feedback",
          transcript: [
            { question: "Immediate management?", answer: "Reposition.", feedback: "Good.", citations: [] },
          ],
          score_card: "## Score\nSolid.",
        }}
        fullscreen={false}
        onClose={() => {}}
        onToggleFullscreen={() => {}}
      />,
    );
```

- [ ] **Step 4: Run tests + build**

Run: `pnpm --filter web exec vitest run`
Expected: PASS (including the new smoke render).
Run: `pnpm --filter web build`
Expected: build succeeds; route table still shows `/console/oral-boards/[thread]`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat/OralBoardsWorkspace.tsx apps/web/src/app/console/oral-boards/[thread]/page.tsx apps/web/src/all-source-smoke.test.tsx
git commit -m "Render bespoke OralBoardsWorkspace on the oral-boards route"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full check + test + build**

Run: `pnpm check`
Expected: lint, lint:py, lint:tw, fmt:check all pass.
Run: `pnpm --filter web exec vitest run`
Expected: all tests PASS.
Run: `pnpm --filter web build`
Expected: success.

- [ ] **Step 2: Manual smoke (optional, recommended)**

Run: `pnpm dev` (needs the agents gateway). Open `/console/oral-boards`, start a
case, confirm: the case vignette pins at top with a working Present/Stop button
(slower speech), the Question tab shows the live question as it's asked, and the
Feedback tab shows feedback + score card with citation chips.

- [ ] **Step 3: Final commit (if any uncommitted formatting)**

```bash
git add -A && git commit -m "Formatting/cleanup for oral-boards pane" || echo "nothing to commit"
```

---

## Self-Review notes

- **Spec coverage:** §1 workspace boundary → Task 6 + 8; §2 pane (pinned case, tabs, three views) → Task 7; §3 live-question store → Task 2 + 3; §4 TTS speed/stop → Task 1; §5 ask_question rename/slim + prompt + registry → Tasks 3, 4, 5; testing → each task + Task 9.
- **Question fallback:** `QuestionView` falls back to the last transcript question when the live store is empty, matching the spec's "falls back to the latest transcript question."
- **Type names:** `speak`/`speakQuestion`/`stopSpeaking` (Task 1), `setCurrentQuestion`/`useCurrentQuestion` (Task 2), `useNewThread` (Task 6), `tabForStatus`/`OralBoardsTab` (Task 7) are used consistently across tasks.
- **`OralBoardsState.status` vs `phase`:** the agent writes `status`; the panel reads `state.status ?? state.phase` defensively.
