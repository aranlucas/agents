# Task 2 Report — collapsed feedback details and question reviews

## Implementation

- Added internal `FeedbackDetails` in
  `apps/web/src/components/chat/oral-boards/oral-boards-panel.tsx`.
  - Returns `null` when both the model answer and citations are empty.
  - Keeps model answers and citations collapsed by default behind the accessible
    `Show model answer and sources` trigger.
- Reused `FeedbackDetails` in `CompletedExchangeRow`, `LastFeedbackCard`, and
  `LiveFeedbackPreview` while leaving primary feedback visible.
- Reused `CompletedExchangeRow` for the final score screen transcript.
- Added the `Question review` heading and labeled review container.
- Preserved Task 1's timeline and submitted-answer review behavior.

## Files changed

- `apps/web/src/components/chat/oral-boards/oral-boards-panel.tsx`
- `apps/web/src/components/chat/oral-boards/oral-boards-panel.test.tsx`
- `.superpowers/sdd/task-2-report.md`

## TDD evidence

### RED

Command:

```bash
pnpm --filter web test -- src/components/chat/oral-boards/oral-boards-panel.test.tsx
```

Result:

```text
❯ src/components/chat/oral-boards/oral-boards-panel.test.tsx (16 tests | 3 failed)
  × collapses model answer and citations in live feedback by default
  × renders the outcome banner, per-skillset score table, and collapsible transcript review
  × collapses completed question reviews on the final score screen

FAIL ... collapses model answer and citations in live feedback by default
expected document not to contain "Use articaine with epinephrine."

FAIL ... renders the outcome banner, per-skillset score table, and collapsible transcript review
Unable to find an element with the text: Question review.

FAIL ... collapses completed question reviews on the final score screen
Unable to find an accessible element with role "button" and name `/^Q1/`.

Test Files  1 failed | 41 passed (42)
Tests  3 failed | 273 passed (276)
Exit status 1
```

### GREEN

Command:

```bash
pnpm --filter web test -- src/components/chat/oral-boards/oral-boards-panel.test.tsx
```

Result:

```text
Test Files  42 passed (42)
Tests  276 passed (276)
Exit status 0
```

## Additional verification

Command:

```bash
pnpm exec oxfmt --check apps/web/src/components/chat/oral-boards/oral-boards-panel.tsx apps/web/src/components/chat/oral-boards/oral-boards-panel.test.tsx
```

Result:

```text
All matched files use the correct format.
Finished in 110ms on 2 files using 10 threads.
Exit status 0
```

Command:

```bash
npx react-doctor@latest --verbose --scope changed
```

Result:

```text
web  100  Great
Exit status 0
```

Command:

```bash
git diff --check
```

Result:

```text
Exit status 0
```

## Self-review

- The change stays within the two requested code/test files plus this required
  report.
- Primary feedback remains immediately visible.
- Secondary model answers and citations are collapsed by default.
- Final question reviews are collapsed by default and retain keyboard-accessible
  button triggers.
- No backend or shared-state contracts changed.

## Concerns

- None.
