# Agent Console — Chat Redesign + ADK-Native Artifacts

**Date:** 2026-06-07
**Status:** Design — pending user review
**Scope:** `apps/web`, `agents/*`, `packages/agent-common`, `packages/types`

## 1. Problem & goals

The current chat surface (`apps/web/src/components/agent-workspace.tsx`) wraps CopilotKit v2's
high-level `CopilotChat` and approximates the look of Vercel's `ai-elements` by skinning
CopilotKit's internal DOM with ~300 lines of brittle selectors in `globals.css`
(`.agent-chat-shell [data-testid=...]`, `.cpk\:prose`, the `ai-elements-*` class hooks). This
is fragile (breaks on CopilotKit updates), can't fully express the desired aesthetic, and the
chat/artifact surfaces feel inconsistent across `travel`, `grocery`, `fitness`, `wellness`,
`a2ui`.

**Goals**

1. Replace the skinned `CopilotChat` with a **fully headless** chat built on `useAgent` +
   `useCopilotKit`, owning all rendering. Delete the DOM-skinning CSS.
2. A distinctive **"agent console"** aesthetic (operator-grade, mono metadata, structured
   tool/event cards) on the existing brand tokens, replicating the **structure** of Vercel's
   chatbot demo (full-bleed layout, centered conversation, slide-in artifact panel with
   fullscreen) — not its neutral palette.
3. A **first-class, expandable artifact panel** (closed / split / fullscreen) backed by
   **ADK-native artifacts** (versioning owned by ADK), shared across all agents.
4. Consistency: chat + artifact surfaces share one visual language across every page.

**Non-goals**

- Mobile (`apps/mobile`) — out of scope for this spec (the AG-UI data contract changes are
  reusable later).
- Changing agent reasoning/planning behavior.
- New agent capabilities beyond artifact emission.

## 2. Decisions (resolved during brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| Fidelity | How closely to match Vercel | **Vercel structure, bolder brand** |
| Aesthetic | Personality | **Agent console / utilitarian** |
| Architecture | Chat rendering | **Fully headless** (`useAgent`/`useCopilotKit`, no `CopilotChat`) |
| Layout | Full-screen | Slim left icon rail **replaces** per-page HeroHeader on agent pages |
| Artifact panel | States | **closed / split (~48%, resizable) / fullscreen** |
| Artifact model | Storage | **ADK-native artifacts** (`save_artifact`/`load_artifact`), versioning by ADK |
| Artifact store | Backing | **Custom `SqlAlchemyArtifactService`** over the existing DB (Postgres prod / SQLite-libSQL dev), mirroring `session_service.py` |
| Versions | History | **Handled by ADK** (auto-increment); UI restore = load prior version + re-save |
| Features | In scope | Rich tool cards, reasoning block, message actions, rich prompt input |
| Delivery | Spec shape | **One comprehensive spec**, ordered internal milestones |

## 3. Key technical findings (research)

- CopilotKit v2 ships headless primitives: `useAgent` (`agent.messages`, `agent.isRunning`,
  `agent.addMessage`, `agent.setState`, `agent.abortRun`), `useCopilotKit`
  (`copilotkit.runAgent`, `copilotkit.stopAgent`), `useRenderToolCall()` (resolver for custom
  message lists), `useRenderTool`/`useDefaultRenderTool` (registration), `useAttachments`,
  `useConfigureSuggestions`, `useHumanInTheLoop`.
- Tool-call `status` is camelCase: `'inProgress' | 'executing' | 'complete'`; `parameters` is
  `Partial<T>` during `inProgress`.
- AG-UI has **first-class `REASONING_*` events** (`REASONING_START` /
  `REASONING_MESSAGE_CONTENT` / `REASONING_END`); the bridge maps legacy `THINKING_*` → these.
- **AG-UI does NOT bridge ADK `artifact_delta` to the client.** ADK artifacts live server-side
  in an `ArtifactService`, referenced only by version number. CopilotKit's ADK integration
  bridges **shared state** (with predictive/streaming state) and reasoning — not artifacts.
  → Artifacts must be surfaced via a deliberate **state bridge + REST load endpoint**.
- ADK artifact API: `ctx.save_artifact(filename, types.Part(inline_data=Blob(data, mime_type)))`
  returns an `int` version (auto-increment from 0); `ctx.load_artifact(filename, version=None)`
  loads latest or a specific version; `service.list_versions(...)`, `ctx.list_artifacts()`.
  `"user:"`-prefixed filenames are user-scoped; bare names are session-scoped. Saving emits
  `event.actions.artifact_delta` ({filename: version}). ADK ships only `InMemory` and `GCS`
  services — a custom `BaseArtifactService` is required for a DB backing.
- Existing `packages/agent-common/src/agent_common/session_service.py` resolves the DB URL from
  `ADK_SESSION_DB_URL` (Postgres→asyncpg) / `TURSO_DATABASE_URL` (libSQL) / local SQLite file,
  via a `dependency_injector` container. The artifact service will reuse this resolution.

## 4. UX & aesthetic specification

Locked via interactive mockups (`.superpowers/brainstorm/.../chat-fullscreen-v2.html`).

**Layout (`WorkspaceShell`)** — full viewport, no page padding:
- **Left icon rail** (~54px): brand glyph, new-thread, history, trash, online status dot.
  Replaces `HeroHeader` on agent pages.
- **Center conversation**: centered reading column (~720px) inside a full-height flex column;
  sticky composer at the bottom.
- **Right artifact panel**: width-animated; `closed` (0) / `split` (~48%, drag-resizable) /
  `fullscreen` (100%, hides chat + rail). Panel state persisted per agent (DB-backed user pref
  or localStorage — see §7).

**Conversation**:
- User → right-aligned soft bubble (`--bg-soft`, asymmetric radius).
- Assistant → ✦ glyph + flowing markdown via `streamdown`; blinking streaming cursor.
- **Reasoning** → "Thought for Xs" pill (collapsible), italic muted body; renders only when
  `REASONING_*` content is present.
- **Tool/event card** → mono tool name, status dot + badge (`drafting`/`running`/`done`),
  key/value body, result chips; states driven by `inProgress`/`executing`/`complete`.
- **Message actions** (hover) → copy, retry, thumbs up/down; code blocks get copy.
- **Human-in-the-loop** → existing `request_user_approval` renders as an inline approval card in
  the stream (replaces the current `interrupts` slot).

**Composer (`PromptInput`)**: auto-grow textarea, attach button (`useAttachments`), agent/model
label, suggestion pills (`useConfigureSuggestions`), round send button that becomes **Stop**
while running.

**Artifact panel**: header (kind icon, title, `name · vN · status`), `⤢` fullscreen toggle,
`✕` close; right tools rail (fullscreen, run/preview where applicable, undo, redo, copy,
versions). **Inline artifact preview card** in the conversation (title + content peek + `⤢`)
opens/expands the panel.

**Brand**: existing tokens (`--bg`, `--surface`, `--accent`, per-agent `--travel`/`--grocery`/…),
Schibsted Grotesk body + JetBrains Mono metadata, light + dark. No new color system.

## 5. Frontend architecture (fully headless)

New directory `apps/web/src/components/chat/` (shadcn-style, reusing `components/ui/*`):

| Component | Responsibility | Key hooks/libs |
|-----------|----------------|----------------|
| `WorkspaceShell` | Full-screen layout, left rail, artifact panel state machine (closed/split/fullscreen), resize, persistence | — |
| `Conversation` | Scroll container, **autoscroll/pin-to-bottom** (pin unless user scrolled up; scroll on send), scroll-to-bottom button | `useAgent({updates:[OnMessagesChanged,OnRunStatusChanged]})` |
| `Message` | User vs assistant row chrome, glyph, timestamp | — |
| `Response` | Assistant markdown stream + streaming cursor | `streamdown` |
| `Reasoning` | Collapsible reasoning block | reasoning message parts |
| `ToolEvent` | Resolve + render a tool call in the custom list | `useRenderToolCall()` + registered `useRenderTool`/`useDefaultRenderTool` |
| `MessageActions` | copy / retry / vote | `agent` (retry = re-run) |
| `PromptInput` | textarea, attach, suggestions, send/stop | `useAttachments`, `useConfigureSuggestions`, `runAgent`/`stopAgent` |
| `ArtifactPanel` | header + tools rail + content renderers by `kind` | artifact state + `/api/.../artifacts` |
| `ArtifactCard` | inline preview that opens the panel | — |

- **Delete**: the `ai-elements-*` class hooks and `AGENT_CHAT_SLOT_CLASSES` in
  `agent-workspace.tsx`, and the ~300 lines of `.agent-chat-shell [data-testid…]` /
  `.copilotKit*` CSS in `globals.css` (§264–567). Keep the token/`@theme` blocks and
  `streamdown/styles.css`.
- `agent-workspace.tsx` is replaced by `WorkspaceShell` + the chat library. The per-page files
  (`app/travel/page.tsx`, etc.) keep their `CopilotKit` provider, `useAgent`, `useFrontendTool`,
  `useConfigureSuggestions` wiring and pass page-specific artifact renderers into the shell.
- We hand-build (cost of going headless): autoscroll, streaming cursor, input keyboard handling
  (Enter send / Shift-Enter newline), stop button.
- Tool renderers: register per-tool with `useRenderTool` (e.g. `write_itinerary`,
  `set_shopping_list`, `search_flights`) + `useDefaultRenderTool` fallback; the custom
  `ToolEvent` list resolves them via `useRenderToolCall()`.

## 6. Artifact architecture (ADK-native + state bridge)

Three coordinated layers:

### 6a. Durable, versioned store — ADK artifacts over the DB
- New `packages/agent-common/src/agent_common/artifact_service.py`:
  `SqlAlchemyArtifactService(BaseArtifactService)` implementing `save_artifact`,
  `load_artifact`, `list_artifact_keys`, `delete_artifact`, `list_versions`. Rows:
  `(app_name, user_id, session_id, filename, version, mime_type, data BLOB, created_at)`;
  user-scoped (`user:` prefix) rows store `session_id = "*"`. Version = `max(version)+1` per key.
- New `create_artifact_service()` factory + container reusing `session_service.py`'s
  `_database_url` / `_database_kwargs` (Postgres / libSQL / local SQLite). Local fallback: a
  SQLite file alongside `adk_sessions.sqlite`.
- Each agent `main.py` replaces `InMemoryArtifactService()` with `create_artifact_service()`.

### 6b. Authoring helper — `agent_common.artifacts.write_artifact`
- New `packages/agent-common/src/agent_common/artifacts.py`:
  `write_artifact(tool_context, name, content, kind, title=None) -> ArtifactRefDict`.
  It (1) `tool_context.save_artifact(name, types.Part(inline_data=Blob(content.encode(),
  mime_type_for(kind))))` → version int; (2) mirrors a ref + the live content into shared state:
  `tool_context.state["artifact"] = {name, title, kind, mime_type, version, status}` and
  `tool_context.state["artifact_content"] = content`.
- Agents migrate document writes to it: travel `write_itinerary`, grocery `set_shopping_list`,
  fitness plan, wellness `set_weekly_wellness_plan`, etc. Existing typed state fields
  (`itinerary`, `shopping_list`, …) are kept for rich page-specific panels; the `artifact` ref is
  the canonical handle the shared panel uses.
- Streaming: register the content field with `PredictStateMapping` so the panel updates
  token-by-token while the tool runs (matches today's live behavior).

### 6c. Client transport — REST load endpoint + web proxy
- Each agent FastAPI app gains artifact routes beside the AG-UI endpoint:
  `GET /artifacts` → `[{name, kind, versions:[…], latest}]`;
  `GET /artifacts/{name}?version=` → bytes (+ `Content-Type` from mime). Backed by the same
  `ArtifactService` instance; scoped by the AG-UI session/user identity already established for
  the request.
- `apps/web` proxy: `app/api/agents/artifacts/[...]/route.ts` (Clerk-authenticated, mirrors the
  existing `api/mcp/token` / `api/strava/token` pattern) forwards to the right agent service.
- Frontend: `ArtifactPanel` reads the **current** content from `agent.state.artifact_content`
  (live stream); the **version dropdown / restore** fetches historical bytes from the proxy.
  Restore = load v(n-1) → `write_artifact` again (new version) since ADK has no in-place revert.

### 6d. Shared types (`packages/types/src/index.ts`)
```ts
export type ArtifactKind = "markdown" | "document" | "list" | "code" | "plan";
export type ArtifactStatus = "drafting" | "ready" | "stale";
export type ArtifactRef = {
  name: string; title?: string; kind: ArtifactKind;
  mime_type: string; version: number; status: ArtifactStatus;
};
```
Each agent state type gains `artifact?: ArtifactRef` and `artifact_content?: string`.

## 7. Persistence of UI prefs
Artifact panel state (open/split/fullscreen, width) persists per agent. Default: localStorage
(simple, no contract change). Optional later: a user-pref row in the DB. **Decision: localStorage
for this spec.**

## 8. Error handling & edge cases
- **Stop mid-stream** (`abortRun`/`stopAgent`): partial assistant message preserved; artifact
  `status = "drafting"`; no version saved for the partial.
- **Artifact load failure**: panel shows an inline error with retry; inline card still renders
  last-known `artifact_content` from state.
- **No reasoning emitted**: `Reasoning` renders nothing (no empty pill).
- **Human-in-the-loop**: `useHumanInTheLoop` synthesized handler MUST call `respond(...)` on all
  paths (incl. reject / unmount) or the run hangs — approval card enforces this.
- **DB unavailable**: `save_artifact` failure is caught; tool still writes content to state so the
  live panel works; surfaced via `provider_health`-style status. Artifact endpoints degrade to
  state-only.
- **Two surfaces, same `(agentId, threadId)`**: avoid duplicate `useAgent` consumers (known
  WeakMap-clone footgun) — one chat instance per page.

## 9. Testing
- **Frontend (vitest + react-test-renderer):** `Message` (user/assistant), `ToolEvent` across
  `inProgress`/`executing`/`complete` + `Partial` params, `Reasoning` present/absent,
  `Conversation` autoscroll/pin logic, `PromptInput` send/stop, `ArtifactPanel` state machine +
  load-error, `ArtifactCard` open. Update `agent-workspace.contract.test.tsx` →
  `workspace-shell.contract.test.tsx`. Keep `all-source-smoke.test.tsx` green.
- **Python (pytest):** `SqlAlchemyArtifactService` save/load/list/versions (incl. `user:` scope)
  against in-memory SQLite; `write_artifact` saves + mirrors state + returns ref; artifact REST
  endpoints (list/load/version/404). Update per-agent tool tests that assert state shape to
  include the `artifact` ref.
- `pnpm check` (oxlint + ruff) clean.

## 10. Milestones (ordered, single spec)
1. **Chat foundation** — `components/chat/` headless library + `WorkspaceShell`; wire `travel`;
   delete skinning CSS. Artifact panel reads existing travel state (no Python yet). Ships the
   visual + interaction win and removes brittleness.
2. **Artifact contract (Python)** — `SqlAlchemyArtifactService` + `create_artifact_service`;
   `write_artifact` helper; `ArtifactRef` types; migrate travel; artifact REST endpoints; web
   proxy. Fullscreen + version history become real on travel.
3. **Rollout** — `grocery`, `fitness`, `wellness`, `a2ui` adopt headless chat (near-free via the
   shared shell) + `write_artifact`; per-kind artifact renderers (list, plan, markdown, code).
4. **Polish & tests** — message actions, suggestions, attachments, dark-mode pass, full test
   suite, `pnpm check`.

## 11. Files affected (indicative)
- **New:** `apps/web/src/components/chat/*`, `apps/web/src/components/workspace-shell.tsx`,
  `apps/web/src/app/api/agents/artifacts/[...]/route.ts`,
  `packages/agent-common/src/agent_common/artifact_service.py`,
  `packages/agent-common/src/agent_common/artifacts.py`.
- **Changed:** `apps/web/src/app/globals.css` (remove skinning), `app/{travel,grocery,fitness,
  wellness,a2ui}/page.tsx`, `components/document-canvas.tsx` (→ markdown artifact renderer),
  `packages/types/src/index.ts`, every `agents/*/src/*/main.py` (artifact service + write_artifact),
  agent tool tests.
- **Removed:** `apps/web/src/components/agent-workspace.tsx` (replaced by `WorkspaceShell`).

## 12. Open risks
- ADK reasoning over AG-UI: confirm Gemini "thinking" surfaces as `REASONING_*` through the
  `ag-ui-adk` bridge; if not, the reasoning block stays dormant until the agent emits it.
- `useAttachments` end-to-end with ADK (upload target) — verify before promising the attach
  button; otherwise ship as visual-disabled.
- Resizable split + fullscreen transitions must not thrash the streaming `streamdown` render —
  test with an active stream.
