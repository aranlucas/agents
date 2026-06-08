# Account Settings & Connection-Gated Agents

**Date:** 2026-06-08
**Status:** Approved

## Problem

The console (`/console/[agent]`) lets users chat with agents that depend on
external OAuth connections — Grocery needs Kroger, Fitness needs Strava, Wellness
needs both. The token plumbing exists (server-side helpers, `/api/strava/token`
and `/api/mcp/token` status endpoints, the `useAuthConnection` hook), but nothing
consumes it: there is no place for a user to link their accounts, and the chat
lets users talk to an agent that has no chance of succeeding because its provider
is unlinked.

This adds (1) a user settings page reachable from the sidebar where accounts are
linked via Clerk, and (2) a gate that disables an agent's chat input until its
required providers are connected, pointing the user to settings.

## Scope

- `apps/web/src/lib/connections.ts` — **new.** Provider catalog + `missingProviders` helper.
- `apps/web/src/lib/connections.test.ts` — **new.** Unit tests for `missingProviders`.
- `apps/web/src/components/chat/agents/registry.ts` — add `requires?: ProviderId[]` per agent.
- `apps/web/src/hooks/use-required-connections.ts` — **new.** Compose connection queries for an agent.
- `apps/web/src/components/chat/ChatSurface.tsx` — gate the prompt input when providers are missing.
- `apps/web/src/components/chat/NavRail.tsx` — add a settings (gear) link + active state.
- `apps/web/src/app/console/settings/page.tsx` — **new.** Settings route hosting Clerk `<UserProfile>`.
- Tests: registry requirement assertions, `ChatSurface` gating behavior.

Out of scope: changes to the Python agents, the token endpoints, the mobile app,
and the deprecated `/wellness` `WellnessConnectGate` (superseded by this console gate).

## Design

### 1. Provider catalog & gating model (`src/lib/connections.ts`)

The single source of truth for the two providers and a pure helper for deriving
what's missing.

```ts
export type ProviderId = "strava" | "kroger";

export const PROVIDERS: Record<ProviderId, {
  id: ProviderId;
  label: string;        // "Strava" / "Kroger"
  endpoint: string;     // status endpoint returning { connected: boolean }
  queryKey: readonly string[];
}> = {
  strava: { id: "strava", label: "Strava", endpoint: "/api/strava/token", queryKey: ["connection", "strava"] },
  kroger: { id: "kroger", label: "Kroger", endpoint: "/api/mcp/token",    queryKey: ["connection", "kroger"] },
};

/** Providers that are required but not connected. Order follows `required`. */
export function missingProviders(
  required: readonly ProviderId[],
  status: Partial<Record<ProviderId, boolean>>,
): ProviderId[] {
  return required.filter((p) => status[p] !== true);
}
```

Note: Kroger's status endpoint is `/api/mcp/token` (the "shopping" provider,
Clerk provider key `custom_shopping`); Strava's is `/api/strava/token` (Clerk
provider key `oauth_custom_strava`). These already exist and are unchanged.

### 2. Agent requirements (`registry.ts`)

Add an optional field to `AgentConfig`:

```ts
requires?: ProviderId[];
```

Mapping:

| Agent     | requires              |
| --------- | --------------------- |
| `travel`  | — (none)              |
| `grocery` | `["kroger"]`          |
| `fitness` | `["strava"]`          |
| `wellness`| `["kroger","strava"]` |
| `a2ui`    | — (none)              |

`registry.ts` imports `ProviderId` from `connections.ts`. Keeping the requirement
on the agent config (declarative, co-located with the rest of the agent's
metadata) and the provider catalog separate keeps each module single-purpose.

### 3. Gating hook (`src/hooks/use-required-connections.ts`)

```ts
function useRequiredConnections(agentId: AgentId): {
  isLoading: boolean;
  missing: ProviderId[];
};
```

- Reads `getAgentConfig(agentId).requires ?? []`.
- For each required provider, calls the existing `useAuthConnection({ endpoint, queryKey, enabled })`.
  Because hook calls cannot be conditional, the hook always issues a query for
  **both** providers (`strava`, `kroger`) but sets `enabled` to whether that
  provider is in `requires` — non-required providers stay idle.
- `isLoading` is true while any required provider's query is still loading.
- `missing` = `missingProviders(required, { strava: stravaQuery.data?.connected, kroger: krogerQuery.data?.connected })`.

This reuses `useAuthConnection` verbatim and produces a tiny, testable surface.

### 4. Chat gating (`ChatSurface.tsx`)

`ChatSurface` already receives `config`. It calls `useRequiredConnections(config.id)`.

Rendering of the bottom input region:

- **`isLoading` true** → render the normal `PromptInput`. We do not flash a
  disabled state before we know the connection status; the agent itself won't be
  invoked meaningfully until the user types anyway.
- **`missing.length > 0`** → replace the `PromptInput` with a **ConnectNotice**
  card in the same footer slot:
  - Copy: `Connect your {Strava and Kroger} account to use {Trip Studio label}.`
    (joins missing provider labels with "and").
  - A primary **"Open settings"** button linking to `/console/settings` (Next.js
    `Link` / `router.push`).
- **otherwise** → render the normal `PromptInput`.

`send()` is naturally unreachable while gated because the `PromptInput` is not
mounted. The conversation history above remains visible and scrollable.

### 5. Settings route (`app/console/settings/page.tsx`)

A client route mirroring the `/console/[agent]` shell layout:

- Left: `<NavRail />` (top bar on mobile, left rail on desktop) — same component.
- Right: a scrollable content column hosting Clerk's
  `<UserProfile routing="hash" />`. Clerk's "Connected accounts" section provides
  the connect/disconnect flow for Strava and Kroger natively (providers must be
  enabled in the Clerk dashboard — an ops prerequisite, not code).
- Wrapped so the page fills `h-dvh` and the content column scrolls independently,
  consistent with `WorkspaceShell`.

### 6. Sidebar entry (`NavRail.tsx`)

`NavRail` gains:

- A new `activePath?: string` prop (optional, defaults undefined).
- A **gear button** rendered just before the status dot, as a Next.js `Link` to
  `/console/settings`, with `aria-label="Settings"` and an active highlight when
  `activePath === "/console/settings"`.

The existing logo, new-thread button, and status dot are unchanged. The
`/console/[agent]` page passes `activePath` of its current route (or leaves it
undefined); the settings page passes `/console/settings`.

## Data Flow

```
NavRail gear ── Link ──▶ /console/settings ──▶ Clerk <UserProfile> (link Strava/Kroger)
                                                          │ writes OAuth tokens to Clerk
                                                          ▼
/console/[agent] ─▶ ChatSurface ─▶ useRequiredConnections(agentId)
                                        │ useAuthConnection → /api/{strava,mcp}/token → Clerk tokens
                                        ▼
                          missing.length > 0 ? ConnectNotice (→ settings) : PromptInput
```

## Testing

- `connections.test.ts` — `missingProviders` truth table: none required → `[]`;
  one required + connected → `[]`; one required + missing → `[that]`; wellness
  both missing → `["kroger","strava"]`; both required, one connected → the other.
- `registry` — assert `grocery.requires`, `fitness.requires`, `wellness.requires`
  match the table; `travel`/`a2ui` have no `requires`.
- `ChatSurface` gating test (mock `useRequiredConnections`): when `missing` is
  non-empty, the "Open settings" control and connect copy render and the textarea
  does not; when `missing` is empty, the textarea renders.

## Files Changed

| File | Change |
| --- | --- |
| `apps/web/src/lib/connections.ts` | New — provider catalog + `missingProviders` |
| `apps/web/src/lib/connections.test.ts` | New — `missingProviders` unit tests |
| `apps/web/src/components/chat/agents/registry.ts` | Add `requires?: ProviderId[]` + mapping |
| `apps/web/src/hooks/use-required-connections.ts` | New — compose connection queries per agent |
| `apps/web/src/components/chat/ChatSurface.tsx` | Gate prompt input via `useRequiredConnections` |
| `apps/web/src/components/chat/NavRail.tsx` | Add settings gear link + `activePath` |
| `apps/web/src/app/console/settings/page.tsx` | New — settings route hosting `<UserProfile>` |
| `apps/web/src/app/console/[agent]/page.tsx` | Pass `activePath` to `NavRail` (minor) |

## Out of Scope

- Python agent changes; token API endpoint changes.
- Mobile app (`apps/mobile`).
- The deprecated `/wellness` `WellnessConnectGate` (this console gate supersedes it).
- Custom branded connection cards (decided: use Clerk `<UserProfile>`).
