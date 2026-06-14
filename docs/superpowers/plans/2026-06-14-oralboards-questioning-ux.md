# Oral Boards — Questioning UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cluttered questioning transcript list with a focused card-based exam UI: prior Q&A collapses to chips, the live question is a highlighted card with an inline answer textarea + toggle-record mic + Submit, and the sidebar is made read-only so only the panel can advance the agent.

**Architecture:** `QuestioningPane` is rewritten with chips (prior exchanges) + active question card + answer input; a new `useAnswerRecorder` hook wraps `CopilotChatAudioRecorder` for toggle-record transcription; `OralBoardsWorkspace` gets `handleAnswer` (the only path that calls `runAgent` during questioning) + passes `onAnswer`/`isRunning` props; the system prompt is hardened with an explicit STOP instruction after `ask_question`.

**Tech Stack:** React, CopilotKit `@copilotkit/react-core/v2`, `CopilotChatAudioRecorder`, Groq `/api/copilotkit/transcribe`, Vitest / jsdom

---

## File map

| Action | Path                                                                |
| ------ | ------------------------------------------------------------------- |
| Create | `apps/web/src/lib/copilotkit/use-answer-recorder.ts`                |
| Modify | `apps/web/src/components/chat/oral-boards/OralBoardsPanel.tsx`      |
| Modify | `apps/web/src/components/chat/oral-boards/OralBoardsPanel.test.tsx` |
| Modify | `apps/web/src/components/chat/OralBoardsWorkspace.tsx`              |
| Modify | `apps/web/src/app/globals.css`                                      |
| Modify | `agents/oralboards/src/oralboards_agent/agent.py`                   |

---

## Task 1: useAnswerRecorder hook

**Files:**

- Create: `apps/web/src/lib/copilotkit/use-answer-recorder.ts`

The existing `TranscribeButton` is tightly coupled to `PromptInputButton` / `usePromptInputController` and cannot be reused outside `PromptInput`. This hook extracts the same `CopilotChatAudioRecorder`-based toggle-record pattern for standalone use.

- [ ] **Step 1: Create the hook file**

Create `apps/web/src/lib/copilotkit/use-answer-recorder.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CopilotChatAudioRecorder } from "@copilotkit/react-core/v2";

export type AnswerRecorderRef = React.ElementRef<typeof CopilotChatAudioRecorder>;

export interface UseAnswerRecorder {
  recording: boolean;
  transcribing: boolean;
  micSupported: boolean;
  toggle: () => Promise<void>;
  recorderRef: React.RefObject<AnswerRecorderRef | null>;
}

export function useAnswerRecorder(onTranscript: (text: string) => void): UseAnswerRecorder {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const recorderRef = useRef<AnswerRecorderRef | null>(null);
  // Keep a stable ref to onTranscript so toggle() closure doesn't go stale.
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    setMicSupported(typeof navigator.mediaDevices?.getUserMedia === "function");
  }, []);

  const toggle = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    if (!recording) {
      setRecording(true);
      try {
        await recorder.start();
      } catch {
        setRecording(false);
      }
      return;
    }

    // Stop recording and transcribe.
    setRecording(false);
    setTranscribing(true);
    try {
      const blob = await recorder.stop();
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      const res = await fetch("/api/copilotkit/transcribe", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const { text } = (await res.json()) as { text: string };
        onTranscriptRef.current(text);
      } else {
        console.error("Transcription failed:", res.statusText);
      }
    } catch (e) {
      console.error("Transcription failed:", e);
    } finally {
      setTranscribing(false);
    }
  }, [recording]);

  return { recording, transcribing, micSupported, toggle, recorderRef };
}
```

- [ ] **Step 2: Verify it type-checks**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | grep "use-answer-recorder"
```

Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/copilotkit/use-answer-recorder.ts
git commit -m "feat(oralboards): add useAnswerRecorder hook for toggle-record transcription"
```

---

## Task 2: Rewrite QuestioningPane in OralBoardsPanel.tsx

**Files:**

- Modify: `apps/web/src/components/chat/oral-boards/OralBoardsPanel.tsx`

Replace the `QuestioningPane` component (lines 129–162 in the current file) and update the `OralBoardsPanel` export to accept two new props: `onAnswer` and `isRunning`.

- [ ] **Step 1: Replace the full file**

Replace `apps/web/src/components/chat/oral-boards/OralBoardsPanel.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { Streamdown } from "streamdown";
import {
  Loader2Icon,
  Maximize2Icon,
  Minimize2Icon,
  MicIcon,
  PlayIcon,
  SquareIcon,
} from "lucide-react";
import { CopilotChatAudioRecorder } from "@copilotkit/react-core/v2";

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
import { useAnswerRecorder } from "@/lib/copilotkit/use-answer-recorder";

function truncate(text: string, len: number): string {
  return text.length <= len ? text : `${text.slice(0, len)}…`;
}

function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    .replace(/`+([^`]+)`+/g, "$1")
    .replace(/^>\s*/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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

function VignetteBody({
  caseBody,
  sources,
  showTts = true,
}: {
  caseBody: string;
  sources: CaseSource[];
  showTts?: boolean;
}) {
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    void speak(stripMarkdownForSpeech(caseBody)).finally(() => setPlaying(false));
  };

  return (
    <div className="space-y-2">
      {showTts && (
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={toggle}>
            {playing ? <SquareIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
            {playing ? "Stop" : "Present case"}
          </Button>
        </div>
      )}
      <Streamdown>{caseBody}</Streamdown>
      <CitationChips sources={sources} />
    </div>
  );
}

function ExchangeList({ transcript }: { transcript: OralBoardsExchange[] }) {
  return (
    <>
      {transcript.map((x, i) => (
        <div key={x.question || i} className="border-border space-y-1 border-t pt-3 text-sm">
          <p className="font-medium">
            Q{i + 1}. {x.question}
          </p>
          {x.answer && <p className="text-muted-foreground">Your answer: {x.answer}</p>}
          {x.feedback && <Streamdown>{x.feedback}</Streamdown>}
          <CitationChips sources={x.citations ?? []} />
        </div>
      ))}
    </>
  );
}

function PresentingPane({
  caseBody,
  sources,
  onReady,
}: {
  caseBody: string;
  sources: CaseSource[];
  onReady: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex-1 overflow-auto">
        <VignetteBody caseBody={caseBody} sources={sources} />
      </div>
      <Button type="button" className="w-full shrink-0" onClick={onReady}>
        Ready to begin
      </Button>
    </div>
  );
}

function QuestioningPane({
  caseBody,
  sources,
  transcript,
  onAnswer,
  isRunning,
}: {
  caseBody: string;
  sources: CaseSource[];
  transcript: OralBoardsExchange[];
  onAnswer: (text: string) => void;
  isRunning: boolean;
}) {
  const live = useCurrentQuestion();
  const question = live;
  const questionNumber = transcript.length + 1;

  const [answerText, setAnswerText] = useState("");
  const [expandedChip, setExpandedChip] = useState<number | null>(null);

  const { recording, transcribing, micSupported, toggle, recorderRef } = useAnswerRecorder(
    (text) => {
      setAnswerText((prev) => (prev ? `${prev} ${text}` : text));
    },
  );

  const handleSubmit = () => {
    const trimmed = answerText.trim();
    if (!trimmed || isRunning) return;
    onAnswer(trimmed);
    setAnswerText("");
  };

  // Split transcript: older exchanges → chips; most recent → always-visible feedback block.
  const olderExchanges = transcript.slice(0, -1);
  const lastExchange = transcript.at(-1);

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      {/* Chip row — all exchanges except the most recent */}
      {olderExchanges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {olderExchanges.map((x, i) => (
            <div key={x.question || i}>
              <button
                type="button"
                onClick={() => setExpandedChip(expandedChip === i ? null : i)}
                className="bg-muted text-muted-foreground hover:text-foreground rounded-full border px-2.5 py-0.5 text-xs transition-colors"
              >
                Q{i + 1} · {truncate(x.question, 22)} ✓
              </button>
              {expandedChip === i && (
                <div className="bg-muted mt-1.5 space-y-1 rounded-lg p-3 text-sm">
                  <p className="font-medium">{x.question}</p>
                  {x.answer && <p className="text-muted-foreground">Your answer: {x.answer}</p>}
                  {x.feedback && <Streamdown>{x.feedback}</Streamdown>}
                  <CitationChips sources={x.citations ?? []} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Most recent exchange — always expanded so feedback is visible immediately */}
      {lastExchange && (
        <div className="bg-muted shrink-0 space-y-1 rounded-lg p-3 text-sm">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            Q{transcript.length} · Feedback
          </p>
          <p className="font-medium">{lastExchange.question}</p>
          {lastExchange.answer && (
            <p className="text-muted-foreground">Your answer: {lastExchange.answer}</p>
          )}
          {lastExchange.feedback && <Streamdown>{lastExchange.feedback}</Streamdown>}
          <CitationChips sources={lastExchange.citations ?? []} />
        </div>
      )}

      {/* Active question card */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-lg border-2 border-indigo-500 bg-indigo-950/20 p-4">
        <p className="text-indigo-400 text-xs font-semibold uppercase tracking-wide">
          Q{questionNumber}
        </p>
        <p className="text-sm leading-relaxed">{question || "Waiting for the next question…"}</p>
        {micSupported && <CopilotChatAudioRecorder ref={recorderRef} />}
        <textarea
          className="border-border bg-background min-h-[80px] flex-1 resize-none rounded border p-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
          placeholder="Type your answer…"
          value={answerText}
          onChange={(e) => setAnswerText(e.target.value)}
          disabled={isRunning || recording}
        />
        <div className="flex items-center justify-end gap-2">
          {micSupported && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void toggle()}
              disabled={isRunning || transcribing}
              className={recording ? "border-red-500 text-red-500" : ""}
            >
              {transcribing ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : recording ? (
                <>
                  <span className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-red-500" />
                  Stop
                </>
              ) : (
                <>
                  <MicIcon className="mr-1 size-3.5" />
                  Record
                </>
              )}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={isRunning || !answerText.trim()}
            onClick={handleSubmit}
          >
            Submit
          </Button>
        </div>
      </div>

      {/* Case vignette — collapsed at bottom */}
      <details className="shrink-0">
        <summary className="text-muted-foreground cursor-pointer text-xs font-medium uppercase tracking-wide select-none">
          Case vignette
        </summary>
        <div className="mt-2">
          <VignetteBody caseBody={caseBody} sources={sources} showTts={false} />
        </div>
      </details>
    </div>
  );
}

function FeedbackPane({
  scoreCard,
  transcript,
}: {
  scoreCard: string;
  transcript: OralBoardsExchange[];
}) {
  return (
    <div className="space-y-4">
      {scoreCard.trim() && <Streamdown>{scoreCard}</Streamdown>}
      <ExchangeList transcript={transcript} />
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
  onReady,
  onAnswer,
  isRunning,
}: {
  state: OralBoardsState;
  fullscreen: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
  onReady: () => void;
  onAnswer: (text: string) => void;
  isRunning: boolean;
}) {
  const status = state.status ?? "idle";
  const caseBody = state.case ?? "";
  const sources = state.case_sources ?? [];
  const transcript = state.transcript ?? [];
  const scoreCard = state.score_card ?? "";

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
      <ArtifactContent
        className={
          status === "presenting"
            ? "flex h-full flex-col"
            : status === "questioning"
              ? "flex h-full flex-col"
              : "space-y-4"
        }
      >
        {status === "presenting" && (
          <PresentingPane caseBody={caseBody} sources={sources} onReady={onReady} />
        )}
        {status === "questioning" && (
          <QuestioningPane
            caseBody={caseBody}
            sources={sources}
            transcript={transcript}
            onAnswer={onAnswer}
            isRunning={isRunning}
          />
        )}
        {(status === "complete" || status === "feedback") && (
          <FeedbackPane scoreCard={scoreCard} transcript={transcript} />
        )}
      </ArtifactContent>
    </Artifact>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | head -40
```

Expected: no errors in `OralBoardsPanel.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/oral-boards/OralBoardsPanel.tsx
git commit -m "feat(oralboards): rewrite QuestioningPane with chips + active card + answer input"
```

---

## Task 3: Update OralBoardsPanel tests

**Files:**

- Modify: `apps/web/src/components/chat/oral-boards/OralBoardsPanel.test.tsx`

The `OralBoardsPanel` now requires `onAnswer` and `isRunning` props. Tests for `QuestioningPane` must cover: Submit calls `onAnswer`, Submit is disabled when `isRunning`, chip expand/collapse.

- [ ] **Step 1: Replace the test file**

Replace `apps/web/src/components/chat/oral-boards/OralBoardsPanel.test.tsx` with:

```tsx
// @vitest-environment jsdom
import React, { forwardRef, useImperativeHandle } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { OralBoardsState } from "@agents/types";

vi.mock("@/lib/copilotkit/speak-question", () => ({
  speak: vi.fn().mockResolvedValue(""),
  stopSpeaking: vi.fn(),
}));

vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children?: string }) => (
    <span data-testid="streamdown">{children}</span>
  ),
}));

vi.mock("@/lib/copilotkit/oral-boards-question", () => ({
  useCurrentQuestion: vi.fn().mockReturnValue(""),
}));

// Stub CopilotChatAudioRecorder so tests don't need a real media stream.
vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotChatAudioRecorder: forwardRef(function MockAudioRecorder(_, ref) {
    useImperativeHandle(ref, () => ({
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(new Blob(["audio"])),
    }));
    return null;
  }),
}));

// Stub useAnswerRecorder so mic-related effects don't touch the DOM.
vi.mock("@/lib/copilotkit/use-answer-recorder", () => ({
  useAnswerRecorder: (onTranscript: (t: string) => void) => ({
    recording: false,
    transcribing: false,
    micSupported: false,
    toggle: vi.fn(),
    recorderRef: { current: null },
  }),
}));

import { OralBoardsPanel } from "./OralBoardsPanel";

const noop = () => {};

const baseProps = {
  fullscreen: false,
  onClose: noop,
  onToggleFullscreen: noop,
  onReady: noop,
  onAnswer: noop,
  isRunning: false,
};

describe("OralBoardsPanel — presenting", () => {
  it("renders the vignette and Ready to begin button", () => {
    const state: OralBoardsState = {
      case: "A 4-year-old presents with early childhood caries.",
      case_sources: [{ docid: 1, title: "AAPD Guideline", collection: "aapd" }],
      status: "presenting",
      transcript: [],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    expect(screen.getByText("A 4-year-old presents with early childhood caries.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Ready to begin" })).toBeDefined();
  });

  it("calls onReady when Ready to begin is clicked", async () => {
    const onReady = vi.fn();
    const state: OralBoardsState = {
      case: "Case text.",
      case_sources: [],
      status: "presenting",
      transcript: [],
    };

    render(<OralBoardsPanel state={state} {...baseProps} onReady={onReady} />);
    await userEvent.click(screen.getByRole("button", { name: "Ready to begin" }));

    expect(onReady).toHaveBeenCalledOnce();
  });
});

describe("OralBoardsPanel — questioning", () => {
  it("renders the active question from useCurrentQuestion (live)", async () => {
    const { useCurrentQuestion } = await import("@/lib/copilotkit/oral-boards-question");
    vi.mocked(useCurrentQuestion).mockReturnValue("What is your initial impression?");

    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    expect(screen.getByText("What is your initial impression?")).toBeDefined();

    vi.mocked(useCurrentQuestion).mockReturnValue("");
  });

  it("calls onAnswer with trimmed text and clears textarea on Submit", async () => {
    const onAnswer = vi.fn();
    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [],
    };

    render(<OralBoardsPanel state={state} {...baseProps} onAnswer={onAnswer} />);

    const textarea = screen.getByPlaceholderText("Type your answer…");
    await userEvent.type(textarea, "  My answer  ");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onAnswer).toHaveBeenCalledWith("My answer");
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("disables Submit while isRunning", () => {
    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [],
    };

    render(<OralBoardsPanel state={state} {...baseProps} isRunning={true} />);

    const submitBtn = screen.getByRole("button", { name: "Submit" });
    expect(submitBtn).toHaveProperty("disabled", true);
  });

  it("shows the most recent exchange as an always-visible feedback block", () => {
    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [
        {
          question: "What is your initial impression?",
          answer: "I see caries.",
          feedback: "Good start.",
          citations: [],
        },
      ],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    // Feedback is visible without any click — no chip for the last exchange.
    expect(screen.getByText("Your answer: I see caries.")).toBeDefined();
    expect(screen.queryByRole("button", { name: /Q1 ·/ })).toBeNull();
  });

  it("older exchanges collapse to chips; only the last stays expanded", async () => {
    const state: OralBoardsState = {
      case: "Case.",
      case_sources: [],
      status: "questioning",
      transcript: [
        {
          question: "What is your initial impression?",
          answer: "I see caries.",
          feedback: "Good.",
          citations: [],
        },
        {
          question: "What data do you need?",
          answer: "Radiographs.",
          feedback: "Correct.",
          citations: [],
        },
      ],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    // Q1 is a chip (collapsed); Q2 feedback is always visible.
    const chip = screen.getByRole("button", { name: /Q1 ·/ });
    expect(chip).toBeDefined();
    expect(screen.queryByText("Your answer: I see caries.")).toBeNull();
    expect(screen.getByText("Your answer: Radiographs.")).toBeDefined();

    // Clicking Q1 chip expands it.
    await userEvent.click(chip);
    expect(screen.getByText("Your answer: I see caries.")).toBeDefined();

    // Clicking again collapses.
    await userEvent.click(chip);
    expect(screen.queryByText("Your answer: I see caries.")).toBeNull();
  });
});

describe("OralBoardsPanel — complete", () => {
  it("renders score card and full transcript", () => {
    const state: OralBoardsState = {
      case: "Case summary text.",
      case_sources: [],
      status: "complete",
      score_card: "## Score\nComposite: 2.4 / 3.0",
      transcript: [
        {
          question: "Describe your approach to pain management.",
          answer: "I would use local anesthesia.",
          feedback: "**Interview phase:** Management and treatment planning\nGood.",
          citations: [],
        },
      ],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    expect(screen.getByText("Q1. Describe your approach to pain management.")).toBeDefined();
    expect(screen.getByText("Your answer: I would use local anesthesia.")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd apps/web && pnpm test --run src/components/chat/oral-boards/OralBoardsPanel.test.tsx
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/oral-boards/OralBoardsPanel.test.tsx
git commit -m "test(oralboards): update panel tests for chip row, answer submit, isRunning guard"
```

---

## Task 4: Wire handleAnswer + isRunning in OralBoardsWorkspace

**Files:**

- Modify: `apps/web/src/components/chat/OralBoardsWorkspace.tsx`

`handleAnswer` is the **only** path that calls `copilotkit.runAgent` during questioning. The sidebar has no runAgent path once we remove its input (Task 5). Pass `onAnswer` and `isRunning` to `OralBoardsPanel`.

- [ ] **Step 1: Add handleAnswer, onAnswer, isRunning**

Replace the entire file `apps/web/src/components/chat/OralBoardsWorkspace.tsx` with:

```tsx
"use client";

import { useCallback, useEffect } from "react";
import { CopilotSidebar, useAgent, useCopilotKit, UseAgentUpdate } from "@copilotkit/react-core/v2";

import type { OralBoardsState } from "@agents/types";
import { Button } from "@agents/ui";
import { getAgentConfig } from "@/components/chat/agents/registry";
import { useNewThread } from "@/components/chat/use-new-thread";
import { AgentExtensionSlot } from "@/components/chat/agents/extensions";
import { NavRail } from "@/components/chat/NavRail";
import { OralBoardsPanel } from "@/components/chat/oral-boards/OralBoardsPanel";
import { useArtifactPanel } from "@/components/workspace-shell";
import { cssVars } from "@/lib/css";

const AGENT_ID = "oral-boards" as const;

const TOPICS = [
  { label: "Pulp therapy", message: "Create an oral-board case focused on pulp therapy." },
  { label: "Dental trauma", message: "Give me a staged OCE-style dental trauma case." },
  {
    label: "Early childhood caries",
    message: "Create an oral-board case on early childhood caries.",
  },
  {
    label: "Behavior guidance",
    message: "Create an oral-board case focused on behavior guidance.",
  },
];

function OralBoardsStartPage({
  onStart,
  isGenerating,
}: {
  onStart: (message: string) => void;
  isGenerating: boolean;
}) {
  if (isGenerating) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="border-primary size-8 animate-spin rounded-full border-2 border-t-transparent" />
        <p className="text-muted-foreground text-sm">Building your case…</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <p className="text-muted-foreground text-sm">ABPD Oral Clinical Exam practice</p>
      <Button
        size="lg"
        className="px-10"
        onClick={() => onStart("Run a grounded pediatric dentistry oral-board case.")}
      >
        Start a case
      </Button>
      <div className="flex flex-wrap justify-center gap-2">
        {TOPICS.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => onStart(t.message)}
            className="text-muted-foreground hover:text-foreground rounded-full border px-3 py-1 text-xs transition-colors"
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function OralBoardsWorkspace() {
  const config = getAgentConfig(AGENT_ID);
  const { state, dispatch } = useArtifactPanel(AGENT_ID);
  const { agent } = useAgent({
    agentId: AGENT_ID,
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
  });
  const { copilotkit } = useCopilotKit();
  const startNewThread = useNewThread(AGENT_ID);

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const examState = (agent?.state ?? {}) as OralBoardsState;
  const hasPanel = Boolean(examState.case && examState.case.trim());
  const isRunning = agent?.isRunning ?? false;
  const isGenerating = isRunning && !hasPanel;

  useEffect(() => {
    if (hasPanel && state === "closed") dispatch("fullscreen");
  }, [hasPanel, state, dispatch]);

  const handleStart = useCallback(
    async (content: string) => {
      if (!agent) return;
      agent.addMessage({ id: crypto.randomUUID(), role: "user", content });
      await copilotkit.runAgent({ agent });
    },
    [agent, copilotkit],
  );

  const handleReady = useCallback(() => {
    if (!agent) return;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    agent.setState({ ...(agent.state as OralBoardsState), status: "questioning" });
    agent.addMessage({ id: crypto.randomUUID(), role: "user", content: "ready" });
    void copilotkit.runAgent({ agent });
  }, [agent, copilotkit]);

  const handleAnswer = useCallback(
    async (text: string) => {
      if (!agent || !text.trim()) return;
      agent.addMessage({ id: crypto.randomUUID(), role: "user", content: text });
      await copilotkit.runAgent({ agent });
    },
    [agent, copilotkit],
  );

  return (
    <main
      className="flex h-dvh overflow-hidden"
      style={cssVars({ "--page-color": `var(${config.colorVar})` })}
    >
      <AgentExtensionSlot agentId={AGENT_ID} />
      <CopilotSidebar
        defaultOpen={false}
        labels={{
          title: "Agent reasoning",
          placeholder: config.placeholder,
        }}
      />
      <div className="flex-none">
        <NavRail activePath={`/console/${AGENT_ID}`} onNewThread={startNewThread} />
      </div>
      <div className="flex-1 overflow-hidden">
        {hasPanel ? (
          <OralBoardsPanel
            state={examState}
            fullscreen={state === "fullscreen"}
            onClose={() => dispatch("close")}
            onToggleFullscreen={() => dispatch("toggle-fullscreen")}
            onReady={handleReady}
            onAnswer={(text) => void handleAnswer(text)}
            isRunning={isRunning}
          />
        ) : (
          <OralBoardsStartPage onStart={(m) => void handleStart(m)} isGenerating={isGenerating} />
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/OralBoardsWorkspace.tsx
git commit -m "feat(oralboards): add handleAnswer — panel is sole runAgent path during questioning"
```

---

## Task 5: Hide sidebar input via CSS

**Files:**

- Modify: `apps/web/src/app/globals.css`

CopilotSidebar renders its chat form in a portal. Adding a global CSS rule hides the input and toolbar so the sidebar becomes a read-only reasoning log. The rule targets the data attribute CopilotKit adds to its sidebar container, with a fallback class selector.

- [ ] **Step 1: Append CSS rule to globals.css**

Open `apps/web/src/app/globals.css` and append the following at the end of the file:

```css
/* Oral boards: make the CopilotKit sidebar read-only — hide input toolbar */
[data-copilotkit-sidebar] form,
[data-copilotkit-sidebar] [role="toolbar"],
.copilotKitSidebarContentWrapper form,
.copilotKitSidebarContentWrapper [role="toolbar"] {
  display: none !important;
}
```

- [ ] **Step 2: Verify no syntax errors**

```bash
cd apps/web && pnpm build 2>&1 | grep -i "css\|error" | head -20
```

Expected: build succeeds (no CSS parse errors). If the build fails for unrelated reasons, run `pnpm lint` instead:

```bash
cd apps/web && pnpm lint 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "feat(oralboards): hide CopilotSidebar input — sidebar is read-only during exam"
```

---

## Task 6: Harden system prompt — STOP after ask_question

**Files:**

- Modify: `agents/oralboards/src/oralboards_agent/agent.py:228-233`

Step 4 of the exam flow must be explicit: after `ask_question` and writing the question in chat, the agent must STOP and wait for a candidate message. The current wording is ambiguous.

- [ ] **Step 1: Replace step 4 in \_STATIC_INSTRUCTION**

In `agents/oralboards/src/oralboards_agent/agent.py`, find this block in `_STATIC_INSTRUCTION` (inside the `## Exam flow` section, step 4):

```
4. Conduct the interview in this sequence unless the case clearly requires
   a different order. For each question: first call ask_question with the
   exact question text (this registers it in the exam pane so the candidate
   can see it), then write ONLY that one question in chat, then stop and
   wait for the candidate's answer. Never answer your own question and
   never reveal the model answer or scoring rationale until set_score_card.
```

Replace it with:

```
4. Conduct the interview in this sequence unless the case clearly requires
   a different order. For each question:
   a. Call ask_question with the exact question text.
   b. Write ONLY that question in chat — one sentence, no elaboration.
   c. STOP COMPLETELY. Do not call any tool. Do not write any more text.
      Do not proceed until a candidate message arrives in the conversation.
   Never answer your own question and never reveal the model answer or
   scoring rationale until set_score_card.
```

- [ ] **Step 2: Verify the file still parses**

```bash
cd agents && python -c "from oralboards_agent.agent import build_agent; print('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add agents/oralboards/src/oralboards_agent/agent.py
git commit -m "feat(oralboards): harden system prompt — STOP after ask_question until candidate replies"
```

---

## Task 7: Run full test suite

- [ ] **Step 1: Run all web tests**

```bash
cd apps/web && pnpm test --run
```

Expected: all tests pass. The only failing tests that are acceptable are pre-existing failures unrelated to this feature (check git blame if uncertain).

- [ ] **Step 2: Run linter**

```bash
pnpm lint 2>&1 | head -30
```

Expected: no new errors (warnings are acceptable).
