# Repository Guide for Coding Agents

This is a **pnpm monorepo** hosting multiple Google ADK agents and the frontends that connect to them.

## Structure

```
apps/
  web/         Next.js 16 + CopilotKit AG-UI — multi-agent console
  mobile/      Expo Router (iOS/Android) — AG-UI client screens
  oral-boards/ Standalone oral-boards console app
agents/
  gateway/      Single FastAPI gateway — the only deployable Python server
  travel/       Python ADK agent — trip planning via trvl MCP
  grocery/      Python ADK agent — grocery/meal planning via Kroger MCP
  fitness/      Python ADK agent — Strava-backed training plans
  wellness/     Python ADK orchestrator — in-process grocery + fitness tools
  expense/      Python ADK agent — expense desk / approval workflow
  oralboards/   Python ADK agent — pediatric dentistry oral-board practice
  trends/       Python ADK agent — Google Trends analysis (A2UI surfaces)
  resume/       Public Python ADK agent — resume Q&A (no auth)
  research/     Python ADK agent — research report generation
  spreadsheet/  Python ADK agent — spreadsheet builder
  presentation/ Python ADK agent — slide deck builder
  shared/       Shared Python helpers — auth, session, gateway wiring, tool callbacks
packages/
  types/            Shared TypeScript types (@agents/types)
  ui/               Shared UI components (@agents/ui)
  typescript-config/ Shared TS compiler settings
  oxlint-config/    Shared Oxlint rules
```

## Running locally

**Prerequisites:** pnpm, Docker, uv (for Python agents outside Docker)

```bash
# Install JS dependencies
pnpm install

# Start web + the single agents gateway (Docker)
pnpm dev

# Web only (gateway must be running separately)
pnpm dev:web

# Mobile (Expo)
pnpm dev:mobile

# Single agents gateway only (via Docker)
pnpm dev:agents
```

The web app runs on `:3000`. The agents gateway runs on `:8000` and mounts each
agent at `/<agent>/agui` plus `/<agent>/health`.

## Quality checks

This repo uses the Oxc toolchain for JavaScript/TypeScript and Ruff for Python.

```bash
# Run all configured checks
pnpm check

# JS/TS linting with Oxlint (type-aware via oxlint-tsgolint)
pnpm lint

# Python linting with Ruff
pnpm lint:py

# Format all supported files with Oxfmt
pnpm fmt
```

Conventions:

- Use `oxlint` instead of ESLint. Keep `.oxlintrc.json` as the source of truth.
- Use `oxfmt` instead of Prettier. Tailwind class sorting is enabled, including `cn()` and `tw()` helper calls.
- Use Ruff for Python linting. The root `pyproject.toml` owns the shared Ruff rule set.
- `react/react-in-jsx-scope` stays off because the web and mobile apps use the React 17+ automatic JSX runtime.
- Treat Oxlint warnings as follow-up cleanup unless the checker exits non-zero.

## Adding a new agent

1. `mkdir agents/<name>` and copy the structure from `agents/travel/` (or `agents/grocery/`)
2. Implement `agents/<name>/src/<name>_agent/main.py` — follow the pattern:
   - `_setup_otel()` → `LlmAgent` → `ADKAgent` → FastAPI with `add_adk_fastapi_endpoint`
   - `GET /health` endpoint required for gateway health aggregation
   - no standalone `uvicorn.run(...)` entrypoint; the gateway is the only server entrypoint
3. Add any new Python third-party dependencies to the root `pyproject.toml`; do not add per-agent `pyproject.toml` files
4. Add the new package to `[tool.hatch.build.targets.wheel].packages` in the root `pyproject.toml`, then run `uv sync` so it installs (this is what makes `agents/<name>/src/<name>_agent` importable everywhere)
5. Mount the app in `agents/gateway/src/gateway/main.py`
6. Register the agent in `apps/web/src/components/chat/agents/registry.ts` (set `id` and `backendPath`) — the CopilotKit runtime and health-proxy routes derive their agent maps from the registry, so there is nothing to edit in the API routes
7. Add a mobile screen/config if the agent should be available in `apps/mobile`
8. Add state types to `packages/types/src/index.ts` when the agent exposes typed shared state

## Deployment

| Surface        | Platform       | Config                                                                                                                                                                           |
| -------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agents gateway | Railway        | Docker (`agents/Dockerfile`) with repo root as build context; `railway.toml` sets `builder = "DOCKERFILE"` and `dockerfilePath`; `startCommand` runs `uvicorn gateway.main:app` |
| `apps/web/`    | Vercel         | `vercel.json` — set Root Dir to `apps/web/` in Vercel dashboard; `AGENTS_BASE_URL` points at the gateway                                                                        |
| `apps/mobile/` | EAS Build      | `apps/mobile/eas.json` → App Store / Google Play; `EXPO_PUBLIC_AGENTS_BASE_URL` points at the gateway                                                                           |
| Android APK    | GitHub Actions | `.github/workflows/android-apk.yml` — `expo prebuild` + Gradle, publishes the APK to a GitHub Release via `gh` (push a `v*` tag or run manually)                                |

## Architecture

**Web data flow:**

```
apps/web → CopilotKit runtime (Next.js API route) → HttpAgent → Railway agents gateway
```

**Mobile data flow:**

```
apps/mobile → @ag-ui/client (HttpAgent) → Railway agents gateway (direct HTTP)
```

**Auth:** Clerk — `@clerk/nextjs` on web, `@clerk/clerk-expo` on mobile. Protected routes are enforced in the web proxy/runtime and, when `CLERK_JWKS_URL` is configured, by `ClerkAuthMiddleware` on the gateway. The `resume` agent is intentionally public.

**Agent pattern:**

- Each agent owns a mountable FastAPI sub-app exposing AG-UI via `ag-ui-adk`
- The gateway is the only deployable Python web service
- Cross-agent orchestration is in-process via ADK tools, not remote A2A
- State is written to ADK shared state; the UI re-renders on every delta
- Token-level streaming via `PredictStateMapping` for long-form content

## Conventions

- **Never import from non-v2 paths** in web — all CopilotKit hooks from `@copilotkit/react-core/v2`
- **Never paste agent output into chat** — write to state via tools (`write_itinerary`, `set_shopping_list`, etc.)
- **State is the source of truth** — the UI reads from `agent.state`, not chat messages
