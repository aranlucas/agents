# Wellness Connect Gate

**Date:** 2026-05-26
**Status:** Approved

## Problem

The Wellness page delegates to both the Grocery agent (Kroger) and the Fitness agent (Strava). Without those OAuth connections the sub-agents can't access the required data, but the current page shows no gate — it just renders the empty dashboard with no guidance.

## Solution

A sequential connect gate modelled on the existing `KrogerAuthGate` (grocery page) and `StravaGate` (fitness page). The gate shows one pending connection at a time with a step indicator. Already-connected services are skipped. Once both services are linked the main Wellness UI renders as normal.

## Scope

- `packages/types/src/index.ts` — extend `WellnessState`
- `apps/web/src/app/wellness/page.tsx` — add gate component + connection syncing

No changes to the Python agent or token endpoints (reuses `/api/mcp/token` and `/api/strava/token`).

## Design

### 1. Types

Add to `WellnessState` in `packages/types/src/index.ts`:

```ts
kroger_connected?: boolean
strava_connected?: boolean
```

### 2. Connection syncing (mirrors fitness/grocery pattern)

In `WellnessPageInner`:

- `useUser` + `useReverification` from `@clerk/nextjs` for OAuth
- `useAuthConnection({ endpoint: "/api/mcp/token", ... })` → `krogerConnection`
- `useAuthConnection({ endpoint: "/api/strava/token", ... })` → `stravaConnection`
- Two `useEffect`s (one per service) sync `connected` into `agent.state` when the value differs from the current state field — same pattern as `fitness/page.tsx:151-161` and `grocery/page.tsx:170-180`
- OAuth strategies: `oauth_custom_shopping` (Kroger), `oauth_custom_strava` (Strava) — same as the individual pages

### 3. `WellnessConnectGate` component

```
pendingSteps = STEPS.filter(s => !state[s.connectedKey])
```

Where `STEPS` is an ordered array:

```ts
[
  { id: 'kroger', label: 'Kroger', connectedKey: 'kroger_connected', ... },
  { id: 'strava', label: 'Strava', connectedKey: 'strava_connected', ... },
]
```

**Rendering logic:**

- `pendingSteps.length === 0` → render main wellness UI (no gate)
- Otherwise render `<WellnessConnectGate>` with:
  - The full `STEPS` list for the step indicator (completed = green checkmark, current = wellness accent, future = dimmed)
  - The first item in `pendingSteps` as the active step (icon, heading, description, connect button)
  - Connect button calls the appropriate `connectKroger()` / `connectStrava()` handler
  - Loading state driven by `connectingId: 'kroger' | 'strava' | null` (single state, set to the active service's id during OAuth redirect, cleared on error)

**Step indicator layout:** horizontal row — each step shows a numbered circle + label, connected steps show `✓` in green, steps linked by a horizontal line (green if completed, muted if not yet reached).

**Gate body:** centred, full remaining height — matches the existing `KrogerAuthGate` / `StravaGate` layout:

- Service icon in a rounded square
- Heading: "Connect {Service}"
- One-sentence description explaining why wellness needs it
- Primary button
- Small redirect disclaimer

### 4. Smart-skip behaviour

Connection status is read from `agent.state.kroger_connected` / `agent.state.strava_connected`, which are set by the `useEffect` sync as soon as `useAuthConnection` resolves. If a user has already connected Kroger via the Grocery page, `krogerConnection.data.connected` will be `true` on mount, the sync fires immediately, and Kroger is absent from `pendingSteps` — the gate opens directly on the Strava step (step 2 of 2, with Kroger shown as completed).

## Files Changed

| File                                 | Change                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `packages/types/src/index.ts`        | Add `kroger_connected`, `strava_connected` to `WellnessState`                                          |
| `apps/web/src/app/wellness/page.tsx` | Add imports, connection hooks, state sync effects, `WellnessConnectGate` component, conditional render |

## Out of Scope

- Changes to the Python wellness agent
- Changes to token API endpoints
- Mobile app (`apps/mobile`) — separate task if needed
