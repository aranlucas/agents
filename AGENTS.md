# Repository Guide for Coding Agents

This repository is a CopilotKit × Google ADK collaboration showcase:
a **Trip Studio** workspace where a human and an LLM agent co-plan a
trip via shared state and a human-in-the-loop approval flow.

Read this before editing files — it captures the architectural choices
that aren't obvious from the code alone.

## Stack snapshot

* **Frontend.** Next.js 16 (App Router, Turbopack), React 19, Tailwind v4.
  CopilotKit v2 hooks: `useAgent`, `useFrontendTool`,
  `useConfigureSuggestions`, `CopilotChat`. State enters the agent via
  `agent.setState`; UI re-renders on `UseAgentUpdate.OnStateChanged`.
* **Runtime.** `@copilotkit/runtime/v2` mounted at
  `src/app/api/copilotkit`. Speaks AG-UI to a remote agent over HTTP.
* **Agent.** Google ADK `LlmAgent` in `agent/main.py`. Default model is
  Gemini 2.5 Flash via the ADK; an opt-in `USE_MISTRAL=1` path uses
  LiteLLM. Hosted behind FastAPI by
  `ag_ui_adk.add_adk_fastapi_endpoint`.

## Collaboration primitives

The whole point of this app is to demonstrate three patterns at once.
Don't break them when refactoring.

1. **Itinerary streaming (agent → UI).**
   The agent calls `write_itinerary(summary, body)`. The
   `COLLAB_PREDICT_STATE` mapping (`stream_tool_call=True`) makes the
   `body` argument stream into `state["itinerary"]` token-by-token.
   The `DocumentCanvas` re-renders day cards on every delta.

2. **Bidirectional shared state.**
   The operator can edit destination, headline, and the raw itinerary
   markdown in the canvas; each edit goes back via
   `agent.setState({ ...current, ... })`. The agent sees the new
   itinerary on its next turn.

3. **Traveler brief injection (UI → agent, per turn).**
   The `PreferencesPanel` writes to `state.preferences`. A
   `before_model_callback` in the ADK agent strips any stale
   `<<<TRAVELER_BRIEF>>>` block and prepends a fresh one to the
   system instruction every turn. Schema drift on `preferences` will
   silently drop fields — keep `_build_prefs_block` in lockstep with
   the TS `Preferences` interface.

4. **Human-in-the-loop approval.**
   The agent has no backend tool named `request_user_approval`; the
   frontend registers it via `useFrontendTool`. The handler opens
   `ApprovalDialog`, awaits the user, and resolves the Promise with
   `{ approved, note }`. The agent gets that object as the tool result
   and only proceeds when approved.

## Itinerary contract

The canvas parses the itinerary string into day cards. The agent
instruction enforces this format and the parser depends on it:

```
## Day N: <theme>
- HH:MM — activity
- HH:MM — activity
```

Free-form bullets without a time prefix still render, just without
the time chip. Drifting from `## Day N: theme` headings or losing the
em-dash will break parsing.

## Files & responsibilities

```
agent/main.py
  ├── _get_model()                    # Gemini default, Mistral opt-in
  ├── set_trip_meta / write_itinerary / add_day / mark_ready_to_book
  ├── _build_prefs_block / _inject_preferences
  ├── collab_trip_agent               # the LlmAgent
  ├── COLLAB_PREDICT_STATE            # token-streaming mapping (itinerary.body)
  └── FastAPI app at "/", /health

src/app/page.tsx
  ├── useAgent({ updates: OnStateChanged + OnRunStatusChanged })
  ├── useFrontendTool("request_user_approval")
  ├── useConfigureSuggestions(...)
  ├── observedOnce ref pattern (don't write preferences before reading state)
  └── 3-column layout (traveler-brief | canvas | chat) with mobile tab switcher

src/components/
  ├── document-canvas.tsx     # Trip header + day cards (markdown parser)
  ├── preferences-panel.tsx   # Traveler brief (UI → agent.state.preferences)
  ├── approval-dialog.tsx     # HITL modal
  ├── hero-header.tsx         # Status header
  └── providers.tsx           # <CopilotKit runtimeUrl="/api/copilotkit">

src/app/api/copilotkit/
  ├── route.ts                # CopilotRuntime + HttpAgent → AGENT_URL
  └── [...path]/route.ts      # re-export so multi-route mode works
```

## Conventions

* **Don't paste the itinerary into chat.** The instruction explicitly
  tells the model to ALWAYS use `write_itinerary` / `add_day` for
  plan content. Reverting this would break the streaming demo.
* **Initial-state guard.** UI mutations via `agent.setState` must only
  fire after we've observed `agent.state !== undefined` at least once
  (`observedOnce` ref). Otherwise we clobber server-side defaults
  with React's render-time initial values.
* **Status enum is the source of truth.** `DocStatus` =
  `idle | drafting | ready_to_book | booked`. Add new states in one
  place (`document-canvas.tsx`) and update `STATUS_META` + the agent's
  tools together.

## Build & run

```bash
npm install          # installs node deps + triggers `uv sync` in agent/
npm run dev          # UI on :3000, agent on :8000, concurrently
npm run build        # next build (run before submitting)
```

The `uv sync` step requires the `uv` binary on `PATH`. The script also
respects `UV_CACHE_DIR` for sandboxed environments.

## Acknowledgements

Inspiration and patterns are adapted from the
[CopilotKit `google-adk` showcase](https://github.com/CopilotKit/CopilotKit/tree/main/showcase/integrations/google-adk).
The key references are `shared_state_streaming_agent.py`,
`shared_state_read_write_agent.py`, `hitl_in_app_agent.py`, and
`beautiful_chat_agent.py`.
