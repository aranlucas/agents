# Agents Monorepo — CopilotKit x Google ADK

Seven collaborative AI agents served from a single gateway, sharing live state
with web and mobile UIs over the [AG-UI](https://docs.copilotkit.ai/ag-ui)
protocol. Built with [CopilotKit](https://copilotkit.ai) v2,
[Google ADK](https://google.github.io/adk-docs/), Next.js 16, and Expo.

| Agent       | What it does                                           | Access           |
| ----------- | ------------------------------------------------------ | ---------------- |
| travel      | Trip planning with a live shared itinerary (trvl MCP)  | Sign-in required |
| grocery     | Meal planning + shopping lists with live Kroger data   | Sign-in + Kroger |
| fitness     | Training plans from Strava activity                    | Sign-in + Strava |
| wellness    | Orchestrates grocery + fitness in-process              | Sign-in + both   |
| oral-boards | Pediatric dentistry mock oral-board exams with sources | Sign-in required |
| a2ui        | Renders declarative A2UI surfaces from chat            | Sign-in required |
| resume      | Public Q&A about Lucas's resume (no account needed)    | Public           |

## Architecture

```text
apps/web    -> CopilotKit runtime (/api/copilotkit) -> gateway /<agent>/agui
apps/mobile -> @ag-ui/client (HttpAgent)            -> gateway /<agent>/agui (direct)
wellness    -> AgentTool (in-process)               -> grocery + fitness sub-agents
```

- All agents run in one FastAPI process (`agents/gateway/` mounts each
  `agents/<name>/` app under a path prefix) — one Railway service.
- State (itineraries, shopping lists, plans) is written to ADK shared state by
  tools, never pasted into chat; the UI re-renders on every state delta.
- Auth is Clerk end to end: the web runtime mints a session JWT per request and
  the gateway verifies it against the Clerk JWKS (`agents-shared`'s
  `ClerkAuthMiddleware`), rewriting the identity header to the verified
  subject. The resume agent is intentionally unauthenticated.

## Getting started

Prerequisites: pnpm, Docker, [uv](https://docs.astral.sh/uv/), and API keys
per `.env.example`.

```bash
cp .env.example .env   # fill in Clerk + model provider keys
pnpm install           # JS deps + uv sync for Python
pnpm dev               # web on :3000 + the agents gateway on :8000
```

Other entry points: `pnpm dev:web`, `pnpm dev:mobile`, `pnpm dev:agents`.

## Quality checks

```bash
pnpm check     # oxlint + ruff + tailwind canon + oxfmt --check
pnpm test      # vitest (web, mobile) + pytest (agents, agents-shared)
pnpm coverage  # both ecosystems with coverage
```

CI (`.github/workflows/ci.yml`) gates lint, format, Python syntax, both test
suites with a coverage floor, the web build, and the agent Docker image.

## Layout, conventions, deployment

See [AGENTS.md](AGENTS.md) — repository guide (also loaded by coding agents),
including the "Adding a new agent" checklist and the Railway/Vercel/EAS
deployment table. Design docs live in `docs/superpowers/`; the forward-looking
roadmap is [docs/ROADMAP.md](docs/ROADMAP.md).

## Acknowledgements

The shared-state, streaming, and HITL patterns are adapted from the CopilotKit
[`google-adk` showcase](https://github.com/CopilotKit/CopilotKit/tree/main/showcase/integrations/google-adk).
