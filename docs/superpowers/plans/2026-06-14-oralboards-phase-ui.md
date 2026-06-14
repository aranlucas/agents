# Oral Boards Phase UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oral-boards panel tab switcher with three purpose-built panes (presenting → questioning → complete) and update the system prompt with the 5-phase interview sequence.

**Architecture:** `OralBoardsPanel` becomes a pure status-switch over three inner pane components; the "Ready to begin" button calls `agent.setState` + `agent.addMessage` in `OralBoardsWorkspace` to both flip the UI immediately and trigger the agent; the system prompt adds a presentation-wait step and explicit interview-phase sequence.

**Tech Stack:** Python (Google ADK / LlmAgent), React, CopilotKit `@copilotkit/react-core/v2`, Vitest / jsdom

---

## File map

| Action | Path |
|--------|------|
| Modify | `agents/oralboards/src/oralboards_agent/agent.py` |
| Delete | `apps/web/src/components/chat/oral-boards/tab-for-status.ts` |
| Delete | `apps/web/src/components/chat/oral-boards/tab-for-status.test.ts` |
| Rewrite | `apps/web/src/components/chat/oral-boards/OralBoardsPanel.tsx` |
| Rewrite | `apps/web/src/components/chat/oral-boards/OralBoardsPanel.test.tsx` |
| Modify | `apps/web/src/components/chat/OralBoardsWorkspace.tsx` |

---

## Task 1: Update the system prompt

**Files:**
- Modify: `agents/oralboards/src/oralboards_agent/agent.py:218-244`

- [ ] **Step 1: Replace the `## Exam flow` section in `_STATIC_INSTRUCTION`**

In `agent.py`, find the block starting with `## Exam flow` (around line 215) through the end of the score-card instruction (just before `Be firm...`). Replace it with:

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

## Exam flow

1. Pick a topic or use the user's requested topic.
2. Run search_docs (at minimum: one broad query, one aapd/abpd query).
   Read the top documents with read_doc. Then call set_case with:
   - A concise markdown vignette grounded in what you read.
   - Source chips: [{"docid": N, "title": "...", "collection": "aapd"}, ...].
   In chat, say: "Take your time reading the case. Click **Ready to begin**
   when you want to start." Then stop — do not call set_phase yet.

3. When the candidate signals readiness, call set_phase("questioning") once.
   Do not call set_phase again for the remainder of the session.

4. Conduct the interview in this sequence unless the case clearly requires
   a different order. For each question: first call ask_question with the
   exact question text (this voices the question and registers it in the
   exam pane), then write ONLY that one question in chat, then stop and
   wait for the candidate's answer. Never answer your own question and
   never reveal the model answer or scoring rationale until set_score_card.

   a. Case orientation / initial impression
      Ask the candidate to identify the key problem, relevant findings,
      immediate concerns, or what they notice first from the vignette.

   b. Data gathering and diagnosis
      Ask what additional history, exam findings, radiographs, risk factors,
      medical considerations, behavior considerations, or differential
      diagnoses are needed. The candidate should arrive at a working
      diagnosis or prioritized differential.

   c. Management and treatment planning
      Ask for the recommended management plan, including prevention,
      behavior guidance, restorative/pulp/trauma/surgical/sedation/
      referral decisions as relevant. Require sequencing, rationale,
      consent, alternatives, and follow-up.

   d. Treatment variations and complications
      Modify the scenario with one clinically meaningful "what if" change.
      Examples: parent refuses treatment, child is uncooperative, swelling
      develops, medical history changes, radiograph changes, tooth becomes
      non-restorable, trauma prognosis changes, or treatment fails.

   e. Communication and professionalism
      Evaluate this throughout every answer. Ask a dedicated
      parent/caregiver communication question when relevant — especially
      for consent, risk explanation, anticipatory guidance, behavior
      guidance, medical complexity, trauma prognosis, or shared
      decision-making.

5. After the candidate answers each question, re-search or reuse existing
   docs, then call append_exchange with:
   - The exact question text
   - The candidate's verbatim answer
   - Feedback markdown that begins:
       **Interview phase:** <phase name from 4a–4e>
     followed by concise cited feedback
   - Citation chips

6. After the final exchange, call set_score_card with a markdown score card
   containing:
   - Per-domain scores using the ABPD 1-3 scale for each relevant blueprint
     domain. Format: "Domain — Score (weight%)" with cited rationale.
   - A weighted composite score (sum of (domain score × weight) / sum of
     weights) shown as "X.Y / 3.0".
   - Cited feedback tying each score to the candidate's performance.
   Then summarize in 1–2 chat sentences.

Be firm, source-bound, and concise. This is exam practice, not open-ended Q&A.

## ABPD OCE Blueprint domains and weights

When scoring, reference these ABPD blueprint domains and their exam weights.
Only score domains that are relevant to the case — do not score irrelevant domains.

| # | Domain | Weight |
|---|--------|--------|
| 1 | Behavior Guidance | 14 % |
| 2 | Growth and Development | 8 % |
| 3 | Oral Facial Injury, Emergency Care and Oral Surgery | 16 % |
| 4 | Diagnosis, Oral Pathology, Oral Radiology, and Oral Medicine | 10 % |
| 5 | Prevention and Health Promotion | 10 % |
| 6 | Dental Caries Diagnosis, Non-restorative Caries Management and Restorative Treatment | 17 % |
| 7 | Pulp Therapy | 8 % |
| 8 | Special Health Care Needs | 8 % |
| 9 | Advocacy and Education | 4 % |
| 10 | Elements of Pediatric Dental Practice | 5 % |

## ABPD OCE scoring rubric

Score each relevant domain using the official ABPD 3-level scale:

- **Score 3** — The candidate showed a full understanding/application or analysis/evaluation of the knowledge and skills, clinical reasoning, communication, and professionalism required for safe and effective practice for the task being assessed.
- **Score 2** — The candidate showed less than a full understanding/application or analysis/evaluation of the knowledge and skills, clinical reasoning, communication, and professionalism required for safe and effective practice for the task being assessed.
- **Score 1** — The candidate did not show accurate understanding/application or analysis/evaluation of the knowledge and skills, clinical reasoning, communication, and professionalism required for safe and effective practice for the task being assessed.

When writing the score card in step 6, list per-domain scores as **Domain — Score (weight%)** using the 1-3 scale, then compute a weighted composite. Do not invent percentage scores like /100 or /5 — use only the ABPD 1-3 scale.
"""
)
```

- [ ] **Step 2: Commit**

```bash
git add agents/oralboards/src/oralboards_agent/agent.py
git commit -m "feat(oralboards): update system prompt with 5-phase interview sequence and presentation wait"
```

---

## Task 2: Delete tab-for-status

**Files:**
- Delete: `apps/web/src/components/chat/oral-boards/tab-for-status.ts`
- Delete: `apps/web/src/components/chat/oral-boards/tab-for-status.test.ts`

- [ ] **Step 1: Delete both files**

```bash
rm apps/web/src/components/chat/oral-boards/tab-for-status.ts
rm apps/web/src/components/chat/oral-boards/tab-for-status.test.ts
```

- [ ] **Step 2: Verify no remaining imports**

```bash
grep -r "tab-for-status\|tabForStatus\|OralBoardsTab" apps/web/src
```

Expected: no matches (the only consumer is `OralBoardsPanel.tsx`, which gets rewritten in Task 3).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(oralboards): delete tab-for-status helper, no longer needed"
```

---

## Task 3: Rewrite OralBoardsPanel.tsx

**Files:**
- Rewrite: `apps/web/src/components/chat/oral-boards/OralBoardsPanel.tsx`

- [ ] **Step 1: Write the new panel**

Replace the entire file with:

```tsx
"use client";

import { useState } from "react";
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
    void speak(caseBody, { speed: CASE_SPEED }).finally(() => setPlaying(false));
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
}: {
  caseBody: string;
  sources: CaseSource[];
  transcript: OralBoardsExchange[];
}) {
  const live = useCurrentQuestion();
  const question = live || transcript.at(-1)?.question || "";

  return (
    <div className="space-y-4">
      <details>
        <summary className="text-muted-foreground cursor-pointer text-xs font-medium tracking-wide uppercase select-none">
          Case vignette
        </summary>
        <div className="mt-2">
          <VignetteBody caseBody={caseBody} sources={sources} showTts={false} />
        </div>
      </details>

      <div className="space-y-1">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Current question
        </p>
        <p className="text-sm leading-relaxed">{question || "Waiting for the next question…"}</p>
      </div>

      <ExchangeList transcript={transcript} />
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
}: {
  state: OralBoardsState;
  fullscreen: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
  onReady: () => void;
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
        className={status === "presenting" ? "flex h-full flex-col" : "space-y-4"}
      >
        {status === "presenting" && (
          <PresentingPane caseBody={caseBody} sources={sources} onReady={onReady} />
        )}
        {status === "questioning" && (
          <QuestioningPane caseBody={caseBody} sources={sources} transcript={transcript} />
        )}
        {(status === "complete" || status === "feedback") && (
          <FeedbackPane scoreCard={scoreCard} transcript={transcript} />
        )}
      </ArtifactContent>
    </Artifact>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/chat/oral-boards/OralBoardsPanel.tsx
git commit -m "feat(oralboards): rewrite panel with presenting/questioning/complete panes"
```

---

## Task 4: Update OralBoardsPanel tests

**Files:**
- Rewrite: `apps/web/src/components/chat/oral-boards/OralBoardsPanel.test.tsx`

- [ ] **Step 1: Write updated tests**

Replace the entire file with:

```tsx
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

import { OralBoardsPanel } from "./OralBoardsPanel";

const noop = () => {};

const baseProps = {
  fullscreen: false,
  onClose: noop,
  onToggleFullscreen: noop,
  onReady: noop,
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
  it("renders collapsible vignette summary and current question fallback", () => {
    const state: OralBoardsState = {
      case: "A 4-year-old presents with early childhood caries.",
      case_sources: [],
      status: "questioning",
      transcript: [
        { question: "What is your initial impression?", answer: "", feedback: "", citations: [] },
      ],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    expect(screen.getByText("Case vignette")).toBeDefined();
    // fallback to last transcript question when useCurrentQuestion returns ""
    expect(screen.getByText("What is your initial impression?")).toBeDefined();
  });

  it("renders prior exchange feedback in the transcript list", () => {
    const state: OralBoardsState = {
      case: "Case text.",
      case_sources: [],
      status: "questioning",
      transcript: [
        {
          question: "What additional history do you need?",
          answer: "I would ask about diet.",
          feedback: "**Interview phase:** Data gathering and diagnosis\nGood start.",
          citations: [],
        },
      ],
    };

    render(<OralBoardsPanel state={state} {...baseProps} />);

    expect(screen.getByText("Your answer: I would ask about diet.")).toBeDefined();
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
git commit -m "test(oralboards): update panel tests for three-pane layout"
```

---

## Task 5: Wire onReady in OralBoardsWorkspace

**Files:**
- Modify: `apps/web/src/components/chat/OralBoardsWorkspace.tsx`

- [ ] **Step 1: Add the handleReady callback and pass onReady to the panel**

Replace the entire file with:

```tsx
"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAgent, useCopilotKit, UseAgentUpdate } from "@copilotkit/react-core/v2";

import type { OralBoardsState } from "@agents/types";
import { getAgentConfig } from "@/components/chat/agents/registry";
import { useNewThread } from "@/components/chat/use-new-thread";
import { AgentExtensionSlot } from "@/components/chat/agents/extensions";
import { AgentSuggestions } from "@/components/chat/agents/suggestions";
import { ChatSurface } from "@/components/chat/ChatSurface";
import { NavRail } from "@/components/chat/NavRail";
import { OralBoardsPanel } from "@/components/chat/oral-boards/OralBoardsPanel";
import { WorkspaceShell, useArtifactPanel } from "@/components/workspace-shell";
import { cssVars } from "@/lib/css";

const AGENT_ID = "oral-boards" as const;

/**
 * Bespoke Oral Boards console: same chat shell as AgentWorkspace, but the side
 * pane is the OralBoardsPanel (case / question / feedback) rather than the
 * generic artifact panel. Must render inside the agent's <ConsoleSession>.
 */
export function OralBoardsWorkspace() {
  const router = useRouter();
  const config = getAgentConfig(AGENT_ID);
  const { state, dispatch } = useArtifactPanel(AGENT_ID);
  const { agent } = useAgent({ agentId: AGENT_ID, updates: [UseAgentUpdate.OnStateChanged] });
  const { copilotkit } = useCopilotKit();
  const startNewThread = useNewThread(AGENT_ID);

  // CopilotKit agent state is intentionally dynamic; the panel validates the
  // fields it needs.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const examState = (agent?.state ?? {}) as OralBoardsState;
  const hasPanel = Boolean(examState.case && examState.case.trim());

  // Optimistically flip the UI pane to "questioning" and send "ready" to trigger
  // the agent's first question — no agent round-trip before the pane switches.
  const handleReady = useCallback(() => {
    if (!agent) return;
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    agent.setState({ ...(agent.state as OralBoardsState), status: "questioning" });
    agent.addMessage({ id: crypto.randomUUID(), role: "user", content: "ready" });
    void copilotkit.runAgent({ agent });
  }, [agent, copilotkit]);

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
            onSwitchAgent={(id) => router.push(`/console/${id}/${crypto.randomUUID()}`)}
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
              onReady={handleReady}
            />
          ) : null
        }
      />
    </main>
  );
}
```

- [ ] **Step 2: Run the type-checker**

```bash
cd apps/web && pnpm tsc --noEmit 2>&1 | head -40
```

Expected: no errors in `OralBoardsWorkspace.tsx` or `OralBoardsPanel.tsx`.

- [ ] **Step 3: Run the full test suite**

```bash
pnpm test --run
```

Expected: all tests pass; no references to `tab-for-status` or `OralBoardsTab` remain.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat/OralBoardsWorkspace.tsx
git commit -m "feat(oralboards): wire onReady — optimistic setState + trigger agent first question"
```
