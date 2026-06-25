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

## Reviewer follow-up

### Changes

- Replaced the `Question review` paragraph with an `h2` and connected the
  review container using `aria-labelledby="question-review-heading"`.
- Verified the installed `@base-ui/react` 1.6 Collapsible trigger exposes
  `data-panel-open`, then changed both chevrons to use
  `group-data-panel-open:rotate-180`.
- Expanded the questioning-screen feedback test with a nonempty citation.
  The test now confirms:
  - primary feedback remains visible
  - model answer and citation are hidden by default
  - the trigger exposes `data-panel-open` after expansion
  - model answer and citation are revealed after expansion

### Follow-up RED

Command:

```bash
pnpm --filter web test -- src/components/chat/oral-boards/oral-boards-panel.test.tsx
```

Result:

```text
❯ src/components/chat/oral-boards/oral-boards-panel.test.tsx (16 tests | 2 failed)
× collapses model answer and citations in live feedback by default
× renders the outcome banner, per-skillset score table, and collapsible transcript review

FAIL ... collapses model answer and citations in live feedback by default
Expected the chevron to have class:
  group-data-panel-open:rotate-180
Received:
  data-[open]:rotate-180

FAIL ... renders the outcome banner, per-skillset score table, and collapsible transcript review
Unable to find an accessible element with role "heading" and name "Question review".

Test Files  1 failed | 41 passed (42)
Tests  2 failed | 274 passed (276)
Exit status 1
```

### Follow-up GREEN

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

### Follow-up verification

Command:

```bash
pnpm exec oxfmt --check apps/web/src/components/chat/oral-boards/oral-boards-panel.tsx apps/web/src/components/chat/oral-boards/oral-boards-panel.test.tsx .superpowers/sdd/task-2-report.md
```

Result:

```text
All matched files use the correct format.
Finished in 116ms on 3 files using 10 threads.
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

## TypeScript fixture follow-up

### Change

- Preserved the citation collection literal type with
  `collection: "aapd" as const`, preventing object-property inference from
  widening it to `string`.

### Typecheck RED

Command:

```bash
pnpm --filter web typecheck
```

Result:

```text
src/components/chat/oral-boards/oral-boards-panel.test.tsx(413,23): error TS2322:
Type '{ docid: number; title: string; collection: string; }' is not assignable to type 'CaseSource'.
Types of property 'collection' are incompatible.
Type 'string' is not assignable to type '"aapd" | "abpd" | "cody"'.
Exit status 1
```

### Typecheck GREEN

Command:

```bash
pnpm --filter web typecheck
```

Result:

```text
$ tsc --noEmit
Exit status 0
```

### Focused tests

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

### Formatting

Command:

```bash
pnpm exec oxfmt --check apps/web/src/components/chat/oral-boards/oral-boards-panel.test.tsx .superpowers/sdd/task-2-report.md
```

Result:

```text
All matched files use the correct format.
Finished in 126ms on 2 files using 10 threads.
Exit status 0
```
