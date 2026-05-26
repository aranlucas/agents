# Wellness Connect Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sequential Kroger + Strava connect gate to the Wellness page that blocks the main UI until both OAuth connections are present, skipping steps for services already linked.

**Architecture:** Extend `WellnessState` with `kroger_connected` and `strava_connected` boolean fields, then mirror the pattern already used in `apps/web/src/app/grocery/page.tsx` and `apps/web/src/app/fitness/page.tsx`: `useAuthConnection` hooks check token endpoints, `useEffect`s sync results into agent state, and a `WellnessConnectGate` component renders the first pending step with a step indicator. No Python agent changes required.

**Tech Stack:** TypeScript, React, Next.js, Clerk (`@clerk/nextjs`), `@tanstack/react-query` (via `useAuthConnection`), Lucide icons, shadcn `Button`

---

## Files

| File | Action |
|------|--------|
| `packages/types/src/index.ts` | Modify — add two fields to `WellnessState` |
| `apps/web/src/app/wellness/page.tsx` | Modify — add imports, constants, hooks, effects, gate components, conditional render |

---

### Task 1: Extend WellnessState

**Files:**
- Modify: `packages/types/src/index.ts:95-103`

- [ ] **Step 1: Add the two connection fields**

In `packages/types/src/index.ts`, update `WellnessState` (currently at line 95):

```ts
export type WellnessState = {
  status?: WellnessStatus
  meal_plan?: string
  workout_plan?: string
  weekly_plan?: string
  review_summary?: string
  last_delegation?: Record<string, unknown>
  user_id?: string
  kroger_connected?: boolean
  strava_connected?: boolean
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): add kroger_connected and strava_connected to WellnessState"
```

---

### Task 2: Add OAuth handlers and connection sync to WellnessPageInner

**Files:**
- Modify: `apps/web/src/app/wellness/page.tsx`

This task adds everything to `WellnessPageInner` except the gate render — that comes in Task 3.

- [ ] **Step 1: Add imports**

Replace the existing import block at the top of `apps/web/src/app/wellness/page.tsx` with:

```tsx
"use client";

import React, { useState, useEffect } from "react";
import { useReverification, useUser } from "@clerk/nextjs";
import {
  CopilotKit,
  CopilotSidebar,
  useAgent,
  UseAgentUpdate,
  useConfigureSuggestions,
} from "@copilotkit/react-core/v2";
import { Activity, CalendarDays, Dumbbell, Salad, ShoppingCart, Sparkles } from "lucide-react";
import { Streamdown } from "streamdown";

import { HeroHeader } from "@/components/hero-header";
import { useAuthConnection } from "@/lib/use-auth-connection";
import { Button } from "@/components/ui/button";

import type { WellnessState, WellnessStatus } from "@agents/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
```

- [ ] **Step 2: Add OAuth strategy constants** (after imports, before `STATUS_META`)

```tsx
const KROGER_PROVIDER = "custom_shopping";
const KROGER_STRATEGY = "oauth_custom_shopping";
const STRAVA_STRATEGY = "oauth_custom_strava";
```

- [ ] **Step 3: Add the CONNECT_STEPS config** (after the constants, before `SOURCE_THEME`)

```tsx
type ConnectStepId = "kroger" | "strava";

type ConnectStep = {
  id: ConnectStepId;
  label: string;
  connectedKey: "kroger_connected" | "strava_connected";
  icon: React.ReactNode;
  iconBg: string;
  description: string;
};

const CONNECT_STEPS: ConnectStep[] = [
  {
    id: "kroger",
    label: "Kroger",
    connectedKey: "kroger_connected",
    icon: <ShoppingCart className="h-6 w-6" />,
    iconBg: "bg-[var(--grocery-soft)]",
    description:
      "The wellness agent delegates meal planning to the grocery agent, which needs your Kroger account.",
  },
  {
    id: "strava",
    label: "Strava",
    connectedKey: "strava_connected",
    icon: <Activity className="h-6 w-6" />,
    iconBg: "bg-[var(--fitness-soft)]",
    description:
      "The wellness agent delegates workout planning to the fitness agent, which uses your Strava activity history.",
  },
];
```

- [ ] **Step 4: Add hooks and effects inside WellnessPageInner**

Add the following at the top of the `WellnessPageInner` function body, before the existing `useAgent` call:

```tsx
const { user, isLoaded } = useUser();
const [connectingId, setConnectingId] = useState<ConnectStepId | null>(null);

const connectKroger = useReverification(async () => {
  if (!user) return;
  const existing = user.externalAccounts.find(
    ({ provider }) => provider === KROGER_PROVIDER,
  );
  const account = existing
    ? await existing.reauthorize({ redirectUrl: window.location.href })
    : await user.createExternalAccount({
        strategy: KROGER_STRATEGY,
        redirectUrl: window.location.href,
      });
  const redirectUrl = account.verification?.externalVerificationRedirectURL?.href;
  if (redirectUrl) window.location.assign(redirectUrl);
});

const connectStrava = useReverification(async () => {
  if (!user) return;
  const existing = user.externalAccounts.find(
    ({ provider }) =>
      provider === "custom_strava" || String(provider) === STRAVA_STRATEGY,
  );
  const account = existing
    ? await existing.reauthorize({ redirectUrl: window.location.href })
    : await user.createExternalAccount({
        strategy: STRAVA_STRATEGY,
        redirectUrl: window.location.href,
      });
  const redirectUrl = account.verification?.externalVerificationRedirectURL?.href;
  if (redirectUrl) window.location.assign(redirectUrl);
});
```

- [ ] **Step 5: Add connection queries and sync effects**

Add after the existing `useAgent` call (after `const { agent } = useAgent(...)`):

```tsx
const krogerConnection = useAuthConnection({
  endpoint: "/api/mcp/token",
  enabled: Boolean(isLoaded && user),
  queryKey: ["auth-connection", "kroger"],
});

const stravaConnection = useAuthConnection({
  endpoint: "/api/strava/token",
  enabled: Boolean(isLoaded && user),
  queryKey: ["auth-connection", "strava"],
});

useEffect(() => {
  if (!agent || !krogerConnection.data) return;
  const current = (agent.state ?? {}) as WellnessState;
  if (current.kroger_connected === krogerConnection.data.connected) return;
  agent.setState({ ...current, kroger_connected: krogerConnection.data.connected });
}, [agent, krogerConnection.data]);

useEffect(() => {
  if (!agent || !stravaConnection.data) return;
  const current = (agent.state ?? {}) as WellnessState;
  if (current.strava_connected === stravaConnection.data.connected) return;
  agent.setState({ ...current, strava_connected: stravaConnection.data.connected });
}, [agent, stravaConnection.data]);
```

- [ ] **Step 6: Add the connect handler and pending-steps derivation**

Add after the existing `const isRunning = ...` line:

```tsx
const pendingSteps = CONNECT_STEPS.filter((s) => !state[s.connectedKey]);

const handleConnect = async (id: ConnectStepId) => {
  if (!user || connectingId !== null) return;
  setConnectingId(id);
  try {
    if (id === "kroger") await connectKroger();
    else await connectStrava();
  } catch (err) {
    console.error("Connect failed:", err);
    setConnectingId(null);
  }
};
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd apps/web && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/wellness/page.tsx
git commit -m "feat(wellness): add OAuth handlers and connection sync for Kroger and Strava"
```

---

### Task 3: Build WellnessConnectGate and wire into render

**Files:**
- Modify: `apps/web/src/app/wellness/page.tsx`

- [ ] **Step 1: Add the StepIndicator component**

Add this function before `WellnessPageInner` in `apps/web/src/app/wellness/page.tsx`:

```tsx
function StepIndicator({
  steps,
  pendingIds,
}: {
  steps: ConnectStep[];
  pendingIds: ConnectStepId[];
}) {
  return (
    <div className="flex items-center justify-center gap-3 py-4">
      {steps.map((step, i) => {
        const isDone = !pendingIds.includes(step.id);
        const isCurrent = pendingIds[0] === step.id;
        const prevDone = i > 0 && !pendingIds.includes(steps[i - 1].id);
        return (
          <React.Fragment key={step.id}>
            {i > 0 && (
              <div
                className={`h-px w-8 ${prevDone ? "bg-[var(--success)]" : "bg-[var(--border)]"}`}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                  isDone
                    ? "bg-[var(--success)] text-white"
                    : isCurrent
                      ? "bg-[var(--page-color)] text-white"
                      : "bg-[var(--border)] text-[var(--ink-mute)]"
                }`}
              >
                {isDone ? "✓" : i + 1}
              </div>
              <span
                className={`text-[8px] font-semibold uppercase tracking-wider ${
                  isDone
                    ? "text-[var(--success)]"
                    : isCurrent
                      ? "text-[var(--page-color)]"
                      : "text-[var(--ink-mute)]"
                }`}
              >
                {step.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Add the WellnessConnectGate component**

Add immediately after `StepIndicator`:

```tsx
function WellnessConnectGate({
  steps,
  pendingSteps,
  onConnect,
  connectingId,
}: {
  steps: ConnectStep[];
  pendingSteps: ConnectStep[];
  onConnect: (id: ConnectStepId) => void;
  connectingId: ConnectStepId | null;
}) {
  const currentStep = pendingSteps[0];
  const pendingIds = pendingSteps.map((s) => s.id);

  return (
    <>
      <StepIndicator steps={steps} pendingIds={pendingIds} />
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-2xl text-[var(--page-color)] ${currentStep.iconBg}`}
        >
          {currentStep.icon}
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-[var(--ink)]">
            Connect {currentStep.label}
          </h2>
          <p className="max-w-sm text-sm text-[var(--ink-mute)]">
            {currentStep.description}
          </p>
        </div>
        <Button
          onClick={() => onConnect(currentStep.id)}
          disabled={connectingId !== null}
          size="lg"
        >
          {connectingId === currentStep.id
            ? "Connecting…"
            : `Connect ${currentStep.label}`}
        </Button>
        <p className="text-xs text-[var(--ink-mute)]">
          You&apos;ll be redirected to authorize access, then returned here.
        </p>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Wire the gate into WellnessPageInner's render**

In `WellnessPageInner`, find the `return (` statement. The current `<main>` body contains the `<HeroHeader>`, `<OrchestrationFlow>`, and the content grid. Replace the content after `<OrchestrationFlow status={status} />` with a conditional:

```tsx
<OrchestrationFlow status={status} />

{pendingSteps.length > 0 ? (
  <WellnessConnectGate
    steps={CONNECT_STEPS}
    pendingSteps={pendingSteps}
    onConnect={handleConnect}
    connectingId={connectingId}
  />
) : (
  <div className="mx-auto grid w-full max-w-[1400px] flex-1 gap-4 p-4 md:p-6 lg:grid-cols-[340px_minmax(0,1fr)]">
    <div className="flex min-w-0 flex-col gap-4">
      <SourceCard
        title="Meals — from Grocery"
        icon={<Salad className="h-3 w-3" />}
        theme="grocery"
        value={state.meal_plan}
        hint="Grocery output will appear here after wellness delegates meal planning."
      />
      <SourceCard
        title="Workouts — from Fitness"
        icon={<Dumbbell className="h-3 w-3" />}
        theme="fitness"
        value={state.workout_plan}
        hint="Fitness output will appear here after wellness delegates training."
      />
    </div>

    <div className="flex min-w-0 flex-col gap-4">
      <PrimaryCard
        title="Combined weekly plan"
        icon={<CalendarDays className="h-3 w-3" />}
        footer={
          isRunning ? (
            <p className="text-xs text-[var(--page-color)]">writing…</p>
          ) : undefined
        }
      >
        {state.weekly_plan ? (
          <div className="streamdown-markdown text-sm text-[var(--ink-soft)]">
            <Streamdown>{state.weekly_plan}</Streamdown>
          </div>
        ) : (
          <p className="text-sm text-[var(--ink-mute)]">
            Ask the agent to coordinate meals and workouts for next week.
          </p>
        )}
      </PrimaryCard>

      {state.review_summary && (
        <PrimaryCard
          title="Review"
          icon={<Sparkles className="h-3 w-3" />}
        >
          <p className="text-sm text-[var(--ink-soft)]">{state.review_summary}</p>
        </PrimaryCard>
      )}
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/web && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Start dev server and visually verify the gate**

```bash
pnpm dev:web
```

Open `http://localhost:3000/wellness`.

Expected behavior to check:
- If neither service is connected: Kroger gate shows (step 1 of 2, step 2 dimmed)
- If Kroger is already connected (e.g. visited Grocery page first): Strava gate shows (step 1 green ✓, step 2 active)
- If both connected: main wellness dashboard renders with `OrchestrationFlow` and the source/plan cards
- Connect button is disabled while `connectingId` is set

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/wellness/page.tsx
git commit -m "feat(wellness): add sequential Kroger/Strava connect gate"
```
