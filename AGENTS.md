# Repository Guide for Coding Agents

This is a **pnpm monorepo** hosting multiple Google ADK agents and the frontends that connect to them.

## Structure

```
apps/
  web/      Next.js 16 + CopilotKit AG-UI — /travel and /grocery pages
  mobile/   Expo Router (iOS/Android) — travel and grocery tabs via @ag-ui/client
agents/
  travel/   Python ADK agent — trip planning via trvl MCP
  grocery/  Python ADK agent — grocery/meal planning via Kroger MCP
packages/
  agent-common/ Shared Python helpers for ADK session, A2A, and tool callbacks
  types/    Shared TypeScript types (TripState, GroceryState, Preferences)
```

## Running locally

**Prerequisites:** pnpm, Docker, uv (for Python agents outside Docker)

```bash
# Install JS dependencies
pnpm install

# Start web + both agents (Docker)
pnpm dev

# Web only (agents must be running separately)
pnpm dev:web

# Mobile (Expo)
pnpm dev:mobile

# Agents only (via Docker)
pnpm dev:agents
```

The web app runs on :3000. Travel agent on :8000. Grocery agent on :8001.

## Adding a new agent

1. `mkdir agents/<name>` and copy the structure from `agents/travel/` (or `agents/grocery/`)
2. Update `agents/<name>/pyproject.toml` — set `name = "<name>-agent"`
3. Implement `agents/<name>/main.py` — follow the pattern:
   - `_setup_otel()` → `LlmAgent` → `ADKAgent` → FastAPI with `add_adk_fastapi_endpoint`
   - `GET /health` endpoint required for Railway health checks
4. Add `agents/<name>/railway.json` pointing at the root `Dockerfile.agents`
5. Add a service to `docker-compose.yml` at the repo root
6. Register the agent in `apps/web/src/app/api/copilotkit/route.ts`
7. Add a page at `apps/web/src/app/<name>/page.tsx`
8. Add a screen at `apps/mobile/src/app/<name>.tsx`
9. Add state types to `packages/types/src/index.ts`

## Deployment

| Surface        | Platform  | Config                                                                                                        |
| -------------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| Python agents  | Railway   | `Dockerfile.agents` + `agents/<name>/railway.json` — set Root Dir to repo root, set `AGENT_DIR=agents/<name>` |
| `apps/web/`    | Vercel    | vercel.json — set Root Dir to `apps/web/` in Vercel dashboard                                                 |
| `apps/mobile/` | EAS Build | eas.json → App Store / Google Play                                                                            |

## Architecture

**Web data flow:**

```
apps/web → CopilotKit runtime (Next.js API route) → HttpAgent → Railway agent service
```

**Mobile data flow:**

```
apps/mobile → @ag-ui/client (HttpAgent) → Railway agent service (direct HTTP)
```

**Auth:** Clerk — `@clerk/nextjs` on web, `@clerk/clerk-expo` on mobile. Protected routes: `/travel`, `/grocery`. Configure at [clerk.com](https://clerk.com).

**Agent pattern:**

- Each agent is a FastAPI service exposing an AG-UI endpoint via `ag-ui-adk`
- A2A-compatible — agents can call each other via the A2A protocol
- State is written to ADK shared state; the UI re-renders on every delta
- Token-level streaming via `PredictStateMapping` for long-form content

## Conventions

- **Never import from non-v2 paths** in web — all CopilotKit hooks from `@copilotkit/react-core/v2`
- **Never paste agent output into chat** — write to state via tools (`write_itinerary`, `set_shopping_list`, etc.)
- **State is the source of truth** — the UI reads from `agent.state`, not chat messages
