# Oral Boards Guided Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guided exam timeline, stable answer-review state, and compact expandable feedback hierarchy to the oral-boards panel.

**Architecture:** Keep all behavior inside the existing `OralBoardsPanel` component boundary. Derive visual stages from the existing `status`, `isRunning`, `loadingStep`, transcript, score card, and current-question context; retain only the submitted answer as local ephemeral state until the next question or final result arrives.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, shadcn-style `@agents/ui` primitives, Tailwind CSS, Lucide icons.

## Global Constraints

- Do not change the agent protocol, backend workflow, or persisted shared-state contract.
- Preserve the desktop resizable split-pane, recording controls, TTS behavior, and keyboard submission.
- Keep the existing clinical indigo, emerald, amber, and red palette.
- Do not add dependencies, fonts, global tokens, gradients, or decorative animation.
- Timeline stages are exactly `Case`, `Question N`, `Reviewing`, and `Complete`.
- Model answers, citations, and completed per-question reviews are collapsed by default.
- Run focused tests, all web tests, `pnpm check`, React Doctor, and the production web build before publishing.

---

### Task 1: Add the accessible exam timeline and stable review state

**Files:**

- Modify: `apps/web/src/components/chat/oral-boards/oral-boards-panel.tsx`
- Test: `apps/web/src/components/chat/oral-boards/oral-boards-panel.test.tsx`

**Interfaces:**

- Consumes: `status`, `isRunning`, `loadingStep`, `transcript`, `scoreCard`, and `currentQuestion`.
- Produces: internal `ExamTimeline` and `ReviewingAnswer` components; no exported API changes.

- [ ] **Step 1: Write failing timeline and review-state tests**

Add tests that:

```tsx
it("labels the current questioning stage accessibly", async () => {
  // currentQuestion = "What is your diagnosis?"
  // status = "questioning", isRunning = false
  expect(screen.getByRole("list", { name: "Exam progress" })).toBeInTheDocument();
  expect(screen.getByText("Question 1")).toHaveAttribute("aria-current", "step");
});

it("keeps the submitted question and answer visible while reviewing", async () => {
  // submit an answer, rerender with isRunning=true and loadingStep="Reviewing your answer…"
  expect(screen.getByText("What is your diagnosis?")).toBeInTheDocument();
  expect(screen.getByText("My diagnosis is reversible pulpitis.")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Reviewing your answer…");
  expect(screen.queryByRole("textbox", { name: "Your answer" })).not.toBeInTheDocument();
});

it("does not render a fake next question while computing the score card", () => {
  // transcript has six exchanges, isRunning=true, loadingStep="Computing score card…"
  expect(screen.getByText("Complete")).toHaveAttribute("aria-current", "step");
  expect(screen.queryByText("Question 7")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm --filter web test -- src/components/chat/oral-boards/oral-boards-panel.test.tsx
```

Expected: the new tests fail because the labeled timeline and read-only reviewing state do not exist.

- [ ] **Step 3: Implement `ExamTimeline`**

Add an internal component with this contract:

```ts
type ExamTimelineProps = {
  questionNumber: number;
  stage: "question" | "reviewing" | "scoring" | "complete";
};
```

Render an ordered list named `Exam progress`. Mark the active item with
`aria-current="step"`, completed items with a check icon and emerald treatment,
and upcoming items with muted treatment. For `scoring`, render `Complete` as
active and show `Computing score card…` as the status text.

- [ ] **Step 4: Implement submitted-answer retention**

In `QuestioningPane`, add:

```ts
const [submittedAnswer, setSubmittedAnswer] = useState("");
const previousQuestionRef = useRef(question);
```

On submit, copy the trimmed answer into `submittedAnswer` before calling
`onAnswer`. Clear it when a genuinely new `currentQuestion` arrives or the
component unmounts. While `submittedAnswer && isRunning`, render
`ReviewingAnswer` instead of the editable composer.

- [ ] **Step 5: Derive stable stage and question number**

Use the actual current question and loading step:

```ts
const isScoring = isRunning && loadingStep === "Computing score card…";
const stage = isScoring ? "scoring" : submittedAnswer && isRunning ? "reviewing" : "question";
const displayedQuestionNumber = question ? transcript.length + 1 : Math.max(transcript.length, 1);
```

Keep the last submitted question visible during reviewing, and omit the examiner
question card during scoring.

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run:

```bash
pnpm --filter web test -- src/components/chat/oral-boards/oral-boards-panel.test.tsx
```

Expected: all oral-boards panel tests pass.

- [ ] **Step 7: Commit the timeline task**

```bash
git add apps/web/src/components/chat/oral-boards/oral-boards-panel.tsx apps/web/src/components/chat/oral-boards/oral-boards-panel.test.tsx
git commit -m "feat(oralboards): add guided exam timeline"
```

### Task 2: Collapse dense feedback details and final question reviews

**Files:**

- Modify: `apps/web/src/components/chat/oral-boards/oral-boards-panel.tsx`
- Test: `apps/web/src/components/chat/oral-boards/oral-boards-panel.test.tsx`

**Interfaces:**

- Consumes: `OralBoardsExchange.ideal_response`, `citations`, score metadata, and existing `Collapsible` primitives.
- Produces: internal `FeedbackDetails`; extends `CompletedExchangeRow` for final review reuse.

- [ ] **Step 1: Write failing collapse-behavior tests**

Add tests that:

```tsx
it("collapses model answer and citations in live feedback by default", async () => {
  expect(screen.queryByText("Use articaine with epinephrine.")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Show model answer and sources" }));
  expect(screen.getByText("Use articaine with epinephrine.")).toBeInTheDocument();
});

it("collapses completed question reviews on the final score screen", async () => {
  expect(screen.getByRole("button", { name: /^Q1/ })).toBeInTheDocument();
  expect(screen.queryByText("Your answer: I would use local anesthesia.")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /^Q1/ }));
  expect(screen.getByText("Your answer: I would use local anesthesia.")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm --filter web test -- src/components/chat/oral-boards/oral-boards-panel.test.tsx
```

Expected: the model answer and final transcript are currently expanded, so the
new assertions fail.

- [ ] **Step 3: Implement `FeedbackDetails`**

Add an internal component:

```ts
type FeedbackDetailsProps = {
  idealResponse: string;
  citations: CaseSource[];
};
```

Return `null` when both values are empty. Otherwise render a collapsed
`Collapsible` with trigger text `Show model answer and sources`; inside, render
`ModelAnswer` and `CitationChips`.

- [ ] **Step 4: Use compact details in feedback cards**

Replace direct `ModelAnswer` and `CitationChips` rendering in
`CompletedExchangeRow`, `LastFeedbackCard`, and `LiveFeedbackPreview` with
`FeedbackDetails`. Keep primary feedback visible.

- [ ] **Step 5: Reuse `CompletedExchangeRow` in `FeedbackPane`**

Replace the fully expanded final transcript map with:

```tsx
<div className="space-y-2" aria-label="Question review">
  {transcript.map((exchange, index) => (
    <CompletedExchangeRow key={exchange.question || index} exchange={exchange} index={index} />
  ))}
</div>
```

Place it after outcome, score table, and narrative score card. Add a small
`Question review` heading above the list.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
pnpm --filter web test -- src/components/chat/oral-boards/oral-boards-panel.test.tsx
```

Expected: all oral-boards panel tests pass.

- [ ] **Step 7: Commit the feedback hierarchy task**

```bash
git add apps/web/src/components/chat/oral-boards/oral-boards-panel.tsx apps/web/src/components/chat/oral-boards/oral-boards-panel.test.tsx
git commit -m "feat(oralboards): compact feedback review"
```

### Task 3: Verify, inspect, and publish the UI PR

**Files:**

- Verify: `apps/web/src/components/chat/oral-boards/oral-boards-panel.tsx`
- Verify: `apps/web/src/components/chat/oral-boards/oral-boards-panel.test.tsx`
- Include: `docs/superpowers/specs/2026-06-24-oralboards-guided-timeline-design.md`
- Include: `docs/superpowers/plans/2026-06-24-oralboards-guided-timeline.md`

**Interfaces:**

- Consumes: completed Tasks 1–2.
- Produces: pushed branch and draft GitHub pull request targeting `main`.

- [ ] **Step 1: Run focused and full web tests**

```bash
pnpm --filter web test -- src/components/chat/oral-boards/oral-boards-panel.test.tsx
pnpm --filter web test
```

Expected: all test files and tests pass.

- [ ] **Step 2: Run repository gates and build**

```bash
pnpm check
SKIP_ENV_VALIDATION=1 pnpm --filter web build
```

Expected: both commands exit 0. Existing warning-only diagnostics may be
reported separately.

- [ ] **Step 3: Run React Doctor regression scan**

```bash
npx react-doctor@latest --verbose --scope changed
```

Expected: no newly introduced errors and no score regression attributable to
the changed oral-boards files.

- [ ] **Step 4: Inspect the UI locally**

Run:

```bash
pnpm dev:web
```

Use Chrome to verify:

- question stage timeline
- submitted-answer review state
- no fake question during scoring
- collapsible model-answer/source details
- final outcome/table/question-review hierarchy
- responsive narrow viewport behavior

- [ ] **Step 5: Review the final diff**

```bash
git diff origin/main...HEAD --check
git status --short --branch
git log --oneline origin/main..HEAD
```

Expected: only the approved spec, plan, oral-boards panel, and its tests are in
scope.

- [ ] **Step 6: Push the branch**

```bash
git push -u origin codex/fix-oralboards-v2-resume
```

- [ ] **Step 7: Open a draft PR**

Create a draft PR targeting `main` with title:

```text
[codex] improve oral-boards exam progress and feedback UI
```

The body must summarize:

- guided stage timeline
- stable reviewing/scoring states
- compact model-answer and citation details
- expandable final question reviews
- exact validation commands and results
