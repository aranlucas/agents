# Trip Studio — CopilotKit × Google ADK

A beautiful real-time trip-planning surface where a human and an AI agent
share the same itinerary, built on
[CopilotKit](https://copilotkit.ai) v2 + [Google ADK](https://google.github.io/adk-docs/)
via the [AG-UI](https://docs.copilotkit.ai/ag-ui) protocol.

Inspired by patterns from the
[CopilotKit `google-adk` showcase](https://github.com/CopilotKit/CopilotKit/tree/main/showcase/integrations/google-adk),
this app demonstrates three complementary collaboration primitives in a
single polished workspace.

## What's collaborative about it

* **Shared itinerary, agent → UI streaming.**
  The agent calls `write_itinerary(summary, body)`. A
  `PredictStateMapping` with `stream_tool_call=True` makes the
  itinerary body stream token-by-token into `state["itinerary"]`, and
  the trip canvas re-renders day-by-day as the agent types.

* **Shared itinerary, UI → agent.**
  The operator can edit the destination, headline, or raw markdown
  directly in the canvas. Each edit updates shared state via
  `agent.setState`, so the agent sees the changes on its next turn.

* **Traveler brief from UI to agent (per-turn injection).**
  The operator picks home airport, budget tier, vibe, pace, dietary,
  and mobility. The Python agent's `before_model_callback` strips any
  stale block and prepends a fresh `TRAVELER_BRIEF` block to the system
  instruction every turn, so the model adapts immediately.

* **Human-in-the-loop approval modal.**
  The agent calls the frontend tool `request_user_approval` (registered
  via `useFrontendTool`) before booking flights, reserving hotels, or
  sharing the trip. The UI opens an in-app modal outside the chat
  surface, waits for Approve / Reject, then resolves the pending tool
  Promise. The agent gets the decision as the tool result.

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
  main.py             # ADK LlmAgent + FastAPI mount + traveler-brief injection
src/
  app/
    page.tsx          # CollabStudio — wires preferences, canvas, chat, HITL
    layout.tsx        # Root layout with brand fonts
    api/copilotkit/   # AG-UI runtime route
  components/
    document-canvas.tsx     # Itinerary canvas: trip header + day cards
    preferences-panel.tsx   # Traveler brief: UI → agent shared-state form
    approval-dialog.tsx     # HITL modal opened by request_user_approval
    hero-header.tsx         # Status header
    providers.tsx           # <CopilotKit> root
```

## Itinerary format

The agent writes itineraries as markdown with strict structure so the
canvas can render rich day cards:

```
## Day 1: Arrival
- 14:00 — Land at HND, train to Shinjuku
- 17:00 — Check in, walk the neighborhood
- 19:30 — Tonkatsu at Maisen

## Day 2: Old town
- 09:00 — Asakusa + Senso-ji at opening
- 12:00 — Ramen on Kappabashi
- 15:00 — Tea + bookshop in Yanaka
```

The UI parses `## Day N: <theme>` and `- HH:MM — activity` lines and
falls back gracefully on free-form bullets.

## Try it

Once the dev server is up:

1. Open the app and fill the **Traveler brief** on the left
   (home airport, budget tier, vibe, pace, interests).
2. Use one of the suggestion pills, or ask the agent:
   *"Plan a 3-day weekend in Tokyo focused on food, late November."*
3. Watch the trip header and day cards stream in live.
4. Tweak the destination or a day directly in the canvas — the agent
   sees your edits on the next turn.
5. Ask: *"If the itinerary looks good, propose locking it in and ask
   for my approval."* The approval modal appears.

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
