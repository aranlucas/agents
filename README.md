# Collab Studio — CopilotKit × Google ADK

A beautiful real-time collaboration surface for humans and AI agents, built on
[CopilotKit](https://copilotkit.ai) v2 + [Google ADK](https://google.github.io/adk-docs/)
via the [AG-UI](https://docs.copilotkit.ai/ag-ui) protocol.

Inspired by the patterns from the
[CopilotKit `google-adk` showcase](https://github.com/CopilotKit/CopilotKit/tree/main/showcase/integrations/google-adk),
this app demonstrates three complementary collaboration primitives in a
single polished workspace.

## What's collaborative about it

* **Shared document state, agent → UI streaming.**
  The agent calls `write_document(title, content)`. A `PredictStateMapping`
  with `stream_tool_call=True` makes the document body stream token-by-token
  into `state["document"]`, and the canvas renders it live.

* **Shared document state, UI → agent.**
  The operator can type directly in the canvas. Each keystroke updates
  shared state via `agent.setState`, so the agent sees the operator's
  edits on its next turn.

* **Preferences from UI to agent (per-turn injection).**
  The operator picks tone / audience / length / focus. The Python agent's
  `before_model_callback` strips any stale block and prepends a fresh
  `USER_PREFERENCES` block to the system instruction every turn, so the
  model adapts immediately.

* **Human-in-the-loop approval modal.**
  The agent calls the frontend tool `request_user_approval` (registered via
  `useFrontendTool`) before any destructive or public action. The UI opens
  an in-app modal outside the chat surface, waits for Approve / Reject,
  then resolves the pending tool Promise. The agent gets the decision as
  the tool result.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | Next.js 16, React 19, Tailwind v4, CopilotKit `react-core/v2` + `react-ui/v2` |
| Runtime  | CopilotKit Runtime v2 (Next.js route handler at `/api/copilotkit`) |
| Protocol | AG-UI (HttpAgent) |
| Agent    | Google ADK `LlmAgent`, Gemini 2.5 Flash (default) or Mistral via LiteLLM |

## Prerequisites

* Node.js 18+
* Python 3.12+
* Either a Google API key for Gemini, or Mistral (toggle via env)
* `uv` (the script will use it; install via `pipx install uv` or `brew install uv`)

## Getting started

```bash
npm install        # installs node deps and triggers `uv sync` for the agent
export GOOGLE_API_KEY=...    # or set USE_MISTRAL=1 and MISTRAL_API_KEY=...
npm run dev
```

`npm run dev` launches the Next.js UI on `http://localhost:3000` and the
ADK agent server on `http://localhost:8000` concurrently. The
`/api/copilotkit` route proxies AG-UI requests through to the agent.

## Project layout

```
agent/
  main.py             # ADK LlmAgent + FastAPI mount + state injection
src/
  app/
    page.tsx          # CollabStudio — wires everything together
    layout.tsx        # Root layout with brand fonts
    api/copilotkit/   # AG-UI runtime route
  components/
    document-canvas.tsx     # Editable, streaming document surface
    preferences-panel.tsx   # UI → Agent shared-state form
    approval-dialog.tsx     # HITL modal opened by request_user_approval
    hero-header.tsx         # Status header
    providers.tsx           # <CopilotKit> root
```

## Try it

Once the dev server is up:

1. Open the app and adjust the **Writing brief** on the left.
2. Use one of the suggestion pills, or ask the agent:
   *"Draft a 3-paragraph announcement for our new collaborative editor."*
3. Watch the document stream into the canvas live.
4. Edit a sentence directly in the canvas — the agent sees your edits next
   turn.
5. Ask: *"If the draft looks good, propose publishing it and ask for my
   approval."* You'll see the approval modal appear.

## Scripts

* `dev` — UI + agent together
* `dev:ui` — Next.js only (`next dev --turbopack`)
* `dev:agent` — ADK agent server only (`uv run main.py`)
* `build` — production Next.js build
* `install:agent` — sets up the Python venv via `uv sync`

## Acknowledgements

The shared-state, streaming, beautiful-chat, and HITL patterns are direct
adaptations of the CopilotKit
[`google-adk` showcase agents](https://github.com/CopilotKit/CopilotKit/tree/main/showcase/integrations/google-adk/src/agents).
