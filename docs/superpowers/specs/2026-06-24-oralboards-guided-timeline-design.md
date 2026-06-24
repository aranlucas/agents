# Oral Boards Guided Timeline Design

## Goal

Make the graph-based oral-board workflow easier to follow during long model
transitions and easier to review after completion. The UI should clearly
distinguish asking, answering, evaluation, and scoring without changing the
agent protocol or shared-state contract.

## Scope

This change is limited to the oral-boards panel and its focused tests:

- `apps/web/src/components/chat/oral-boards/oral-boards-panel.tsx`
- `apps/web/src/components/chat/oral-boards/oral-boards-panel.test.tsx`

The existing split-pane workspace, recording controls, TTS behavior, agent
state, and backend workflow remain unchanged.

## User Experience

### Guided timeline

Replace the unlabeled progress dots with a compact, accessible timeline:

1. Case
2. Question N
3. Reviewing
4. Complete

The active stage receives the strongest visual treatment. Completed stages use
the existing emerald success color, while upcoming stages remain muted. The
timeline exposes text labels to assistive technology and does not rely on color
alone.

During questioning, the second stage shows the current question number. During
evaluation, `Reviewing` becomes active. During final scoring, the timeline
shows `Complete` as pending with the status text `Computing score card…`.

### Stable evaluation state

After an answer is submitted:

- Keep the submitted question visible.
- Replace the editable composer with a compact read-only answer card.
- Show the current loading step beside a spinner.
- Do not increment the visible question number until the next question exists.
- Do not render a fake next question while the score card is being generated.

This removes the current transient “Question 7” state after a six-question
exam.

### Feedback hierarchy

During an active exam:

- Older exchanges remain collapsed summary rows.
- The newest completed exchange remains expanded.
- Model answers and citations move into collapsible detail sections.
- The primary feedback remains visible without requiring expansion.

On the final score screen:

1. Outcome banner
2. Skillset score table
3. Narrative score summary
4. Expandable per-question review
5. Start-new-case action

Each question review starts collapsed, with its question, skillset, cognitive
level, and score visible in the trigger row.

## Visual Direction

The panel keeps the existing clinical indigo, emerald, amber, and red palette.
The design remains restrained and information-led rather than introducing a
new theme.

The signature element is the stage timeline: a compact clinical workflow strip
that behaves like a patient-care sequence rather than generic application
progress dots.

No new fonts, global tokens, gradients, or decorative animation are introduced.
Motion is limited to the existing spinner, recording pulse, and collapsible
transitions.

## Component Changes

### `ExamTimeline`

A small internal component receives:

- current phase
- whether the agent is running
- transcript count
- whether a score card exists

It derives the active and completed stages and renders accessible labels.

### `ReviewingAnswer`

A read-only state shown after submission and while the evaluator or scorer is
running. It contains:

- submitted answer
- current loading text
- spinner/status treatment

The textarea and submit action are not mounted in this state.

### `FeedbackDetails`

A reusable collapsible section for model answers and citations. This prevents
the highest-density content from dominating both the live feedback card and
final review.

### `CompletedExchangeRow`

Use the existing compact row pattern for the final review as well as prior
questions during the exam. The row exposes enough score metadata to scan the
whole attempt without opening every answer.

## State Derivation

No new persisted state is required.

- `isRunning && answerText has been submitted` indicates evaluation.
- `loadingStep === "Computing score card…"` or a completed interview without a
  score card indicates scoring.
- A non-empty score card or `status === "complete"` indicates completion.
- The current question number is based on the existing transcript plus the
  presence of a real current question, not only `transcript.length + 1`.

Any ephemeral submitted answer used by the reviewing card stays local to the
panel and is cleared when the next question or final score arrives.

## Accessibility

- Timeline stages have visible text and an ordered-list structure.
- Active status uses `aria-current="step"`.
- Reviewing updates use an appropriate status region.
- Collapsible triggers retain keyboard support and descriptive accessible names.
- Disabled controls are replaced by a clear read-only state instead of relying
  only on disabled styling.
- Existing keyboard submission remains unchanged.

## Responsive Behavior

Desktop keeps the current resizable case-and-exam split.

On narrow screens:

- Timeline labels remain visible but compact.
- Feedback trigger rows wrap score metadata instead of truncating essential
  labels.
- Read-only review and composer states use the full available width.
- No new fixed widths are introduced.

## Testing

Focused component tests will cover:

- timeline labels and active stage during questioning
- reviewing state after submitting an answer
- question number remaining stable during evaluation
- scoring state not rendering a fake next question
- model-answer and citation details being collapsed by default
- final per-question reviews being collapsed by default
- complete outcome and new-case action remaining visible

Existing presenting, recording, submission, and feedback tests must continue to
pass.

## Acceptance Criteria

- A candidate can always tell whether the system is asking, reviewing, or
  scoring.
- The active question does not disappear immediately after submission.
- Completion never appears as an unanswered extra question.
- The final score screen prioritizes outcome and skillset results over verbose
  answer details.
- All new UI is keyboard accessible and responsive.
- Focused tests, web tests, `pnpm check`, React Doctor, and the production web
  build pass before the PR is opened.
