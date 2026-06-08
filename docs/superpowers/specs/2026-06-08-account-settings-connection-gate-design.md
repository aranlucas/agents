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

**Connection status comes from Clerk on the client** (`useUser().user.externalAccounts`),
not from the `/api/*/token` endpoints. Those endpoints still exist — the CopilotKit
runtime route uses them to forward the real OAuth token to the agent server-side —
but the gate reads `externalAccounts` directly. This avoids a fetch/loading flash
and reads the exact data the settings `<UserProfile>` mutates, so connecting an
account reflects in the gate instantly. The trade-off (a linked-but-expired token
reads as connected) is acceptable: the gate's question is "have you linked this
account?", and Clerk refreshes the token server-side when the agent fetches it.

## Scope

- `apps/web/src/lib/connections.ts` — **new.** Provider catalog (Clerk provider strings) + `missingProviders` / `connectedProviders` helpers.
- `apps/web/src/lib/connections.test.ts` — **new.** Unit tests for the pure helpers.
- `apps/web/src/components/chat/agents/registry.ts` — add `requires?: ProviderId[]` per agent.
- `apps/web/src/hooks/use-required-connections.ts` — **new.** Derive missing providers from `useUser()`.
- `apps/web/src/components/chat/ChatSurface.tsx` — gate the prompt input when providers are missing.
- `apps/web/src/components/chat/NavRail.tsx` — add a settings (gear) link + active state.
- `apps/web/src/app/console/settings/page.tsx` — **new.** Settings route hosting Clerk `<UserProfile>`.
- Tests: registry requirement assertions, `ChatSurface` gating behavior.

Out of scope: changes to the Python agents, the token endpoints, the mobile app,
and the deprecated `/wellness` `WellnessConnectGate` (superseded by this console gate).

## Design

### 1. Provider catalog & gating model (`src/lib/connections.ts`)

The single source of truth for the two providers and pure helpers for mapping
Clerk external accounts to connection status. No endpoints, no react-query.

```ts
export type ProviderId = "strava" | "kroger";

/** Minimal shape of a Clerk `ExternalAccount` we depend on. */
export type ExternalAccountLike = {
  provider: string;
  verification?: { status?: string | null } | null;
};

export const PROVIDERS: Record<ProviderId, {
  id: ProviderId;
  label: string;          // "Strava" / "Kroger"
  /** Clerk `externalAccount.provider` strings that map to this provider. */
  clerkProviders: readonly string[];
}> = {
  strava: { id: "strava", label: "Strava", clerkProviders: ["custom_strava", "oauth_custom_strava"] },
  kroger: { id: "kroger", label: "Kroger", clerkProviders: ["custom_shopping", "oauth_custom_shopping"] },
};

/** Provider ids that have a verified external account. */
export function connectedProviders(accounts: readonly ExternalAccountLike[]): ProviderId[] {
  return (Object.keys(PROVIDERS) as ProviderId[]).filter((id) =>
    accounts.some(
      (a) =>
        PROVIDERS[id].clerkProviders.includes(a.provider) &&
        a.verification?.status === "verified",
    ),
  );
}

/** Required providers that are not connected. Order follows `required`. */
export function missingProviders(
  required: readonly ProviderId[],
  accounts: readonly ExternalAccountLike[],
): ProviderId[] {
  const connected = new Set(connectedProviders(accounts));
  return required.filter((p) => !connected.has(p));
}
```

The `clerkProviders` arrays cover both spellings Clerk may report for a custom
OAuth connection (`custom_<key>` and `oauth_custom_<key>`) — the prior `/fitness`
page matched both. Verified-only filtering excludes pending/in-progress links.
The server-side provider keys remain `custom_shopping` (Kroger) and
`oauth_custom_strava` (Strava) in the unchanged token helpers/endpoints.

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
- Calls Clerk's `useUser()` once: `const { isLoaded, user } = useUser();`.
- `isLoading` = `!isLoaded`.
- `missing` = `missingProviders(required, user?.externalAccounts ?? [])`.

No network call — `externalAccounts` is already present in the Clerk client
context. The whole hook is a thin wrapper over the pure `missingProviders` helper,
so the logic is exercised by `connections.test.ts` and the hook itself stays
trivial. `useUser()` is mocked in `all-source-smoke.test.tsx` already.

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
                                                          │ adds verified externalAccounts on Clerk user
                                                          ▼
/console/[agent] ─▶ ChatSurface ─▶ useRequiredConnections(agentId)
                                        │ useUser().user.externalAccounts (client, no fetch)
                                        ▼
                          missing.length > 0 ? ConnectNotice (→ settings) : PromptInput

(separately, agent runs: CopilotKit runtime route → /api/{strava,mcp}/token → forwards token to agent)
```

## Testing

- `connections.test.ts` — `connectedProviders` + `missingProviders` over
  `externalAccounts` fixtures: no accounts → all required missing; a verified
  Strava account (test both `custom_strava` and `oauth_custom_strava` spellings)
  → not missing; an *unverified* account → still missing; wellness with neither
  → `["kroger","strava"]`; wellness with Kroger only → `["strava"]`; agent with
  no `requires` → `[]`.
- `registry` — assert `grocery.requires`, `fitness.requires`, `wellness.requires`
  match the table; `travel`/`a2ui` have no `requires`.
- `ChatSurface` gating test (mock `useRequiredConnections`): when `missing` is
  non-empty, the "Open settings" control and connect copy render and the textarea
  does not; when `missing` is empty, the textarea renders.

## Files Changed

| File | Change |
| --- | --- |
| `apps/web/src/lib/connections.ts` | New — provider catalog (Clerk strings) + `connectedProviders`/`missingProviders` |
| `apps/web/src/lib/connections.test.ts` | New — pure-helper unit tests over `externalAccounts` fixtures |
| `apps/web/src/components/chat/agents/registry.ts` | Add `requires?: ProviderId[]` + mapping |
| `apps/web/src/hooks/use-required-connections.ts` | New — derive `missing` from `useUser().externalAccounts` |
| `apps/web/src/components/chat/ChatSurface.tsx` | Gate prompt input via `useRequiredConnections` |
| `apps/web/src/components/chat/NavRail.tsx` | Add settings gear link + `activePath` |
| `apps/web/src/app/console/settings/page.tsx` | New — settings route hosting `<UserProfile>` |
| `apps/web/src/app/console/[agent]/page.tsx` | Pass `activePath` to `NavRail` (minor) |

## Out of Scope

- Python agent changes; token API endpoint changes.
- Mobile app (`apps/mobile`).
- The deprecated `/wellness` `WellnessConnectGate` (this console gate supersedes it).
- Custom branded connection cards (decided: use Clerk `<UserProfile>`).
