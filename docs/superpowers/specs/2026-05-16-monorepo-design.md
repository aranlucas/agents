# Monorepo Transformation Design

**Date:** 2026-05-16  
**Status:** Approved

## Overview

Transform the current flat Next.js + single Python ADK agent repo into a pnpm workspace monorepo that hosts multiple ADK agents (travel, grocery) and multiple frontends (Next.js web, React Native mobile via Expo).

---

## Repository Structure

```
/
├── apps/
│   ├── web/                     # Next.js — moved from root
│   │   ├── src/
│   │   ├── public/
│   │   ├── next.config.ts
│   │   ├── tsconfig.json
│   │   ├── instrumentation.ts
│   │   ├── vercel.json          # tells Vercel root dir is apps/web
│   │   └── package.json
│   └── mobile/                  # Expo Router universal app
│       ├── src/
│       │   ├── app/             # Expo Router screens (travel, grocery)
│       │   └── components/
│       ├── app.json
│       ├── eas.json             # EAS Build config for App Store
│       ├── metro.config.js
│       ├── tsconfig.json
│       └── package.json         # pnpm (converted from bun)
│
├── agents/
│   ├── travel/                  # Moved from agent/ — trvl MCP toolset
│   │   ├── main.py
│   │   ├── utils.py
│   │   ├── pyproject.toml
│   │   ├── Dockerfile
│   │   ├── railway.json
│   │   └── tests/
│   └── grocery/                 # New — Kroger MCP toolset
│       ├── main.py
│       ├── pyproject.toml
│       ├── Dockerfile
│       ├── railway.json
│       └── tests/
│
├── packages/
│   └── types/                   # Shared TypeScript types
│       ├── src/
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── package.json                 # pnpm workspace root
├── pnpm-workspace.yaml          # workspaces: ["apps/*", "packages/*"]
├── docker-compose.yml           # Local dev: travel + grocery agents together
├── .env.example
└── AGENTS.md
```

---

## Agents

Both agents follow the same pattern: an independent FastAPI service exposing an AG-UI endpoint via `ag-ui-adk`, A2A-compatible so they can call each other.

### Travel Agent (`agents/travel/`)

- **Source:** current `agent/` directory, renamed
- **Endpoint:** `POST /` (AG-UI), `GET /health`
- **Tools:** trvl MCP toolset, trip state tools (`set_trip_meta`, `write_itinerary`, `add_day`, `mark_ready_to_book`)
- **State:** `TripState` — `destination`, `start_date`, `end_date`, `travelers`, `budget_usd`, `headline`, `itinerary`, `summary`, `flights`, `status`
- **Model:** LiteLLM (Mistral)
- **Deploy:** Railway — Root Directory: `agents/travel/`, Dockerfile build

### Grocery Agent (`agents/grocery/`)

- **Source:** new, mirrors travel agent structure
- **Endpoint:** `POST /` (AG-UI), `GET /health`
- **Tools:** Kroger MCP toolset (`search_products`, `manage_shopping_list`, `manage_pantry`, `plan_meals`, `get_weekly_deals`, `add_to_cart`, etc.)
- **State:** `GroceryState` — `shopping_list`, `cart`, `pantry`, `meal_plan`, `weekly_deals`
- **Model:** LiteLLM (Mistral or Claude)
- **Deploy:** Railway — Root Directory: `agents/grocery/`, Dockerfile build

---

## Frontends

### Web (`apps/web/`)

- **Framework:** Next.js (current app, moved from root)
- **Routing:** `/travel` and `/grocery` — separate pages, each with its own agent-backed experience
- **Agent connection:** CopilotKit runtime API route (`src/app/api/copilotkit/`) proxies to Railway agent services. One runtime instance per agent, selected by route.
- **Deploy:** Vercel — auto-detects Next.js. `vercel.json` sets the project root to `apps/web/`.

### Mobile (`apps/mobile/`)

- **Framework:** Expo Router (bootstrapped from [EvanBacon/chat-template](https://github.com/EvanBacon/chat-template)) — universal: iOS, Android
- **Routing:** Expo Router screens for `/travel` and `/grocery`
- **Agent connection:** `@ag-ui/client` — connects directly to Railway agent services (no CopilotKit layer). AG-UI streaming over HTTP.
- **Styling:** Tailwind via Uniwind (from template)
- **Deploy:** EAS Build → App Store / Google Play

---

## Shared Types (`packages/types/`)

Consumed by both `apps/web` and `apps/mobile` via pnpm workspace reference (`"@agents/types": "workspace:*"`).

```ts
// Travel agent state
export type TripState = {
  destination: string
  start_date: string
  end_date: string
  travelers: number
  budget_usd: number
  headline: string
  itinerary: string
  summary: string
  flights: string
  status: 'drafting' | 'ready_to_book' | 'booked'
}

// Grocery agent state
export type GroceryState = {
  shopping_list: string[]
  cart: CartItem[]
  pantry: PantryItem[]
  meal_plan: string
  weekly_deals: string
}

export type CartItem = { name: string; quantity: number; price?: number }
export type PantryItem = { name: string; quantity: string; expires?: string }

// Shared user preferences (both agents read these)
export type Preferences = {
  travelerName: string
  homeAirport: string
  transportMode: 'flight' | 'road_trip'
  budgetTier: string
  vibe: string
  pace: string
  interests: string[]
}
```

---

## Data Flow

```
apps/web  ──CopilotKit runtime (API route)──▶  agents/travel   (Railway)
          ──CopilotKit runtime (API route)──▶  agents/grocery  (Railway)

apps/mobile ──@ag-ui/client──▶  agents/travel   (Railway, direct HTTP)
            ──@ag-ui/client──▶  agents/grocery  (Railway, direct HTTP)

agents/travel  ──trvl MCP──▶  trvl external service
agents/grocery ──Kroger MCP──▶  Kroger API

agents/travel  ◀──A2A──▶  agents/grocery  (optional cross-agent calls)
```

---

## Deployment

| Service | Platform | Config | Notes |
|---|---|---|---|
| `agents/travel/` | Railway | `Dockerfile` + `railway.json` | Root Dir: `agents/travel/` |
| `agents/grocery/` | Railway | `Dockerfile` + `railway.json` | Root Dir: `agents/grocery/` |
| `apps/web/` | Vercel | `vercel.json` | Auto Next.js detection |
| `apps/mobile/` | EAS Build | `eas.json` | iOS + Android |

`railway.json` per agent:
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "DOCKERFILE" },
  "deploy": { "healthcheckPath": "/health" }
}
```

---

## Local Development

`docker-compose.yml` runs both agents locally. The web app runs via `next dev`. Mobile runs via `expo start`.

```yaml
services:
  travel:
    build: ./agents/travel
    ports: ["8000:8000"]
    env_file: .env
  grocery:
    build: ./agents/grocery
    ports: ["8001:8001"]
    env_file: .env
```

Root `package.json` dev script:
```json
{
  "scripts": {
    "dev": "concurrently \"pnpm --filter web dev\" \"pnpm --filter mobile dev\" \"docker compose up\"",
    "dev:web": "pnpm --filter web dev",
    "dev:mobile": "pnpm --filter mobile start"
  }
}
```

---

## Migration Steps (High Level)

1. Set up pnpm workspace root (`package.json`, `pnpm-workspace.yaml`)
2. Move `src/`, `next.config.ts`, `tsconfig.json`, `instrumentation.ts`, `public/` → `apps/web/`
3. Move `agent/` → `agents/travel/`, add `railway.json`
4. Bootstrap `apps/mobile/` from EvanBacon/chat-template, convert bun → pnpm
5. Create `packages/types/` with shared state types
6. Scaffold `agents/grocery/` mirroring travel agent structure, wire Kroger MCP
7. Add `vercel.json` to `apps/web/`, update Vercel project root setting
8. Add `docker-compose.yml` at root for local dev
9. Update all import paths and env var references

---

## Open Questions

- **@ag-ui/client in React Native:** needs validation that AG-UI streaming works in Expo's JS runtime. May need a polyfill for `fetch` streaming or a custom EventSource adapter.
- **Kroger MCP integration in Python:** the Kroger MCP is currently a Claude.ai-connected MCP. The grocery ADK agent will need to call it via an MCP client (e.g., `google-adk` MCP toolset wrapper), similar to how `trvl_toolset()` wraps the trvl MCP in `agents/travel/utils.py`.
