# Task 1 Report — accessible exam timeline and stable review state

## Implementation

- Added an internal `ExamTimeline` in `apps/web/src/components/chat/oral-boards/oral-boards-panel.tsx`.
  - Renders an ordered list with `aria-label="Exam progress"`.
  - Marks the active step with `aria-current="step"`.
  - Shows completed question steps with check-icon / emerald styling.
  - Uses `Complete` as the active step during `Computing score card…`.
- Added an internal `ReviewingAnswer` read-only state in `apps/web/src/components/chat/oral-boards/oral-boards-panel.tsx`.
  - Preserves the submitted answer while `isRunning` is true.
  - Shows the reviewing status via `role="status"`.
  - Hides the editable answer textbox while reviewing.
- Added stable review/scoring state derivation in `QuestioningPane`.
  - Tracks `submittedAnswer`.
  - Tracks the last live question with `previousQuestionRef`.
  - Clears `submittedAnswer` only when a genuinely new `currentQuestion` arrives.
  - Omits the examiner question card during score-card computation so the UI does not invent a fake next question.

## Files changed

- `apps/web/src/components/chat/oral-boards/oral-boards-panel.tsx`
- `apps/web/src/components/chat/oral-boards/oral-boards-panel.test.tsx`

## TDD evidence

### RED

Added these failing tests to `apps/web/src/components/chat/oral-boards/oral-boards-panel.test.tsx`:

- `labels the current questioning stage accessibly`
- `keeps the submitted question and answer visible while reviewing`
- `does not render a fake next question while computing the score card`

Command:

```bash
pnpm --filter web test -- src/components/chat/oral-boards/oral-boards-panel.test.tsx
```

Result:

- `3 failed`
- missing `role="list"` with name `Exam progress`
- missing submitted answer retention during reviewing
- missing `Complete` active step / fake next-question suppression during scoring

Exact RED summary:

```text
❯ src/components/chat/oral-boards/oral-boards-panel.test.tsx (14 tests | 3 failed)
Test Files  1 failed | 41 passed (42)
Tests  3 failed | 271 passed (274)
Exit status 1
```

### GREEN

Implemented the minimal panel changes above, then reran the same focused test command.

Command:

```bash
pnpm --filter web test -- src/components/chat/oral-boards/oral-boards-panel.test.tsx
```

Result:

```text
Test Files  42 passed (42)
Tests  274 passed (274)
Exit status 0
```

## Additional verification

### React Doctor

Command:

```bash
npx react-doctor@latest --verbose --scope changed
```

Result:

- scanned changed files for `web`
- score `100 / 100 Great`
- no changed-source diagnostics reported

### Diff hygiene

Command:

```bash
git diff --check
```

Result:

- exit status `0`

## Self-review

- The change stays inside the two requested files.
- No backend workflow or shared-state contract changed.
- The review state is now stable because the last submitted answer persists until a new live question actually arrives.
- The scoring state no longer renders a phantom next question.
- The accessible progress indicator is now queryable by role/name and exposes the active step semantically.

## Concerns

- The new tests locally reset the mocked oral-boards question context inline rather than via shared test cleanup; they are passing as written, but a future cleanup helper could make mock reset behavior more explicit.

## Review fixes

### Findings addressed

- Replaced the accumulated-question timeline with an exact four-stage model:
  - `Case`
  - `Question N`
  - `Reviewing`
  - `Complete`
- Kept `Case` present and completed once the panel is in questioning flow.
- Made `Reviewing` the distinct active stage while the submitted answer is being evaluated.
- Kept `Complete` as the active stage during score-card computation.
- Removed the duplicate scoring live-region so only one `role="status"` announces `Computing score card…`.

### Test updates

Updated `apps/web/src/components/chat/oral-boards/oral-boards-panel.test.tsx` to assert:

- the timeline always contains exactly four stages
- `Case` is present during questioning/reviewing/scoring
- `Reviewing` is the active stage while evaluating the submitted answer
- `Complete` is the active stage during score-card computation
- scoring exposes exactly one live status announcement

### Review-fix RED

Command:

```bash
pnpm --filter web test -- src/components/chat/oral-boards/oral-boards-panel.test.tsx
```

Result:

```text
❯ src/components/chat/oral-boards/oral-boards-panel.test.tsx (14 tests | 3 failed)
FAIL ... labels the current questioning stage accessibly
expected ... to have a length of 4 but got 2

FAIL ... keeps the submitted question and answer visible while reviewing
expected ... to have a length of 4 but got 2

FAIL ... does not render a fake next question while computing the score card
expected ... to have a length of 4 but got 8

Test Files  1 failed | 41 passed (42)
Tests  3 failed | 271 passed (274)
Exit status 1
```

### Review-fix GREEN

Command:

```bash
pnpm --filter web test -- src/components/chat/oral-boards/oral-boards-panel.test.tsx
```

Exact output:

```text
Test Files  42 passed (42)
Tests  274 passed (274)
Start at  22:17:26
Duration  7.76s (transform 2.71s, setup 7.49s, import 17.44s, tests 7.78s, environment 24.95s)
```

### Post-fix verification

Command:

```bash
npx react-doctor@latest --verbose --scope changed
```

Result:

- `web 100 Great`

Command:

```bash
git diff --check
```

Result:

- exit status `0`
