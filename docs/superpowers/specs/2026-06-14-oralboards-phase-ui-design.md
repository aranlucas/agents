# Oral Boards — Phase UI & System Prompt Design

**Date:** 2026-06-14  
**Scope:** `agents/oralboards/src/oralboards_agent/agent.py` · `apps/web/src/components/chat/oral-boards/`

---

## Problem

The current oral-boards panel is a persistent split showing the case vignette alongside a binary question/feedback tab switcher. There is no distinct "read the case first" step — the agent jumps straight into questioning — and the chat stream carries too much of the exam structure that should live in the pane UI.

---

## Goal

1. **System prompt** — encode the 5-phase interview progression so the agent sequences questions correctly; hold the agent at the presenting step until the candidate signals readiness.
2. **UI** — three purpose-built panes driven by `state.status`; no tabs.

---

## Three-pane model

| `state.status` | Pane content                                                                     |
| -------------- | -------------------------------------------------------------------------------- |
| `presenting`   | Full-pane case vignette + TTS button + "Ready to begin" CTA pinned to bottom     |
| `questioning`  | Collapsible vignette (collapsed by default) · current question · prior exchanges |
| `complete`     | Score card · full Q&A transcript                                                 |

The `idle` status shows nothing (agent hasn't presented a case yet). The `tab-for-status.ts` helper and `OralBoardsTab` type are deleted.

---

## "Ready to begin" button behavior

Clicking the button performs two actions synchronously:

1. `setState({ status: "questioning" })` via `useCoAgent` — switches the UI pane immediately, no agent round-trip required.
2. `appendMessage("ready")` via `useCopilotChat` — sends a message that triggers the agent to call `set_phase("questioning")` and ask the first question.

Because the UI already shows the Q&A pane before the agent responds, the transition feels instant.

---

## Vignette in Q&A pane

The case vignette is available in the questioning pane as a collapsed `<details>` element at the top. It starts closed so the current question is immediately visible, but the candidate can expand it any time to reference the case. This mirrors the real exam (printed vignette on the table).

---

## System prompt — revised `## Exam flow` section

Replace the current exam flow section in `_STATIC_INSTRUCTION` with the following verbatim:

```
## Exam flow

1. Pick a topic or use the user's requested topic.
2. Run search_docs (at minimum: one broad query, one aapd/abpd query).
   Read the top documents with read_doc. Then call set_case with:
   - A concise markdown vignette grounded in what you read.
   - Source chips: [{"docid": N, "title": "...", "collection": "aapd"}, ...].
   In chat, say: "Take your time reading the case. Click **Ready to begin**
   when you want to start." Then stop — do not call set_phase yet.

3. When the candidate signals readiness, call set_phase("questioning") once.
   Then ask the first question and stop. Wait for the candidate's answer.
   Do not call set_phase again for the remainder of the session.

4. Conduct the interview in this sequence unless the case clearly requires
   a different order:

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

   Ask exactly one question per turn. Never answer your own question
   and never reveal the model answer or scoring rationale until
   set_score_card is called.

5. After the candidate answers each question, re-search or reuse existing
   docs, then call append_exchange with:
   - The exact question text
   - The candidate's verbatim answer
   - Feedback that begins: "**Interview phase:** <phase name from 4a–4e>"
     followed by concise cited feedback
   - Citation chips

6. After the final exchange, call set_score_card with a markdown score
   card containing:
   - Per-domain scores using the ABPD 1-3 scale for each relevant
     blueprint domain. Format: "Domain — Score (weight%)" with cited
     rationale.
   - A weighted composite score shown as "X.Y / 3.0".
   - Cited feedback tying each score to the candidate's performance.
   Then summarize in 1–2 chat sentences.
```

---

## Backend changes (`agent.py`)

No new tools or state fields. `OralBoardsState` and all tool signatures stay exactly as-is. The 5-phase progression is a system prompt concern only.

---

## Frontend changes

### `OralBoardsPanel.tsx`

Replace `CaseVignette + tabs` with a status switch:

```
status === "presenting"  → <PresentingPane>
status === "questioning" → <QuestioningPane>
status === "complete"    → <FeedbackPane>
default (idle)           → null
```

**`PresentingPane`**

- Full-pane vignette with `Streamdown`
- "Present case" TTS button
- Citation chips
- "Ready to begin" `<Button>` pinned to bottom; on click: `setState({ status: "questioning" })` + `appendMessage("ready")`

**`QuestioningPane`**

- `<details>` collapsed vignette at top (label: "Case vignette ▸")
- Current question via `useCurrentQuestion()` with fallback to `transcript.at(-1)?.question`
- Prior exchanges rendered below (question + user answer + feedback + citation chips)

**`FeedbackPane`**

- Score card via `Streamdown`
- Full transcript (same exchange renderer as Q&A)

### `tab-for-status.ts`

Delete file and its test. The `OralBoardsTab` type is no longer used.

---

## Types (`packages/types/src/index.ts`)

No changes. `OralBoardsPhase` already includes all needed status values. `OralBoardsExchange` stays as-is; the interview phase label lives in the `feedback` markdown string.

---

## Out of scope

- Persisting which interview phase the agent is on as a structured state field (the markdown label in feedback is sufficient)
- Mobile (`apps/mobile`) oral-boards UI — separate effort
