# Oral Boards Examiner Agent — Design

**Date:** 2026-06-10
**Status:** Approved for planning

## Summary

A new Python ADK agent, `agents/oralboards/`, that runs mock oral-board exams
for pediatric dentistry (ABPD Oral Clinical Exam prep). The agent invents case
vignettes, but **only from retrieved source material** bundled with the agent:
ABPD exam guides, AAPD clinical policies, and prep-course case materials from
the `oral-boards` repo. It quizzes the user on the case, grades answers against
the source documents, and writes everything to AG-UI shared state for a new
`/oral-boards` page in `apps/web`.

## Goals

- Mock oral examiner: present a grounded case, ask staged questions, evaluate
  answers, produce a cited score card.
- Every clinical claim — in the vignette, feedback, and scoring — must trace to
  a retrieved source document. No clinical content from model memory.
- Deployable on Railway with the existing `Dockerfile.agents` and minimal new
  dependencies.

## Non-goals (this pass)

- Mobile screen (`apps/mobile`) — follows later.
- Vector/hybrid search parity with the oral-boards web app — BM25 only.
- Porting `data/cases.ts` / `examFramework.ts` from the oral-boards repo.
- Free-form Q&A study-companion mode.

## Source data

The oral-boards repo (`~/Projects/oral-boards`) maintains a committed
`search.sqlite` (~21 MB) built by its `scripts/build-index.mjs` from
`docs-extracted/` (209 markdown files in three collections):

| Collection | Content |
| ---------- | ------- |
| `abpd`     | ABPD exam guides, blueprint, scoring, study materials |
| `aapd`     | AAPD clinical practice guidelines and policies |
| `cody`     | Prep-course materials and clinical cases |

Key tables: `documents` (id, collection, path, title, hash), `content`
(hash → full markdown body), `documents_fts` (FTS5 index over filepath, title,
body). Document bodies live in the DB, so the markdown files are not needed at
runtime.

**Sync mechanism:** `agents/oralboards/data/search.sqlite` is copied from the
oral-boards repo and committed to this repo (mirroring how oral-boards commits
it). A script `scripts/sync-oralboards-db.sh` re-copies
`../oral-boards/search.sqlite` when docs change. The agent opens the DB
read-only (`mode=ro`) and ignores the vector tables.

## Architecture

```
apps/web /oral-boards page
  → CopilotKit runtime (route.ts)
  → HttpAgent → oralboards agent service (:8002, Railway)
      LlmAgent (examiner) ── retrieval tools ──> data/search.sqlite (FTS5/BM25)
                          └─ state tools ─────> ADK shared state → UI canvas
```

The agent service follows the grocery agent's structure exactly: `_setup_otel()`
→ `LlmAgent` → `ADKAgent` → FastAPI with `add_adk_fastapi_endpoint` at `/agui`,
A2A JSON-RPC routes + agent card, CORS, request tracing middleware, `GET
/health`, Clerk user-id extraction from the `x-clerk-user-id` header. No
external MCP server — all tools are local Python functions.

## Retrieval tools

Pure stdlib `sqlite3`, FTS5/BM25:

- `search_docs(query: str, collection: str = "") -> dict` — top-10 rows of
  `{docid, filepath, title, snippet, collection}` ordered by BM25. Optional
  collection filter (`abpd | aapd | cody`). Query is escaped the same way the
  web app escapes it (strip `*` and `"`).
- `read_doc(filepath: str) -> dict` — full markdown body from the `content`
  table joined through `documents` (e.g. `aapd/bp_pulptherapy25.md`).

## Exam flow

The LLM drives the exam; there is no rigid server-side state machine. The
system instruction enforces:

1. **Grounding before presenting.** Pick a topic (or take the user's request),
   call `search_docs`/`read_doc` over `cody` and `aapd`/`abpd`, and compose the
   vignette only from retrieved material. Patient presentation, findings, and
   management options must trace to specific documents.
2. **Empty retrieval → no improvisation.** If a topic has no source coverage,
   say so and offer adjacent topics found in the docs.
3. **Staged questioning.** Present the case, then ask questions one at a time
   (diagnosis → management → complications, per OCE style found in the abpd
   docs). Record each exchange in state.
4. **Cited grading.** Feedback per answer and the final score card must cite
   retrieved docs. No clinical claims without a retrieval behind them.

## Shared state (`OralBoardsState` in `packages/types`)

State is the source of truth; the agent never pastes exam content into chat.

```ts
interface OralBoardsState {
  case: string;            // markdown vignette — token-streamed
  case_sources: CaseSource[]; // { docid, title, collection } provenance
  phase: "idle" | "presenting" | "questioning" | "feedback" | "complete";
  transcript: Exchange[];  // { question, answer, feedback, citations }
  score_card: string;      // markdown: per-criterion scores + cited feedback
  status: string;
}
```

State tools: `set_case(case, sources)`, `set_phase(phase)`,
`append_exchange(question, answer, feedback, citations)`,
`set_score_card(markdown)`. `set_case` streams token-by-token via
`PredictStateMapping(state_key="case", tool="set_case", tool_argument="case",
stream_tool_call=True)`.

## Web surface

- `apps/web/src/app/oral-boards/page.tsx` — exam canvas built from the shared
  design-system components (`WorkspaceShell`, shadcn primitives), rendering the
  vignette, provenance chips, transcript, and score card from `agent.state`.
- Agent registered in `apps/web/src/app/api/copilotkit/route.ts`.
- Route protected by Clerk middleware like `/travel` and `/grocery`.
- All CopilotKit hooks from `@copilotkit/react-core/v2`.

## Deployment & plumbing

- `agents/oralboards/pyproject.toml` — `name = "oralboards-agent"`, same dep
  set as grocery minus MCP client extras.
- `docker-compose.yml` — new `oralboards` service on `:8002`.
- `agents/oralboards/railway.json` — root `Dockerfile.agents`,
  `AGENT_DIR=agents/oralboards`. The 21 MB sqlite ships inside the image.
- Model: same LiteLlm config/fallback chain as the grocery agent.

## Error handling

- DB missing/unreadable at startup → fail fast with a clear log line; `/health`
  reports unhealthy.
- FTS query syntax errors → escape input; on failure return
  `{results: [], error}` so the agent can rephrase rather than crash.
- `read_doc` with unknown filepath → `{error: "not found"}`.

## Testing

Pytest in `agents/oralboards/tests/`, run against the real committed sqlite:

- `search_docs` returns results for known terms (e.g. "pulpotomy"), respects
  the collection filter, and handles FTS-hostile input (`"`, `*`).
- `read_doc` returns a non-empty body for a known filepath and an error for an
  unknown one.
- State tools write the expected keys/shapes to `tool_context.state`.
- A2A/session tests cloned from grocery's where applicable.

JS side: `pnpm check` (oxlint/oxfmt) over the new page and types.
