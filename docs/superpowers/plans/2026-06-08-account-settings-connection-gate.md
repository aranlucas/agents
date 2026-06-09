# Account Settings & Connection-Gated Agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sidebar-reachable settings page where users link Strava/Kroger via Clerk, and gate each agent's chat input until its required accounts are connected.

**Architecture:** A pure provider catalog (`connections.ts`) maps `ProviderId` → Clerk provider strings and derives connection status from `useUser().user.externalAccounts` (no fetch). Agents declare `requires` in the registry. `ChatSurface` swaps its prompt input for a "ConnectNotice" when required providers are missing. A new `/console/settings` route hosts Clerk's `<UserProfile>`, reached from a gear button in `NavRail`.

**Tech Stack:** Next.js 16 (App Router, client components), React 19, Clerk (`@clerk/nextjs`), Tailwind, base-ui `Button`, lucide-react, Vitest (node env, `react-test-renderer` for smoke).

**Spec:** `docs/superpowers/specs/2026-06-08-account-settings-connection-gate-design.md`

---

## File Structure

| File                                                   | Responsibility                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `apps/web/src/lib/connections.ts`                      | **New.** `ProviderId`, `PROVIDERS` catalog, pure `connectedProviders` / `missingProviders` |
| `apps/web/src/lib/connections.test.ts`                 | **New.** Unit tests for the pure helpers                                                   |
| `apps/web/src/components/chat/agents/registry.ts`      | Add `requires?: ProviderId[]` field + per-agent mapping                                    |
| `apps/web/src/components/chat/agents/registry.test.ts` | Assert `requires` mapping                                                                  |
| `apps/web/src/hooks/use-required-connections.ts`       | **New.** `useUser()` → `{ isLoading, missing }`                                            |
| `apps/web/src/components/chat/ConnectNotice.tsx`       | **New.** Presentational "link your account" card                                           |
| `apps/web/src/components/chat/ChatSurface.tsx`         | Gate the prompt input via `useRequiredConnections`                                         |
| `apps/web/src/components/chat/NavRail.tsx`             | Add settings gear `Link` + `activePath` prop                                               |
| `apps/web/src/app/console/settings/page.tsx`           | **New.** Settings route: `NavRail` + `<UserProfile>`                                       |
| `apps/web/src/app/console/[agent]/page.tsx`            | Pass `activePath` to `NavRail`                                                             |
| `apps/web/src/all-source-smoke.test.tsx`               | Mock `UserProfile`, render the settings page                                               |

**Note on test environment:** Vitest runs in the `node` environment (see `vitest.config`). Follow the existing convention — pure-function tests (like `tool-adapter.test.ts`, `registry.test.ts`) plus the `all-source-smoke.test.tsx` render harness. Do **not** introduce jsdom/testing-library; gating logic is tested as a pure function and the settings page via the smoke harness.

**Commands** (run from `apps/web/`):

- Single test file: `pnpm exec vitest run src/lib/connections.test.ts`
- All web tests: `pnpm test`
- Full repo checks: `pnpm check` (from repo root)

---

## Task 1: Provider catalog & pure helpers

**Files:**

- Create: `apps/web/src/lib/connections.ts`
- Test: `apps/web/src/lib/connections.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/connections.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { connectedProviders, missingProviders, type ExternalAccountLike } from "./connections";

const verified = (provider: string): ExternalAccountLike => ({
  provider,
  verification: { status: "verified" },
});

describe("connectedProviders", () => {
  it("returns nothing for no accounts", () => {
    expect(connectedProviders([])).toEqual([]);
  });

  it("matches strava under either clerk spelling", () => {
    expect(connectedProviders([verified("custom_strava")])).toEqual(["strava"]);
    expect(connectedProviders([verified("oauth_custom_strava")])).toEqual(["strava"]);
  });

  it("matches kroger under either clerk spelling", () => {
    expect(connectedProviders([verified("custom_shopping")])).toEqual(["kroger"]);
    expect(connectedProviders([verified("oauth_custom_shopping")])).toEqual(["kroger"]);
  });

  it("ignores unverified accounts", () => {
    expect(
      connectedProviders([{ provider: "custom_strava", verification: { status: "unverified" } }]),
    ).toEqual([]);
    expect(connectedProviders([{ provider: "custom_strava" }])).toEqual([]);
  });
});

describe("missingProviders", () => {
  it("is empty when nothing is required", () => {
    expect(missingProviders([], [])).toEqual([]);
  });

  it("reports a required-but-unlinked provider", () => {
    expect(missingProviders(["strava"], [])).toEqual(["strava"]);
  });

  it("clears once the provider is verified", () => {
    expect(missingProviders(["strava"], [verified("custom_strava")])).toEqual([]);
  });

  it("reports both for wellness with neither linked", () => {
    expect(missingProviders(["kroger", "strava"], [])).toEqual(["kroger", "strava"]);
  });

  it("reports only the still-missing one (order follows required)", () => {
    expect(missingProviders(["kroger", "strava"], [verified("custom_shopping")])).toEqual([
      "strava",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/connections.test.ts`
Expected: FAIL — cannot find module `./connections`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/lib/connections.ts`:

```ts
export type ProviderId = "strava" | "kroger";

/** Minimal shape of a Clerk `ExternalAccount` this module depends on. */
export type ExternalAccountLike = {
  provider: string;
  verification?: { status?: string | null } | null;
};

export const PROVIDERS: Record<
  ProviderId,
  {
    id: ProviderId;
    label: string;
    /** Clerk `externalAccount.provider` strings that map to this provider. */
    clerkProviders: readonly string[];
  }
> = {
  strava: {
    id: "strava",
    label: "Strava",
    clerkProviders: ["custom_strava", "oauth_custom_strava"],
  },
  kroger: {
    id: "kroger",
    label: "Kroger",
    clerkProviders: ["custom_shopping", "oauth_custom_shopping"],
  },
};

const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

/** Provider ids that have a verified external account. */
export function connectedProviders(accounts: readonly ExternalAccountLike[]): ProviderId[] {
  return PROVIDER_IDS.filter((id) =>
    accounts.some(
      (account) =>
        PROVIDERS[id].clerkProviders.includes(account.provider) &&
        account.verification?.status === "verified",
    ),
  );
}

/** Required providers that are not connected. Order follows `required`. */
export function missingProviders(
  required: readonly ProviderId[],
  accounts: readonly ExternalAccountLike[],
): ProviderId[] {
  const connected = new Set(connectedProviders(accounts));
  return required.filter((id) => !connected.has(id));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/connections.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/connections.ts apps/web/src/lib/connections.test.ts
git commit -m "feat(web): provider catalog + connection-status helpers"
```

---

## Task 2: Agent connection requirements

**Files:**

- Modify: `apps/web/src/components/chat/agents/registry.ts`
- Test: `apps/web/src/components/chat/agents/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/web/src/components/chat/agents/registry.test.ts` inside the existing `describe("agent registry", ...)` block:

```ts
it("declares external-account requirements per agent", () => {
  expect(getAgentConfig("travel").requires ?? []).toEqual([]);
  expect(getAgentConfig("grocery").requires).toEqual(["kroger"]);
  expect(getAgentConfig("fitness").requires).toEqual(["strava"]);
  expect(getAgentConfig("wellness").requires).toEqual(["kroger", "strava"]);
  expect(getAgentConfig("a2ui").requires ?? []).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/chat/agents/registry.test.ts`
Expected: FAIL — `grocery.requires` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `apps/web/src/components/chat/agents/registry.ts`:

a) Add the import at the top (after the existing `import type { ArtifactKind }` line):

```ts
import type { ProviderId } from "@/lib/connections";
```

b) Add the field to the `AgentConfig` type (after the `artifact?: ArtifactSource;` line):

```ts
  /** External OAuth providers that must be connected before this agent is usable. */
  requires?: ProviderId[];
```

c) Add `requires` to the relevant entries in `AGENTS`:

- In `grocery`, after `id: "grocery",`: add `requires: ["kroger"],`
- In `fitness`, after `id: "fitness",`: add `requires: ["strava"],`
- In `wellness`, after `id: "wellness",`: add `requires: ["kroger", "strava"],`

Leave `travel` and `a2ui` without a `requires` field.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/chat/agents/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat/agents/registry.ts apps/web/src/components/chat/agents/registry.test.ts
git commit -m "feat(web): declare per-agent connection requirements"
```

---

## Task 3: useRequiredConnections hook

**Files:**

- Create: `apps/web/src/hooks/use-required-connections.ts`

This is a thin wrapper over `useUser()` and the already-tested `missingProviders`. Its logic is covered by `connections.test.ts`; no dedicated hook test (the repo's node-env Vitest setup does not render hooks, and the hook adds no branching beyond the pure helper). It is exercised at render time by the smoke test once `ChatSurface` consumes it.

- [ ] **Step 1: Write the implementation**

Create `apps/web/src/hooks/use-required-connections.ts`:

```ts
"use client";

import { useUser } from "@clerk/nextjs";

import { getAgentConfig, type AgentId } from "@/components/chat/agents/registry";
import { missingProviders, type ExternalAccountLike, type ProviderId } from "@/lib/connections";

/**
 * Reads the agent's `requires` list and reports which of those providers the
 * signed-in user has NOT linked, sourced from Clerk's client-side
 * `externalAccounts` (no network request).
 */
export function useRequiredConnections(agentId: AgentId): {
  isLoading: boolean;
  missing: ProviderId[];
} {
  const { isLoaded, user } = useUser();
  const required = getAgentConfig(agentId).requires ?? [];
  const accounts = (user?.externalAccounts ?? []) as ExternalAccountLike[];

  return {
    isLoading: !isLoaded,
    missing: missingProviders(required, accounts),
  };
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm exec tsc --noEmit` (from `apps/web/`)
Expected: no errors referencing `use-required-connections.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/use-required-connections.ts
git commit -m "feat(web): useRequiredConnections hook over Clerk externalAccounts"
```

---

## Task 4: ConnectNotice + chat gating

**Files:**

- Create: `apps/web/src/components/chat/ConnectNotice.tsx`
- Modify: `apps/web/src/components/chat/ChatSurface.tsx`

- [ ] **Step 1: Write the ConnectNotice component**

Create `apps/web/src/components/chat/ConnectNotice.tsx`:

```tsx
"use client";

import Link from "next/link";
import { LockIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PROVIDERS, type ProviderId } from "@/lib/connections";

/** Joins labels as "Strava", "Strava and Kroger", "A, B, and C". */
function joinLabels(missing: ProviderId[]): string {
  const labels = missing.map((id) => PROVIDERS[id].label);
  if (labels.length <= 1) return labels.join("");
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

export function ConnectNotice({
  agentLabel,
  missing,
}: {
  agentLabel: string;
  missing: ProviderId[];
}) {
  const accountWord = missing.length > 1 ? "accounts" : "account";
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-6 py-5 text-center">
      <div className="grid size-9 place-items-center rounded-full bg-[var(--bg-soft)] text-[var(--ink-mute)]">
        <LockIcon className="size-4" />
      </div>
      <p className="text-sm text-[var(--ink)]">
        Connect your <span className="font-medium">{joinLabels(missing)}</span> {accountWord} to use{" "}
        {agentLabel}.
      </p>
      <Button render={<Link href="/console/settings" />} size="sm">
        Open settings
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Run test to verify ChatSurface still builds (baseline)**

Run: `pnpm test`
Expected: PASS (nothing wired yet; ConnectNotice is unused — this baseline confirms the new file compiles).

- [ ] **Step 3: Wire gating into ChatSurface**

In `apps/web/src/components/chat/ChatSurface.tsx`:

a) Add imports near the other local imports (after `import { AgentSelector } from "./AgentSelector";`):

```tsx
import { ConnectNotice } from "./ConnectNotice";
import { useRequiredConnections } from "@/hooks/use-required-connections";
```

b) Inside the `ChatSurface` component body, after the existing `const renderToolCall = useRenderToolCall();` line, add:

```tsx
const connections = useRequiredConnections(config.id);
const gated = !connections.isLoading && connections.missing.length > 0;
```

c) Replace the entire footer block (the `<div className="px-4 pb-...">` wrapper that contains `<PromptInput>`) with a conditional:

```tsx
<div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
  <div className="mx-auto w-full max-w-[760px]">
    {gated ? (
      <ConnectNotice agentLabel={config.label} missing={connections.missing} />
    ) : (
      <PromptInput
        onSubmit={(message: PromptInputMessage) => {
          send(message.text ?? "");
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea placeholder={config.placeholder} />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <AgentSelector active={config.id} onSelect={onSwitchAgent} />
          </PromptInputTools>
          <PromptInputSubmit status={isRunning ? "streaming" : "ready"} onStop={stop} />
        </PromptInputFooter>
      </PromptInput>
    )}
  </div>
</div>
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm test && pnpm exec tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat/ConnectNotice.tsx apps/web/src/components/chat/ChatSurface.tsx
git commit -m "feat(web): gate agent chat input on required account connections"
```

---

## Task 5: NavRail settings gear

**Files:**

- Modify: `apps/web/src/components/chat/NavRail.tsx`

- [ ] **Step 1: Implement the gear link + active state**

Replace the full contents of `apps/web/src/components/chat/NavRail.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { PencilIcon, SettingsIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export const SETTINGS_PATH = "/console/settings";

// Horizontal mobile menu bar on small screens; vertical rail on md+. The order
// utilities flip the trailing items (settings + status dot) to the trailing edge
// (right on mobile, bottom on desktop) so the same markup serves both axes.
export function NavRail({
  onNewThread,
  activePath,
}: {
  onNewThread?: () => void;
  activePath?: string;
}) {
  const settingsActive = activePath === SETTINGS_PATH;
  return (
    <div className="flex w-full flex-row items-center gap-1.5 border-b border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-2 md:h-full md:w-[54px] md:flex-col md:border-r md:border-b-0 md:px-0 md:py-3">
      <div className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white md:mb-2.5">
        A
      </div>
      <button
        type="button"
        aria-label="New thread"
        onClick={onNewThread}
        className="grid h-[34px] w-[34px] place-items-center rounded-lg text-[var(--ink-mute)] hover:bg-[var(--bg-soft)] hover:text-[var(--ink)]"
      >
        <PencilIcon className="size-4" />
      </button>
      <Link
        href={SETTINGS_PATH}
        aria-label="Settings"
        aria-current={settingsActive ? "page" : undefined}
        className={cn(
          "ml-auto grid h-[34px] w-[34px] place-items-center rounded-lg hover:bg-[var(--bg-soft)] hover:text-[var(--ink)] md:mt-auto md:ml-0",
          settingsActive ? "bg-[var(--bg-soft)] text-[var(--ink)]" : "text-[var(--ink-mute)]",
        )}
      >
        <SettingsIcon className="size-4" />
      </Link>
      <div className="h-2.5 w-2.5 rounded-full bg-[var(--success)]" />
    </div>
  );
}
```

Note: the status dot lost its `ml-auto`/`md:mt-auto` (the gear now carries the trailing-edge push), so the dot sits next to the gear at the trailing edge on both axes.

- [ ] **Step 2: Run tests + typecheck**

Run: `pnpm test && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/NavRail.tsx
git commit -m "feat(web): add settings link to NavRail"
```

---

## Task 6: Settings route

**Files:**

- Create: `apps/web/src/app/console/settings/page.tsx`

- [ ] **Step 1: Implement the settings page**

Create `apps/web/src/app/console/settings/page.tsx`:

```tsx
"use client";

import { UserProfile } from "@clerk/nextjs";

import { NavRail, SETTINGS_PATH } from "@/components/chat/NavRail";

export default function SettingsPage() {
  return (
    // Mirrors the /console/[agent] shell: rail (top bar on mobile, left rail on
    // desktop) beside a scrollable content column.
    <main className="flex h-dvh flex-col overflow-hidden md:flex-row">
      <div className="flex-none">
        <NavRail activePath={SETTINGS_PATH} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-[900px] px-4 py-6">
          <h1 className="mb-4 text-lg font-semibold text-[var(--ink)]">Settings</h1>
          <UserProfile routing="hash" />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `pnpm exec tsc --noEmit`
Expected: no errors referencing `settings/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/console/settings/page.tsx
git commit -m "feat(web): /console/settings page hosting Clerk UserProfile"
```

---

## Task 7: Wire console activePath + smoke coverage

**Files:**

- Modify: `apps/web/src/app/console/[agent]/page.tsx`
- Modify: `apps/web/src/all-source-smoke.test.tsx`

- [ ] **Step 1: Pass activePath from the console page**

In `apps/web/src/app/console/[agent]/page.tsx`, change the `rail` prop of `WorkspaceShell` from:

```tsx
        rail={<NavRail />}
```

to:

```tsx
        rail={<NavRail activePath={`/console/${agentId}`} />}
```

- [ ] **Step 2: Add UserProfile to the Clerk mock and render the settings page in the smoke test**

In `apps/web/src/all-source-smoke.test.tsx`:

a) In the `vi.mock("@clerk/nextjs", () => ({ ... }))` object, add a `UserProfile` entry alongside `SignIn`/`SignUp`:

```tsx
  UserProfile: () => <div data-user-profile />,
```

b) Add the settings page to the dynamic-import array (the `Promise.all([...])` that imports pages). Add this line after `import("./app/a2ui/page"),`:

```tsx
      import("./app/console/settings/page"),
```

c) Add a matching binding name in the destructuring array on the left of that `await Promise.all`. The imports are positional — insert a `SettingsPage` binding at the **same position** you added the import (right after the `A2UIPage` binding). Find the binding list that pairs with the import list and add `SettingsPage,` in the corresponding slot.

d) Add a render call alongside the other page renders (after the `"a2ui"` render block):

```tsx
await render(
  "settings",
  <ProvidersModule.Providers>
    <SettingsPage.default />
  </ProvidersModule.Providers>,
);
```

- [ ] **Step 3: Run the smoke test**

Run: `pnpm exec vitest run src/all-source-smoke.test.tsx`
Expected: PASS — "renders all pages and key component states" includes the settings page without throwing.

- [ ] **Step 4: Full check**

Run from repo root: `pnpm check`
Expected: lint + typecheck + tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/console/[agent]/page.tsx apps/web/src/all-source-smoke.test.tsx
git commit -m "feat(web): highlight active rail item + smoke-cover settings page"
```

---

## Manual Verification (after all tasks)

1. `pnpm dev:web` (agents need not be running for the gate/UI).
2. Sign in. Open `/console/grocery` → the prompt input is replaced by "Connect your Kroger account to use Grocery" with an **Open settings** button (assuming Kroger is not linked on the test user).
3. Open `/console/travel` → normal prompt input (no requirement).
4. Click the gear in the rail → lands on `/console/settings`; the gear is highlighted; Clerk `<UserProfile>` shows a "Connected accounts" section.
5. Link Kroger via UserProfile, return to `/console/grocery` → prompt input is now enabled.
6. Resize to mobile width → rail collapses to the top bar; gear remains reachable.

Note: Strava/Kroger must be enabled as OAuth connections in the Clerk dashboard for them to appear in `<UserProfile>` — this is an environment prerequisite, not a code change.
