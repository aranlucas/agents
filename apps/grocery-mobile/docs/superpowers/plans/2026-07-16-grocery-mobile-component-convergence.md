# Grocery Mobile Component Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the already-committed AniUI/Uniwind migration by hardening native data and chat lifecycles, correcting shared-component behavior and accessibility, completing the remaining reuse targets, and verifying the final application on Android with ADB.

**Architecture:** Keep the dashboard at `/`, chat at `/chat`, the custom CopilotKit renderer, TanStack Query, Clerk, Expo Router, and Grocery-specific commerce behavior. Add one native test/build foundation, then land query, agent, primitive, screen, and commerce changes through reviewer-sized TDD slices. Finish with deterministic Android export, repository gates, and an installed dev-client/ADB acceptance pass.

**Tech Stack:** Expo SDK 57.0.6, React Native 0.86.0, React 19.2.3, TypeScript 6.0.3, Uniwind 1.10/Tailwind 4.3, TanStack Query 5.101, CopilotKit React Native 1.63, Clerk Expo 2.19, Reanimated 4.5, Worklets 0.10, Vitest 4.1, RNTL 14, vitest-native, pnpm.

## Global Constraints

- Use `pnpm`; final repository verification is `pnpm check && pnpm test`.
- Begin from commit `62f9dc4a` or its descendant. The migration in that commit is complete baseline work; do not regenerate or reapply it.
- Preserve `src/app/index.tsx` as the dashboard and `src/app/chat.tsx` as the separate chat route.
- Preserve custom CopilotKit session/rendering, NativeMarkdown streaming, message scrolling, GroceryStateCard, KrogerProductImage, Clerk auth, and Expo Router behavior.
- Use Uniwind and Tailwind v4 only. Do not add NativeWind, arbitrary-value utilities, or custom CSS when shared semantic tokens or built-in utilities apply.
- Preserve the app's `rem: 14` Uniwind configuration.
- Never run `aniui init`; it can overwrite reviewed Metro, tokens, aliases, and TypeScript configuration.
- For catalog-equivalent primitives, use an **upstream-first replacement**: fetch reviewed AniUI registry source into a temporary location, replace the local implementation from that source, then immediately normalize semantic tokens, imports, app-facing APIs, accessibility behavior, and tests. Do not preserve a bespoke local implementation merely because it already exists, and do not leave incompatible exact upstream output unadapted.
- `@aniui/cli` 0.5.0 currently assumes a different root layout. Run it for evidence, but do not add duplicate root CSS/PostCSS files or retain dead dependencies merely to satisfy false layout checks. Use shadcn registry dry-runs/diffs plus Expo Doctor as the actionable diagnostics until the CLI supports this source layout.
- Android identity is stable: package `dev.agents.grocery`, scheme `grocery-agent`, Metro port `8081`, keyboard mode `resize`.
- Do not add Rating, Switch, Progress, or ConnectionBanner without real data or an owning surface. Rating is explicitly inapplicable because current product contracts have no rating field.
- Serialize all tasks that change `package.json`, `pnpm-lock.yaml`, `src/hooks/use-grocery-agent.ts`, `src/components/grocery-chat.tsx`, or `src/app/shared-list.tsx`.
- Suggested commit commands are checkpoints only. **Do not execute any commit or push command unless the user explicitly authorizes it.**

---

## File and Responsibility Map

| Area                 | Files                                                                                                         | Responsibility                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Test foundation      | `package.json`, `vitest.config.mts`, `tsconfig.test.json`, `test/setup.ts`, `test/render.tsx`                 | One Android-native Vitest/RNTL stack and shared Query test renderer                |
| Build/dev client     | `scripts/android-export.mjs`, `package.json`, `.github/workflows/ci.yml`                                      | Deterministic Android bundle gate and installed dev-client scripts                 |
| Query foundation     | `src/lib/query-keys.ts`, `src/components/query-provider.tsx`, `src/components/grocery-copilot-session.tsx`    | Canonical keys, stable client, native focus/online bridge, token lifecycle         |
| Kroger lifecycle     | `src/hooks/use-kroger-connection.ts`, `src/lib/connections.ts`, `src/app/kroger-callback.tsx`                 | Deterministic auth, cancellation, callback polling, cache propagation              |
| Agent lifecycle      | `src/lib/copilot-operation.ts`, `src/hooks/use-grocery-agent.ts`, `src/components/grocery-agent-provider.tsx` | Explicit outcomes, emitted-error observation, synchronous operation ownership      |
| Chat surfaces        | `src/components/grocery-chat-composer.tsx`, `src/components/grocery-chat.tsx`, `src/app/chat-history.tsx`     | Controlled draft, Retry/Dismiss, Chips, RefreshControl, navigation outcomes        |
| Selection primitives | `src/components/ui/checkbox.tsx`, `chip.tsx`, `collapsible.tsx`                                               | Single press target, correct roles/state, composed handlers                        |
| Feedback primitives  | `src/components/ui/avatar.tsx`, `button.tsx`, `badge.tsx`, `skeleton.tsx`                                     | Source recovery, stable names, semantic tokens, reduced motion                     |
| Overlays             | `src/components/ui/action-sheet.tsx`, `alert-dialog.tsx`, `src/app/_layout.tsx`                               | Android Back, modal semantics, focus, keyboard behavior, portal cleanup            |
| Query screens        | `src/app/households.tsx`, `src/app/shared-list.tsx`                                                           | Focus-owned queries, validated submissions, narrow invalidation, recoverable input |
| Cleanup/reuse        | `src/components/brand-mark.tsx`, `src/components/ui/price.tsx`, account/list/state-card files                 | Delete legacy barrel and apply data-supported Badge/Price reuse                    |
| Appearance           | `app.json`, `test/configuration.test.ts`                                                                      | Reachable system dark mode and retained Android resize                             |
| Native acceptance    | Android emulator/device, `adb`, logcat, UI hierarchy                                                          | Verify actual runtime, keyboard, overlays, network, accessibility, motion, themes  |

---

### Task 1: Establish the Native TSX Test Harness and Lock Navigation

**Files:**

- Modify: `apps/grocery-mobile/package.json:6-75`
- Modify: `apps/grocery-mobile/vitest.config.mts:1-14`
- Create: `apps/grocery-mobile/tsconfig.test.json`
- Create: `apps/grocery-mobile/src/styles.d.ts`
- Create: `apps/grocery-mobile/test/setup.ts`
- Create: `apps/grocery-mobile/test/render.tsx`
- Create: `apps/grocery-mobile/src/app/navigation.test.tsx`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces: `createTestQueryClient(): QueryClient`
- Produces: `renderWithQueryClient(ui: ReactElement, client?: QueryClient)`
- Produces: a `typecheck` script that validates production and test TypeScript projects
- Locks: dashboard route `/` and chat route `/chat`

- [ ] **Step 1: Add one compatible native test stack and native runtime dependencies**

Run from the repository root:

```sh
pnpm --filter grocery-mobile exec expo install @react-native-community/netinfo expo-dev-client
pnpm --filter grocery-mobile add -D \
  @babel/core@7.29.7 \
  @react-native/babel-preset@0.86.0 \
  @testing-library/react-native@14.0.1 \
  test-renderer@1.2.0 \
  vitest-native@0.8.0 \
  vite@8.1.5 \
  @types/node@26.1.1
```

Expected: `package.json` and `pnpm-lock.yaml` change; do **not** add Jest, `react-test-renderer`, or `@testing-library/jest-native`.

- [ ] **Step 2: Add a dedicated test TypeScript project**

Create `apps/grocery-mobile/tsconfig.test.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["node", "vitest/globals", "vitest-native/matchers"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "test/**/*.ts", "test/**/*.tsx", "vitest.config.mts"],
  "exclude": ["node_modules", "android", "ios", ".expo"]
}
```

Change `package.json`:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.test.json"
  }
}
```

Create `src/styles.d.ts` so TypeScript 6 accepts the Uniwind side-effect import:

```ts
declare module "*.css";
```

Keep the production TypeScript project isolated by adding `"test"` and `"vitest.config.mts"` to `tsconfig.json#exclude` while retaining the existing `**/*.test.ts` and `**/*.test.tsx` exclusions.

- [ ] **Step 3: Configure Vitest for Android-native TSX**

Replace `vitest.config.mts` with:

```ts
import path from "node:path";
import { reactNative } from "vitest-native";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    reactNative({ engine: "native", platform: "android" }),
    {
      name: "grocery-mobile-test-setup",
      enforce: "post",
      config: () => ({ test: { setupFiles: ["./test/setup.ts"] } }),
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/config.ts", "src/**/*.test.{ts,tsx}"],
    },
  },
});
```

The post-enforced setup plugin is intentional: vitest-native injects its native setup from a pre-enforced plugin, and the Grocery setup must run after it to avoid loading untransformed React Native syntax. `globals: true` allows RNTL 14 to register its own microtask-flushing automatic cleanup.

- [ ] **Step 4: Add deterministic cleanup and a shared Query renderer**

Create `test/setup.ts`:

```ts
import { afterEach } from "vitest";
import { resetAllMocks } from "vitest-native/helpers";

process.env.EXPO_OS = "android";
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  resetAllMocks();
});
```

RNTL's automatic cleanup owns microtask flushing and tree cleanup because Vitest globals are enabled. The explicit hook resets vitest-native dimensions, appearance, native modules, keyboard, AppState, BackHandler, and preset stores after cleanup.

Create `test/render.tsx`:

```tsx
import { render } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
}

export async function renderWithQueryClient(ui: ReactElement, client = createTestQueryClient()) {
  const renderResult = await render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
  return { client, ...renderResult };
}
```

- [ ] **Step 5: Write the failing navigation regression**

Create `src/app/navigation.test.tsx` with mocks for Clerk, CopilotKit, Expo Router, bottom sheet, safe area, and configuration. Assert:

```tsx
expect(stackScreens).toContain("index");
expect(stackScreens).toContain("chat");
expect(homeLinks).toContain("/chat");
expect(chatRoute.type).toBe(GroceryChat);
```

The test must render `RootLayout`, `GroceryHomeScreen`, and `GroceryChatScreen`; it must not snapshot the entire tree.

- [ ] **Step 6: Run the harness smoke tests**

Run:

```sh
pnpm --filter grocery-mobile test -- src/app/navigation.test.tsx
pnpm --filter grocery-mobile test
pnpm --filter grocery-mobile typecheck
```

Expected: navigation test passes, all seven existing logic test files still pass, and both TypeScript projects pass.

- [ ] **Step 7: Suggested checkpoint commit (only with explicit authorization)**

```sh
git add apps/grocery-mobile/package.json apps/grocery-mobile/vitest.config.mts \
  apps/grocery-mobile/tsconfig.test.json apps/grocery-mobile/src/styles.d.ts \
  apps/grocery-mobile/test \
  apps/grocery-mobile/src/app/navigation.test.tsx pnpm-lock.yaml
git commit -m "test(grocery-mobile): add native component harness"
```

---

### Task 2: Add Deterministic Android Export and Dev-Client Commands

**Files:**

- Create: `apps/grocery-mobile/scripts/android-export.mjs`
- Modify: `apps/grocery-mobile/package.json:6-21`
- Modify: `.github/workflows/ci.yml:34-55`
- Test: `apps/grocery-mobile/test/configuration.test.ts`

**Interfaces:**

- Produces: `pnpm --filter grocery-mobile build:android`
- Produces: generic `build` alias consumed by Turbo/CI
- Produces: dev-client Metro on port `8081`

- [ ] **Step 1: Write a failing configuration/build-contract test**

Create `test/configuration.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const app = JSON.parse(readFileSync(join(root, "app.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

describe("native configuration", () => {
  it("exposes deterministic Android build commands", () => {
    expect(pkg.scripts.build).toBe("pnpm build:android");
    expect(pkg.scripts["build:android"]).toBe("node ./scripts/android-export.mjs");
  });

  it("keeps Android keyboard resize", () => {
    expect(app.expo.android.softwareKeyboardLayoutMode).toBe("resize");
  });
});
```

Run and expect failure because `build` and `build:android` do not exist.

- [ ] **Step 2: Create a credential-free export wrapper**

Create `scripts/android-export.mjs`:

```js
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const output = join(process.cwd(), "dist", "android-export");
rmSync(output, { recursive: true, force: true });

const env = {
  ...process.env,
  CI: "1",
  NODE_ENV: "production",
  EXPO_NO_DOTENV: "1",
  EXPO_NO_TELEMETRY: "1",
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k",
  EXPO_PUBLIC_COPILOTKIT_RUNTIME_URL: "https://example.invalid/copilotkit",
  EXPO_PUBLIC_GROCERY_MARKETING_URL: "https://example.invalid/grocery",
};

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "expo",
    "export",
    "--platform",
    "android",
    "--output-dir",
    "dist/android-export",
    "--clear",
    "--max-workers",
    "2",
  ],
  { cwd: process.cwd(), env, stdio: "inherit" },
);

if (result.status !== 0) process.exit(result.status ?? 1);

const metadata = join(output, "metadata.json");
const bundleRoot = join(output, "_expo", "static", "js", "android");

function hasBundle(directory) {
  if (!existsSync(directory)) return false;
  return readdirSync(directory, { withFileTypes: true }).some((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return hasBundle(path);
    return /\.(hbc|js)$/.test(entry.name) && statSync(path).size > 0;
  });
}

if (!existsSync(metadata) || !hasBundle(bundleRoot)) {
  throw new Error("Android export did not contain metadata and a non-empty bundle.");
}

console.log("Verified Grocery Mobile Android export.");
```

- [ ] **Step 3: Add build and dev-client scripts**

Change the relevant scripts in `package.json` to:

```json
{
  "scripts": {
    "start": "concurrently --kill-others --names metro,sync \"expo start --dev-client --port 8081\" \"pnpm _syncPnpm --watch\"",
    "android": "pnpm _syncPnpm && expo run:android --port 8081",
    "build": "pnpm build:android",
    "build:android": "node ./scripts/android-export.mjs"
  }
}
```

Keep the credentialed `build:preview:*`, `build:production:*`, and release scripts unchanged.

- [ ] **Step 4: Make the existing CI build lane describe the real behavior**

Update only the comment above `.github/workflows/ci.yml`'s Turbo build command:

```yaml
# Legacy apps/mobile uses credentialed native release commands, so CI excludes
# it. Grocery Mobile exposes a deterministic Expo export through `build`.
run: pnpm exec turbo build --filter='!agents' --filter='!mobile'
```

Do not change `.github/workflows/android-apk.yml`.

- [ ] **Step 5: Verify deterministic export and Turbo integration**

Run:

```sh
pnpm --filter grocery-mobile test -- test/configuration.test.ts
pnpm --filter grocery-mobile build:android
pnpm exec turbo run build --filter='!agents' --filter='!mobile' --concurrency=2
```

Expected: the wrapper prints `Verified Grocery Mobile Android export`, `dist/android-export/metadata.json` exists, a non-empty Android `.hbc` or `.js` exists, and Turbo shows a real `grocery-mobile#build` command.

- [ ] **Step 6: Prove local dotenv files do not affect export**

Temporarily create a conflicting ignored `.env.production.local`, rerun `build:android`, verify the same compile-only values are used, then delete the temporary file. Never stage it.

- [ ] **Step 7: Suggested checkpoint commit (only with explicit authorization)**

```sh
git add apps/grocery-mobile/scripts/android-export.mjs apps/grocery-mobile/package.json \
  apps/grocery-mobile/test/configuration.test.ts .github/workflows/ci.yml
git commit -m "ci(grocery-mobile): verify Android export"
```

---

### Task 3: Harden the Query Foundation, Canonical Keys, and Clerk Token Session

**Files:**

- Create: `apps/grocery-mobile/src/lib/query-keys.ts`
- Modify: `apps/grocery-mobile/src/components/query-provider.tsx:1-23`
- Modify: `apps/grocery-mobile/src/components/grocery-copilot-session.tsx:13-74`
- Create: `apps/grocery-mobile/src/components/query-provider.test.tsx`
- Create: `apps/grocery-mobile/src/components/grocery-copilot-session.test.tsx`

**Interfaces:**

- Produces: `groceryQueryKeys`
- Produces: `createGroceryQueryClient(): QueryClient`
- Preserves: 20-second token stale time and 30-second refresh interval

- [ ] **Step 1: Add canonical key factories with existing tuple shapes**

Create `src/lib/query-keys.ts`:

```ts
export const groceryQueryKeys = {
  copilotSession: (userId: string | null | undefined) => ["clerk-grocery-token", userId] as const,
  krogerConnection: (userId: string | null | undefined) =>
    ["clerk-user", "kroger-connection", userId] as const,
  krogerCallback: (userId: string | null | undefined) =>
    ["kroger-connection-callback", userId] as const,
  households: (userId: string | null | undefined) => ["grocery-households", userId] as const,
  lists: (userId: string | null | undefined, householdId: string | null | undefined) =>
    ["grocery-lists", userId, householdId] as const,
  list: (userId: string | null | undefined, listId: string | null | undefined) =>
    ["grocery-list", userId, listId] as const,
};
```

- [ ] **Step 2: Write failing QueryProvider tests**

Cover:

```ts
expect(client.getDefaultOptions().queries).toMatchObject({
  retry: 2,
  networkMode: "online",
  refetchOnReconnect: true,
  refetchOnWindowFocus: true,
});
expect(client.getDefaultOptions().mutations).toMatchObject({
  retry: false,
  networkMode: "online",
});
```

Also assert initial `AppState.currentState`, active/background transitions, NetInfo disconnected/unreachable/connected-unknown/connected-reachable mapping, stable client identity, and listener cleanup.

- [ ] **Step 3: Implement the stable native query client and bridges**

Refactor `query-provider.tsx` around:

```tsx
import NetInfo from "@react-native-community/netinfo";
import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";

export function createGroceryQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 2,
        networkMode: "online",
        refetchOnReconnect: true,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false, networkMode: "online" },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createGroceryQueryClient);

  useEffect(() => {
    if (Platform.OS === "web") return;

    focusManager.setFocused(AppState.currentState === "active");
    const appState = AppState.addEventListener("change", (status) => {
      focusManager.setFocused(status === "active");
    });

    let unsubscribeNetInfo = () => undefined;
    onlineManager.setEventListener((setOnline) => {
      unsubscribeNetInfo = NetInfo.addEventListener((state) => {
        setOnline(state.isConnected === true && state.isInternetReachable !== false);
      });
      return unsubscribeNetInfo;
    });

    return () => {
      appState.remove();
      unsubscribeNetInfo();
    };
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

Tests—not production cleanup—reset TanStack singleton manager values after each case.

- [ ] **Step 4: Write failing Clerk token-session tests**

Test initial token loading, `retry: false`, refresh at 30 seconds, no background interval, focus/reconnect refresh, `gcTime: 0`, last-good headers surviving a recoverable refresh error, and manual recovery when no token was ever cached.

- [ ] **Step 5: Apply the canonical key and explicit options**

Update `GroceryCopilotSession` query options:

```ts
queryKey: groceryQueryKeys.copilotSession(userId),
enabled: isLoaded,
retry: false,
staleTime: 20_000,
refetchInterval: 30_000,
refetchIntervalInBackground: false,
refetchOnWindowFocus: true,
refetchOnReconnect: true,
gcTime: 0,
```

Do not replace operation-level `runAuthenticated` token refresh with this cached token.

- [ ] **Step 6: Run focused and native build gates**

```sh
pnpm --filter grocery-mobile test -- \
  src/components/query-provider.test.tsx \
  src/components/grocery-copilot-session.test.tsx
pnpm --filter grocery-mobile typecheck
pnpm --filter grocery-mobile build:android
```

- [ ] **Step 7: Suggested checkpoint commit (only with explicit authorization)**

```sh
git add apps/grocery-mobile/src/lib/query-keys.ts \
  apps/grocery-mobile/src/components/query-provider.tsx \
  apps/grocery-mobile/src/components/query-provider.test.tsx \
  apps/grocery-mobile/src/components/grocery-copilot-session.tsx \
  apps/grocery-mobile/src/components/grocery-copilot-session.test.tsx
git commit -m "feat(grocery-mobile): harden native query lifecycle"
```

---

### Task 4: Preserve Kroger Authorization and Callback Semantics

**Files:**

- Modify: `apps/grocery-mobile/src/hooks/use-kroger-connection.ts:13-104`
- Modify: `apps/grocery-mobile/src/lib/connections.ts`
- Modify: `apps/grocery-mobile/src/lib/connections.test.ts`
- Modify: `apps/grocery-mobile/src/app/kroger-callback.tsx:12-61`
- Create: `apps/grocery-mobile/src/hooks/use-kroger-connection.test.tsx`
- Create: `apps/grocery-mobile/src/app/kroger-callback.test.tsx`

**Interfaces:**

- Produces: `KROGER_CALLBACK_DELAYS_MS`
- Produces: `waitForKrogerConnection(options)`
- Preserves: existing `useKrogerConnection()` public return shape

- [ ] **Step 1: Write failing connect/reconnect tests**

Cover: create versus reauthorize, rotating nonce used once, rapid double authorization, browser cancellation returning `false`, unverified completion as failure, exact-key invalidation only on verified success, and recoverable error reset.

- [ ] **Step 2: Add a synchronous OAuth ownership guard**

Inside `useKrogerConnection`:

```ts
const authorizationInFlightRef = useRef(false);

async function authorize(action: ConnectionAction): Promise<boolean> {
  if (authorizationInFlightRef.current) return false;
  authorizationInFlightRef.current = true;
  try {
    return await completeAuthorization(action);
  } finally {
    authorizationInFlightRef.current = false;
  }
}
```

Use `groceryQueryKeys.krogerConnection(user?.id)`. Invalidate only when `authorize` returns `true`; cancellation and errors must not execute success invalidation.

- [ ] **Step 3: Write failing callback timing tests**

Assert exact waits `[250, 500, 1000, 1500, 2000]`, exactly five reloads, success on reload five, immediate propagation of a thrown reload error, abort handling, and terminal failure only after all five snapshots.

- [ ] **Step 4: Implement the pure polling helper**

In `src/lib/connections.ts`:

```ts
export const KROGER_CALLBACK_DELAYS_MS = [250, 500, 1_000, 1_500, 2_000] as const;

function defaultWait(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function waitForKrogerConnection<
  T extends { externalAccounts: readonly ExternalAccountLike[] },
>({
  reload,
  signal,
  wait = defaultWait,
}: {
  reload: () => Promise<T>;
  signal?: AbortSignal;
  wait?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
}): Promise<T> {
  for (const delay of KROGER_CALLBACK_DELAYS_MS) {
    await wait(delay, signal);
    const user = await reload();
    if (hasKrogerConnection(user)) return user;
  }
  throw new Error("Kroger connection is still being finalized. Please try again.");
}
```

Keep the existing user-facing terminal message if it differs; update the test to that exact text.

- [ ] **Step 5: Use a separate zero-GC callback query**

In `KrogerCallbackScreen`, use:

```ts
queryKey: groceryQueryKeys.krogerCallback(user?.id),
queryFn: ({ signal }) => waitForKrogerConnection({ reload: async () => await user!.reload(), signal }),
retry: false,
gcTime: 0,
refetchOnMount: "always",
refetchOnWindowFocus: false,
refetchOnReconnect: false,
```

On success:

```ts
queryClient.setQueryData(groceryQueryKeys.krogerConnection(user.id), verifiedUser);
router.replace("/");
```

Write the component test to prove cache update occurs before navigation and a remount does not reuse stale callback success.

- [ ] **Step 6: Run focused tests and build**

```sh
pnpm --filter grocery-mobile test -- \
  src/hooks/use-kroger-connection.test.tsx \
  src/lib/connections.test.ts \
  src/app/kroger-callback.test.tsx
pnpm --filter grocery-mobile typecheck
pnpm --filter grocery-mobile build:android
```

- [ ] **Step 7: Suggested checkpoint commit (only with explicit authorization)**

```sh
git add apps/grocery-mobile/src/hooks/use-kroger-connection.ts \
  apps/grocery-mobile/src/hooks/use-kroger-connection.test.tsx \
  apps/grocery-mobile/src/lib/connections.ts \
  apps/grocery-mobile/src/lib/connections.test.ts \
  apps/grocery-mobile/src/app/kroger-callback.tsx \
  apps/grocery-mobile/src/app/kroger-callback.test.tsx
git commit -m "fix(grocery-mobile): preserve Kroger connection lifecycle"
```

---

### Task 5: Serialize Send, Stop, and Retry Around CopilotKit Emitted Errors

**Files:**

- Create: `apps/grocery-mobile/src/lib/copilot-operation.ts`
- Create: `apps/grocery-mobile/src/lib/copilot-operation.test.ts`
- Modify: `apps/grocery-mobile/src/hooks/use-grocery-agent.ts:13-163`
- Create: `apps/grocery-mobile/src/hooks/use-grocery-agent.test.tsx`
- Modify: `apps/grocery-mobile/src/components/grocery-agent-provider.tsx`

**Interfaces:**

- Produces: `GroceryOperationOutcome`
- Produces: `GroceryAgentFailure`
- Produces: controller `isRunning` and `isStreaming`
- Produces: `send`, `retry`, and `stop` returning explicit outcomes

- [ ] **Step 1: Define the discriminated contracts**

In `use-grocery-agent.ts` or a shared type export:

```ts
export type GroceryOperationOutcome =
  | { status: "success" }
  | { status: "stopped"; reason: "cancelled" | "busy" | "noop" }
  | { status: "failed"; error: Error; message: string };

export type GroceryAgentFailure =
  | { operation: "send" | "retry"; message: string; input: string }
  | { operation: "open-thread"; message: string; threadId: string };
```

The controller exposes one `failure` source of truth; `error` and `failedInput` are derived compatibility values.

- [ ] **Step 2: Write a pure emitted-error observer test**

Test that the observer:

- subscribes immediately before invocation;
- filters by the Grocery agent ID;
- accepts operation-specific fatal codes;
- retains only the first matching error;
- ignores stop-induced emissions;
- unsubscribes in `finally`;
- returns the emitted error even when the invocation resolves successfully.

- [ ] **Step 3: Implement the scoped observer**

Create `src/lib/copilot-operation.ts`:

```ts
export type SubscribeToCopilotErrors = (
  onError: (error: unknown, context?: { agentId?: string; code?: string }) => void,
) => () => void;

export async function observeCopilotOperation({
  subscribe,
  agentId,
  fatalCodes,
  isStopped,
  run,
}: {
  subscribe: SubscribeToCopilotErrors;
  agentId: string;
  fatalCodes: ReadonlySet<string>;
  isStopped: () => boolean;
  run: () => Promise<unknown>;
}): Promise<Error | null> {
  let emitted: Error | null = null;
  const unsubscribe = subscribe((error, context) => {
    if (isStopped() || context?.agentId !== agentId || !context.code) return;
    if (!fatalCodes.has(context.code) || emitted) return;
    emitted = error instanceof Error ? error : new Error(String(error));
  });
  try {
    await run();
    return emitted;
  } finally {
    unsubscribe();
  }
}
```

Adapt the hook's actual `copilotkit.subscribe({ onError })` API into this small callback interface.

- [ ] **Step 4: Write failing controller tests for double Send and emitted failure**

Use a deferred Clerk token. Assert two synchronous sends call `getToken`, `addMessage`, and `runAgent` once. Emit a fatal CopilotKit event while `runAgent` resolves; assert failed outcome, rollback, retained input, and no `onRunComplete`.

- [ ] **Step 5: Add synchronous operation ownership before any await**

Use:

```ts
type ActiveGroceryOperation = {
  id: number;
  kind: "send" | "retry" | "new-chat" | "open-thread";
  stopRequested: boolean;
  sdkStarted: boolean;
  promise: Promise<GroceryOperationOutcome>;
};
```

Install the ref before `runAuthenticated`. A second send/retry returns `{ status: "stopped", reason: "busy" }`. In `finally`, clear state only when the same operation ID still owns the ref.

- [ ] **Step 6: Refactor Send through one `runMessage` helper**

The helper must:

1. trim and reject empty input with stopped/noop;
2. snapshot messages, state, and pending interrupts;
3. acquire the synchronous operation slot;
4. await a fresh Clerk token through `runAuthenticated`;
5. recheck `stopRequested` before adding the user message;
6. observe fatal emitted errors around `runAgent`;
7. on failure, restore the snapshot and retain `{ operation, message, input }`;
8. on stop, retain submitted/partial output and clear failure;
9. call `onRunComplete` only on confirmed success.

- [ ] **Step 7: Write and implement Stop/Retry tests**

Stop during token acquisition must prevent `addMessage` and `runAgent`. Stop during SDK execution must call `stopAgent` once, retain partial messages, ignore abort emissions, and return stopped/cancelled. Retry must reuse the retained input exactly once and reject a rapid second Retry as busy.

- [ ] **Step 8: Expose the stable context contract**

Update `GroceryAgentProvider` to expose:

```ts
isRunning: boolean;
isStreaming: boolean;
failure: GroceryAgentFailure | null;
error: string;
failedInput: string | null;
clearError(): void;
send(content: string): Promise<GroceryOperationOutcome>;
retry(): Promise<GroceryOperationOutcome>;
stop(): Promise<GroceryOperationOutcome>;
```

Keep existing thread/suggestion APIs intact.

- [ ] **Step 9: Run focused tests**

```sh
pnpm --filter grocery-mobile test -- \
  src/lib/copilot-operation.test.ts \
  src/hooks/use-grocery-agent.test.tsx
pnpm --filter grocery-mobile typecheck
```

- [ ] **Step 10: Suggested checkpoint commit (only with explicit authorization)**

```sh
git add apps/grocery-mobile/src/lib/copilot-operation.ts \
  apps/grocery-mobile/src/lib/copilot-operation.test.ts \
  apps/grocery-mobile/src/hooks/use-grocery-agent.ts \
  apps/grocery-mobile/src/hooks/use-grocery-agent.test.tsx \
  apps/grocery-mobile/src/components/grocery-agent-provider.tsx
git commit -m "fix(grocery-mobile): serialize agent send lifecycle"
```

---

### Task 6: Serialize New Chat and Fully Roll Back Failed Thread Replay

**Files:**

- Modify: `apps/grocery-mobile/src/hooks/use-grocery-agent.ts`
- Modify: `apps/grocery-mobile/src/hooks/use-grocery-agent.test.tsx`
- Modify: `apps/grocery-mobile/src/components/grocery-agent-provider.tsx`

**Interfaces:**

- Extends: `GroceryOperationOutcome`
- Produces: `startNewChat()` and `openThread(threadId)` with replacement-operation semantics

- [ ] **Step 1: Write failing active-run replacement tests**

Assert New Chat reserves the coordinator, marks an active send/retry stopped, calls `stopAgent` only after SDK execution has started, awaits the old operation, resets thread/messages/state, and cannot be detached by the old operation's stale `finally`.

- [ ] **Step 2: Write failing full history rollback tests**

Snapshot and verify restoration of:

```ts
{
  threadId,
  messages: [...agent.messages],
  state: structuredClone(agent.state),
  pendingInterrupts: [...agent.pendingInterrupts],
}
```

A resolved emitted connect failure must restore all four. Retrying the same failed target must start from empty target state and succeed without stale data.

- [ ] **Step 3: Implement replacement-operation ownership**

`startNewChat` and `openThread` synchronously reserve the shared operation ref. If another transition already owns it, return stopped/busy. If a send/retry owns it, mark it stopped, call `stopAgent` only when `sdkStarted`, await its promise, then reset or replay.

- [ ] **Step 4: Unconditionally clear target replay state**

Before every explicit `connectAgent` call:

```ts
agent.threadId = targetThreadId;
agent.setMessages([]);
agent.setState({});
agent.setPendingInterrupts([]);
```

Observe connect-fatal events. Restore the complete snapshot on failed or stopped outcomes. Expose an `open-thread` failure only for genuine failure.

- [ ] **Step 5: Reload suggestions only after successful New Chat**

In `GroceryAgentProvider`:

```ts
const outcome = await controller.startNewChat();
if (outcome.status === "success") await suggestions.reloadSuggestions();
return outcome;
```

- [ ] **Step 6: Run sequential lifecycle tests**

```sh
pnpm --filter grocery-mobile test -- src/hooks/use-grocery-agent.test.tsx
pnpm --filter grocery-mobile typecheck
```

- [ ] **Step 7: Suggested checkpoint commit (only with explicit authorization)**

```sh
git add apps/grocery-mobile/src/hooks/use-grocery-agent.ts \
  apps/grocery-mobile/src/hooks/use-grocery-agent.test.tsx \
  apps/grocery-mobile/src/components/grocery-agent-provider.tsx
git commit -m "fix(grocery-mobile): rollback failed thread transitions"
```

---

### Task 7: Correct Checkbox, Chip, and Collapsible Interaction Semantics

**Files:**

- Modify: `apps/grocery-mobile/src/components/ui/checkbox.tsx:1-58`
- Modify: `apps/grocery-mobile/src/components/ui/chip.tsx:39-95`
- Modify: `apps/grocery-mobile/src/components/ui/collapsible.tsx:6-58`
- Create: corresponding `.test.tsx` files

**Interfaces:**

- Preserves public Checkbox and Chip APIs
- Produces one authoritative Chip role and checked/selected mapping
- Preserves controlled/uncontrolled Collapsible behavior

- [ ] **Step 1: Fetch reviewed upstream sources before replacing local primitives**

Run:

```sh
pnpm dlx shadcn@latest add @aniui/checkbox --dry-run
pnpm dlx shadcn@latest add @aniui/chip --dry-run
pnpm dlx shadcn@latest add @aniui/collapsible --dry-run
```

If the CLI lacks `--dry-run`, generate into a temporary directory outside the repository or fetch the registry JSON directly. Use those reviewed files as the starting implementation for each local primitive, then normalize imports, semantic tokens, public APIs, and the tests below. Never run `aniui init` or generate directly over unrelated reviewed files.

- [ ] **Step 2: Write failing Checkbox tests**

Assert one checkbox accessibility node, one state transition per press, and no transition while disabled.

- [ ] **Step 3: Make Checkbox Root the only press target**

Remove `asChild` and the nested `Pressable`. Render the visual box as `View` within `CheckboxPrimitive.Root`, retaining `Indicator`, checked state, disabled state, and current class variants.

- [ ] **Step 4: Write failing Chip role/state tests**

Test a default button Chip and selected radio Chip. Assert no conflicting role props and `checked: true` for radio/checkbox roles.

- [ ] **Step 5: Normalize one authoritative Chip role**

Use:

```ts
const resolvedRole = role ?? accessibilityRole ?? "button";
const resolvedState =
  resolvedRole === "radio" || resolvedRole === "checkbox"
    ? { ...accessibilityState, checked: selected }
    : { ...accessibilityState, selected };
```

Emit only one role prop. Preserve caller state fields.

- [ ] **Step 6: Write and fix Collapsible handler-composition tests**

Destructure caller `onPress`, toggle internal state, then call the caller handler:

```ts
onPress={(event) => {
  setOpen(!open);
  onPress?.(event);
}}
```

Do not let a trailing props spread overwrite the internal toggle. Preserve `accessibilityState.expanded` and controlled behavior.

- [ ] **Step 7: Run focused tests**

```sh
pnpm --filter grocery-mobile test -- \
  src/components/ui/checkbox.test.tsx \
  src/components/ui/chip.test.tsx \
  src/components/ui/collapsible.test.tsx
```

- [ ] **Step 8: Suggested checkpoint commit (only with explicit authorization)**

```sh
git add apps/grocery-mobile/src/components/ui/checkbox.tsx \
  apps/grocery-mobile/src/components/ui/checkbox.test.tsx \
  apps/grocery-mobile/src/components/ui/chip.tsx \
  apps/grocery-mobile/src/components/ui/chip.test.tsx \
  apps/grocery-mobile/src/components/ui/collapsible.tsx \
  apps/grocery-mobile/src/components/ui/collapsible.test.tsx
git commit -m "fix(grocery-mobile): converge selection primitives"
```

---

### Task 8: Correct Avatar, Button, Badge, and Skeleton Feedback Behavior

**Files:**

- Modify: `src/components/ui/avatar.tsx`
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/badge.tsx`
- Modify: `src/components/ui/skeleton.tsx`
- Create: corresponding `.test.tsx` files

**Interfaces:**

- Preserves public component APIs
- Button explicit `accessibilityLabel` always wins
- Skeleton remains a visible static placeholder under reduced motion

- [ ] **Step 1: Replace from reviewed AniUI registry sources**

Fetch Avatar, Button, Badge, and Skeleton registry sources into a temporary directory. Replace each local implementation from that source first, then normalize imports, semantic tokens, existing public APIs, and the required behavior tests. Do not retain the current bespoke implementation as the base and do not run `aniui init`.

- [ ] **Step 2: Write failing Avatar recovery test**

Render source A, trigger `onError`, rerender source B, and assert source B renders rather than stale fallback.

- [ ] **Step 3: Track failure by source**

Use a source-specific key instead of a permanent boolean:

```ts
const sourceKey = typeof src === "string" ? src : JSON.stringify(src);
const [failedSource, setFailedSource] = useState<string | null>(null);
const failed = failedSource === sourceKey;
```

Set `failedSource` on image error. A new source key is not failed.

- [ ] **Step 4: Write failing loading-name and destructive-token tests**

Cover string children, nested Text children, busy copy changes, explicit label precedence, `busy/disabled` state, and semantic destructive classes.

- [ ] **Step 5: Preserve the last non-loading accessible name**

Add recursive text extraction and a ref:

```ts
function textFromChildren(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : isValidElement(child)
          ? textFromChildren(child.props.children)
          : "",
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

const derivedLabel = textFromChildren(children);
const idleLabelRef = useRef(derivedLabel);
if (!loading && derivedLabel) idleLabelRef.current = derivedLabel;
const loadingLabel = accessibilityLabel ?? idleLabelRef.current ?? undefined;
```

Apply `loadingLabel` only when loading unless an explicit label is already supplied. Merge caller accessibility state with `busy` and `disabled`.

- [ ] **Step 6: Use semantic destructive foregrounds**

Replace `text-white` with `text-destructive-foreground` in Button and Badge. Remove the Button `dark:bg-destructive/60` override so the configured token pair remains accessible.

- [ ] **Step 7: Write and implement reduced-motion Skeleton behavior**

Use `useReducedMotion()`. When true, set a static visible opacity and do not call `withRepeat`. When false, preserve the pulse. Cancel animation on unmount or preference change.

- [ ] **Step 8: Run focused tests and Android export**

```sh
pnpm --filter grocery-mobile test -- \
  src/components/ui/avatar.test.tsx \
  src/components/ui/button.test.tsx \
  src/components/ui/badge.test.tsx \
  src/components/ui/skeleton.test.tsx
pnpm --filter grocery-mobile build:android
```

- [ ] **Step 9: Suggested checkpoint commit (only with explicit authorization)**

```sh
git add apps/grocery-mobile/src/components/ui/avatar* \
  apps/grocery-mobile/src/components/ui/button* \
  apps/grocery-mobile/src/components/ui/badge* \
  apps/grocery-mobile/src/components/ui/skeleton*
git commit -m "fix(grocery-mobile): harden feedback primitives"
```

---

### Task 9: Harden Overlays and Remove Dead Portal Infrastructure

**Files:**

- Modify: `src/components/ui/action-sheet.tsx`
- Modify: `src/components/ui/alert-dialog.tsx`
- Create: overlay tests
- Modify: `src/app/_layout.tsx`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Keeps ActionSheet ref-driven
- Keeps AlertDialog controlled and backed by native Modal
- Removes `@rn-primitives/portal` only after proving no consumer remains

- [ ] **Step 1: Replace overlay primitives from reviewed upstream sources and write behavior tests**

Fetch the AniUI ActionSheet and AlertDialog registry sources into a temporary directory and replace the local implementations from those sources first. Normalize them to the existing ref-driven/controlled APIs, semantic tokens, and the behavior contracts below. Write tests for backdrop, pan, Cancel, action, Android Back, `adjustResize`, dialog/modal semantics, first-action focus, focus restoration, cleanup, and exactly-once `onDismiss`.

- [ ] **Step 2: Add Android Back and modal semantics**

Track whether the sheet is presented. Install `BackHandler.addEventListener("hardwareBackPress", ...)` only while open; dismiss and return `true`. Set:

```tsx
<BottomSheetModal android_keyboardInputMode="adjustResize" ...>
  <BottomSheetView
    role="dialog"
    aria-modal
    accessibilityViewIsModal
  >
```

Focus the first action after presentation and restore focus to the caller-provided trigger ref after dismissal. Do not add a second controlled-open API.

- [ ] **Step 3: Write failing AlertDialog tests**

Assert native `Modal.onRequestClose` calls `onOpenChange(false)` once and content exposes `role="alertdialog"`, `aria-modal`, and `accessibilityViewIsModal`.

- [ ] **Step 4: Harden AlertDialog without replacing native Modal**

Keep its existing controlled API and Android Back path. Add modal semantics to `AlertDialogContent`; preserve action/cancel behavior.

- [ ] **Step 5: Prove the RN Primitives portal is unused**

Run:

```sh
rg -n '@rn-primitives/portal|PortalHost' apps/grocery-mobile/src
```

Expected before cleanup: only `_layout.tsx` imports/uses `PortalHost`; no final UI primitive imports the portal package.

- [ ] **Step 6: Remove dead portal infrastructure**

Remove `PortalHost` from `_layout.tsx` and `@rn-primitives/portal` from `package.json` with:

```sh
pnpm --filter grocery-mobile remove @rn-primitives/portal
```

Retain `GestureHandlerRootView` and `BottomSheetModalProvider`.

- [ ] **Step 7: Run overlay, type, and native build gates**

```sh
pnpm --filter grocery-mobile test -- \
  src/components/ui/action-sheet.test.tsx \
  src/components/ui/alert-dialog.test.tsx
pnpm --filter grocery-mobile typecheck
pnpm --filter grocery-mobile build:android
```

- [ ] **Step 8: Suggested checkpoint commit (only with explicit authorization)**

```sh
git add apps/grocery-mobile/src/components/ui/action-sheet* \
  apps/grocery-mobile/src/components/ui/alert-dialog* \
  apps/grocery-mobile/src/app/_layout.tsx \
  apps/grocery-mobile/package.json pnpm-lock.yaml
git commit -m "fix(grocery-mobile): simplify overlay provider stack"
```

---

### Task 10: Harden Households Query Ownership and Form Mutations

**Files:**

- Modify: `src/app/households.tsx`
- Create: `src/app/households.test.tsx`

**Interfaces:**

- Consumes: `groceryQueryKeys.households(userId)`
- Produces: screen-local `submitCreateHousehold` and `submitJoinHousehold`

- [ ] **Step 1: Write failing route-focus and form tests**

Test focused polling every 30 seconds, no polling/refetch while blurred, immediate eligibility on focus, pull-to-refresh, whitespace no-ops from keyboard and button, uppercase invite normalization, synchronous duplicate prevention, exact invalidation, success-only clearing, and error/input retention.

- [ ] **Step 2: Own query enablement with route focus**

Track focus through `useFocusEffect` and set:

```ts
enabled: isFocused && Boolean(userId),
refetchInterval: isFocused ? 30_000 : false,
```

Keep pull-to-refresh explicit. Verify global foreground/reconnect events do not refetch a blurred screen observer.

- [ ] **Step 3: Add synchronous submit guards shared by keyboard and button**

Use one ref per write operation. Each handler trims once, validates nonblank/resources/pending state, calls one `mutateAsync`, clears only on success, and leaves input on error. The invite handler uppercases after trimming.

```ts
async function submitJoinHousehold() {
  const code = inviteCode.trim().toUpperCase();
  if (!code || joinInFlight.current || joinHousehold.isPending) return;
  joinInFlight.current = true;
  try {
    await joinHousehold.mutateAsync(code);
    setInviteCode("");
  } finally {
    joinInFlight.current = false;
  }
}
```

Pass the same function to `onSubmitEditing` and `Button.onPress`.

- [ ] **Step 4: Use only the canonical current-user key**

Replace all household query/invalidation literals with `groceryQueryKeys.households(userId)`. Do not cache Clerk tokens or change `createHouseholdApi`; every attempt must continue acquiring a fresh token through `runAuthenticated`.

- [ ] **Step 5: Run focused tests**

```sh
pnpm --filter grocery-mobile test -- src/app/households.test.tsx
pnpm --filter grocery-mobile typecheck
```

- [ ] **Step 6: Suggested checkpoint commit (only with explicit authorization)**

```sh
git add apps/grocery-mobile/src/app/households.tsx \
  apps/grocery-mobile/src/app/households.test.tsx
git commit -m "fix(grocery-mobile): validate household mutations"
```

---

### Task 11: Harden Shared List Queries, Mutations, Radio Chips, and Empty States

**Files:**

- Modify: `src/app/shared-list.tsx`
- Create: `src/app/shared-list.test.tsx`

**Interfaces:**

- Consumes: canonical collection/detail keys, fixed Chip, fixed Checkbox, EmptyState
- Produces: screen-local `submitCreateList` and `submitAddItem`

- [ ] **Step 1: Write failing screen tests**

Cover focus-owned collection/detail queries, list selection, refresh, blank/no-resource/pending guards, exact create-list cache seeding, detail-only item invalidation, success/failure input behavior, radio semantics, one checkbox mutation per press, and both EmptyState branches.

- [ ] **Step 2: Disable both queries while the route is blurred**

Use `useFocusEffect`-owned state. Collection and detail query `enabled` values must include route focus. Preserve the selected list ID and immediately refetch stale data when focus returns.

- [ ] **Step 3: Centralize validated list/item handlers**

Whitespace list titles and item names are no-ops. Do not send the placeholder-derived default title; keep that text as presentation only. Use synchronous refs and clear inputs only after confirmed success.

- [ ] **Step 4: Keep cache writes narrow**

On create success, seed only:

```ts
groceryQueryKeys.lists(userId, householdId);
groceryQueryKeys.list(userId, created.id);
```

On item mutation success, invalidate only `groceryQueryKeys.list(userId, listId)`.

- [ ] **Step 5: Use radio semantics and shared EmptyState**

Set list selectors to `role="radio"`; rely on Chip to map `selected` to checked state. Wrap the list-selector region in a practical radio-group semantic container. Replace the active-list/no-items branch and no-list branch with EmptyState compositions while retaining the creation/add forms.

- [ ] **Step 6: Run focused tests and native build**

```sh
pnpm --filter grocery-mobile test -- src/app/shared-list.test.tsx
pnpm --filter grocery-mobile typecheck
pnpm --filter grocery-mobile build:android
```

- [ ] **Step 7: Suggested checkpoint commit (only with explicit authorization)**

```sh
git add apps/grocery-mobile/src/app/shared-list.tsx \
  apps/grocery-mobile/src/app/shared-list.test.tsx
git commit -m "fix(grocery-mobile): harden shared list mutations"
```

---

### Task 12: Integrate Chat Lifecycle UX, Starter Chips, and Shared History Refresh

**Files:**

- Create: `src/components/grocery-chat-composer.tsx`
- Create: `src/components/grocery-chat-composer.test.tsx`
- Modify: `src/components/grocery-chat.tsx`
- Create/Modify: `src/components/grocery-chat.test.tsx`
- Create: `src/components/ui/prompt-input.test.tsx`
- Modify: `src/app/chat-history.tsx`
- Create: `src/app/chat-history.test.tsx`

**Interfaces:**

- Consumes: explicit controller outcomes, fixed Chip, ActionSheet focus contract, shared RefreshControl
- Produces: controlled `GroceryChatComposer`

- [ ] **Step 1: Extract a controlled composer with no message-renderer changes**

Use this public contract:

```ts
export type GroceryChatComposerProps = {
  value: string;
  isRunning: boolean;
  onChangeText(value: string): void;
  onSend(content: string): Promise<GroceryOperationOutcome>;
  onStop(): Promise<GroceryOperationOutcome>;
};
```

The composer clears optimistically after accepting nonblank input, restores only on failed outcome, and remains cleared for success, stopped, busy, or noop.

- [ ] **Step 2: Write failing outcome/recovery tests**

Test failed restoration, Stop non-restoration, rapid Retry exclusion, separate labeled Retry and Dismiss actions, Dismiss preserving draft, and lifecycle `isRunning` beginning before SDK `isStreaming`.

- [ ] **Step 3: Route every send entry through one outcome-aware function**

Composer sends, starter suggestions, and cart commands use the same `sendMessage(content)` owner in `GroceryChat`. Keep `isStreaming` for NativeMarkdown/reasoning/tool rendering and use lifecycle `isRunning` for controls and PromptInput Stop routing.

- [ ] **Step 4: Replace the Pressable alert with explicit recovery controls**

Render a destructive Alert with:

```tsx
<Button accessibilityLabel="Retry failed message" onPress={() => void retryFailedMessage()}>
  Retry
</Button>
<Button
  accessibilityLabel="Dismiss chat error"
  variant="ghost"
  onPress={clearError}
>
  Dismiss
</Button>
```

Show Retry only when `failedInput` exists. Do not make the entire alert an unlabeled press target.

- [ ] **Step 5: Lock PromptInput's already-correct stop routing**

Write `prompt-input.test.tsx`: with `streaming={true}` and empty text, the control remains enabled, is named `Stop generating`, invokes only `onStop`, and never invokes `onSend`.

- [ ] **Step 6: Replace starter Buttons with wrapping Chips**

Use a `flex-row flex-wrap gap-2` container. Each Chip keeps the suggestion title as its accessible name and sends the unchanged `suggestion.message`. Loading suggestions use Skeleton; do not add a Chip loading API.

- [ ] **Step 7: Adapt New Chat and history replay to explicit outcomes**

New Chat closes/reloads only on success. Chat History uses a synchronous `openingRef`, navigates only for `{ status: "success" }`, and restores row availability after failed/stopped outcomes.

- [ ] **Step 8: Use the shared RefreshControl in Chat History**

Pass:

```tsx
refreshControl={
  <RefreshControl refreshing={threadsLoading} onRefresh={refetchThreads} />
}
```

Remove direct FlatList `refreshing` and `onRefresh` props.

- [ ] **Step 9: Preserve custom message rendering**

Do not change `GroceryMessage`, NativeMarkdown, ReasoningSection, ToolCallSection, MessageScroller, GroceryStateCard routing, or Kroger actions except compile adaptations required by the stable controller interfaces.

- [ ] **Step 10: Run chat tests**

```sh
pnpm --filter grocery-mobile test -- \
  src/components/grocery-chat-composer.test.tsx \
  src/components/grocery-chat.test.tsx \
  src/components/ui/prompt-input.test.tsx \
  src/app/chat-history.test.tsx
pnpm --filter grocery-mobile typecheck
pnpm --filter grocery-mobile build:android
```

- [ ] **Step 11: Suggested checkpoint commit (only with explicit authorization)**

```sh
git add apps/grocery-mobile/src/components/grocery-chat-composer* \
  apps/grocery-mobile/src/components/grocery-chat* \
  apps/grocery-mobile/src/components/ui/prompt-input.test.tsx \
  apps/grocery-mobile/src/app/chat-history*
git commit -m "feat(grocery-mobile): finish chat lifecycle UX"
```

---

### Task 13: Move BrandMark and Delete the Legacy UI Barrel

**Files:**

- Create: `src/components/brand-mark.tsx`
- Modify imports only: `grocery-header.tsx`, `configuration-error.tsx`, `sign-in-screen.tsx`
- Delete: `src/components/ui.tsx`

**Interfaces:**

- Preserves the current `BrandMark` size API exactly

- [ ] **Step 1: Copy BrandMark unchanged to the dedicated module**

Move the existing component body into `src/components/brand-mark.tsx`; do not change asset, size, style, or accessibility behavior.

- [ ] **Step 2: Update exactly three imports**

Use:

```ts
import { BrandMark } from "@/components/brand-mark";
```

Do not alter SignInScreen's Clerk state machine or GroceryHeader navigation behavior.

- [ ] **Step 3: Delete the legacy file and prove no import remains**

```sh
test ! -e apps/grocery-mobile/src/components/ui.tsx
! rg -n 'from "@/components/ui"' apps/grocery-mobile/src
```

- [ ] **Step 4: Run type and navigation checks**

```sh
pnpm --filter grocery-mobile typecheck
pnpm --filter grocery-mobile test -- src/app/navigation.test.tsx
```

- [ ] **Step 5: Suggested checkpoint commit (only with explicit authorization)**

```sh
git add apps/grocery-mobile/src/components/brand-mark.tsx \
  apps/grocery-mobile/src/components/grocery-header.tsx \
  apps/grocery-mobile/src/components/configuration-error.tsx \
  apps/grocery-mobile/src/components/sign-in-screen.tsx \
  apps/grocery-mobile/src/components/ui.tsx
git commit -m "refactor(grocery-mobile): isolate BrandMark"
```

---

### Task 14: Apply Data-Supported Badge and Price Reuse

**Files:**

- Create: `src/components/ui/price.tsx`
- Create: `src/components/ui/price.test.tsx`
- Modify: `src/app/account.tsx`
- Modify: `src/components/grocery-state-card.tsx`
- Modify: `src/app/list.tsx`
- Create: focused commerce tests

**Interfaces:**

- Produces: `PriceProps`
- Uses: numeric values only; no Rating or fabricated currency fields

- [ ] **Step 1: Review the AniUI Price source**

Run a registry dry-run/diff. Normalize the reviewed source to shared Text, semantic classes, and existing aliases. Do not install Rating.

- [ ] **Step 2: Add the Price contract**

```ts
export type PriceProps = {
  amount: number;
  currency?: string;
  locale?: string;
  prefix?: string;
  strikethrough?: boolean;
  className?: string;
  textClassName?: string;
};
```

Default to USD, format with `Intl.NumberFormat`, render through shared Text, and make important output selectable. Use `price !== undefined`, not truthiness, so zero remains valid.

- [ ] **Step 3: Write Price and commerce reuse tests**

Assert `$3.50`, zero value, optional prefix/strikethrough, Account and GroceryStateCard status through Badge, custom KrogerProductImage/actions retained, and no Rating node.

- [ ] **Step 4: Replace only supported one-off presentation**

- Account: use Badge for `Connected` and `Action needed`.
- GroceryStateCard: use Badge for connection status and Price for standalone subtotal.
- Grocery List: use Price for standalone subtotal/unit-price rows where it removes duplicate currency formatting.
- Keep sentence-like detail text as Text; do not force every inline amount into a component.
- Do not broadly adopt CardHeader/CardContent when it only changes composition style.

- [ ] **Step 5: Run commerce tests**

```sh
pnpm --filter grocery-mobile test -- \
  src/components/ui/price.test.tsx \
  src/app/account.test.tsx \
  src/components/grocery-state-card.test.tsx
pnpm --filter grocery-mobile typecheck
```

- [ ] **Step 6: Suggested checkpoint commit (only with explicit authorization)**

```sh
git add apps/grocery-mobile/src/components/ui/price* \
  apps/grocery-mobile/src/app/account* \
  apps/grocery-mobile/src/components/grocery-state-card* \
  apps/grocery-mobile/src/app/list.tsx
git commit -m "refactor(grocery-mobile): reuse commerce primitives"
```

---

### Task 15: Enable System Appearance and Verify Semantic Dark Mode

**Files:**

- Modify: `apps/grocery-mobile/app.json:9`
- Modify: `apps/grocery-mobile/test/configuration.test.ts`

**Interfaces:**

- Keeps `softwareKeyboardLayoutMode: "resize"`
- Makes existing light/dark semantic tokens reachable

- [ ] **Step 1: Extend the failing configuration test**

Add:

```ts
expect(app.expo.userInterfaceStyle).toBe("automatic");
expect(app.expo.android.softwareKeyboardLayoutMode).toBe("resize");
```

Run and expect failure on `userInterfaceStyle`.

- [ ] **Step 2: Follow the system theme**

Change only:

```json
"userInterfaceStyle": "automatic"
```

Do not add theme tokens or a settings screen; existing `global.css` tokens and `StatusBar style="auto"` remain authoritative.

- [ ] **Step 3: Run appearance/token/build checks**

```sh
pnpm --filter grocery-mobile test -- \
  test/configuration.test.ts \
  src/components/ui/button.test.tsx \
  src/components/ui/badge.test.tsx
pnpm --filter grocery-mobile build:android
```

- [ ] **Step 4: Suggested checkpoint commit (only with explicit authorization)**

```sh
git add apps/grocery-mobile/app.json apps/grocery-mobile/test/configuration.test.ts
git commit -m "feat(grocery-mobile): follow system appearance"
```

---

### Task 16: Complete Query-Key Migration and Automated Verification

**Files:**

- Inspect all target query consumers and tests
- No planned production changes beyond missing migrations/fixes discovered by checks

**Interfaces:**

- Verifies every target uses `groceryQueryKeys`
- Verifies TSX tests are both executed and typechecked

- [ ] **Step 1: Prove no target inline key literals remain**

Run targeted searches for the six tuple prefixes and inspect every result:

```sh
rg -n 'clerk-grocery-token|kroger-connection-callback|grocery-households|grocery-lists|grocery-list|clerk-user.*kroger-connection' \
  apps/grocery-mobile/src
```

Expected: tuple definitions exist only in `src/lib/query-keys.ts`; consumers call key factories.

- [ ] **Step 2: Run focused suites in dependency order**

```sh
pnpm --filter grocery-mobile test -- \
  src/app/navigation.test.tsx \
  src/components/query-provider.test.tsx \
  src/components/grocery-copilot-session.test.tsx \
  src/hooks/use-kroger-connection.test.tsx \
  src/lib/connections.test.ts \
  src/app/kroger-callback.test.tsx \
  src/lib/copilot-operation.test.ts \
  src/hooks/use-grocery-agent.test.tsx \
  src/components/ui/checkbox.test.tsx \
  src/components/ui/chip.test.tsx \
  src/components/ui/collapsible.test.tsx \
  src/components/ui/avatar.test.tsx \
  src/components/ui/button.test.tsx \
  src/components/ui/badge.test.tsx \
  src/components/ui/skeleton.test.tsx \
  src/components/ui/action-sheet.test.tsx \
  src/components/ui/alert-dialog.test.tsx \
  src/app/households.test.tsx \
  src/app/shared-list.test.tsx \
  src/components/grocery-chat-composer.test.tsx \
  src/components/grocery-chat.test.tsx \
  src/components/ui/prompt-input.test.tsx \
  src/app/chat-history.test.tsx \
  src/components/ui/price.test.tsx \
  test/configuration.test.ts
```

- [ ] **Step 3: Run the package gates**

```sh
pnpm --filter grocery-mobile typecheck
pnpm --filter grocery-mobile lint
pnpm --filter grocery-mobile test
pnpm --filter grocery-mobile fmt:check
pnpm --filter grocery-mobile build:android
```

Expected: all commands exit 0; the Android wrapper verifies metadata and a non-empty bundle.

- [ ] **Step 4: Run diagnostics without corrupting the project**

```sh
pnpm --dir apps/grocery-mobile dlx expo-doctor@1.20.1
pnpm --dir apps/grocery-mobile dlx @aniui/cli@0.5.0 doctor || true
```

Record AniUI CLI output. Ignore only the already-established hardcoded-layout failures; any real dependency, registry, or source error is actionable. Do not run `aniui init` or add duplicate root files.

- [ ] **Step 5: Run the CI-equivalent build lane and repository gates**

```sh
pnpm exec turbo run build --filter='!agents' --filter='!mobile' --concurrency=2
pnpm check
pnpm test
```

- [ ] **Step 6: Inspect the final diff**

```sh
git diff --check
git status --short
git diff --stat
```

Confirm no generated `android/`, `ios/`, export artifacts, `.env*`, screenshots with account data, or temporary hierarchy/log files are staged.

---

### Task 17: Perform Installed Android and ADB Acceptance

**Files/Artifacts:**

- Generated/ignored Android project and dev-client APK
- Temporary local logcat and UI hierarchy files
- No planned source changes unless verification reveals a defect

**Interfaces:**

- Package: `dev.agents.grocery`
- Activity: `dev.agents.grocery/.MainActivity`
- Scheme: `grocery-agent`
- Preferred AVD: `Pixel_API_35`

- [ ] **Step 1: Capture the original emulator state before changing it**

Record:

```sh
adb devices -l
adb -s emulator-5554 shell cmd uimode night
adb -s emulator-5554 shell cmd connectivity airplane-mode
adb -s emulator-5554 shell settings get global window_animation_scale
adb -s emulator-5554 shell settings get global transition_animation_scale
adb -s emulator-5554 shell settings get global animator_duration_scale
adb -s emulator-5554 shell settings get secure enabled_accessibility_services
adb -s emulator-5554 shell settings get secure accessibility_enabled
adb -s emulator-5554 shell settings get secure touch_exploration_enabled
```

Store exact values for finally-style restoration. Do not assume animation scales were `1`; the inspected emulator previously had them at `0`.

- [ ] **Step 2: Clean-prebuild and install the dev client**

```sh
pnpm --filter grocery-mobile exec expo prebuild --platform android --clean
pnpm --filter grocery-mobile android -- --device Pixel_API_35
adb -s emulator-5554 shell am start -W -n dev.agents.grocery/.MainActivity
```

Expected: Gradle installs the current dev client and `am start` reports `Status: ok`. Expo Go is not the acceptance target.

- [ ] **Step 3: Start process-scoped log capture**

```sh
adb -s emulator-5554 logcat -c
PID=$(adb -s emulator-5554 shell pidof dev.agents.grocery | tr -d '\r')
adb -s emulator-5554 logcat --pid="$PID" -v threadtime > /tmp/grocery-logcat.txt
```

Record the local logcat process so it can be stopped during cleanup.

- [ ] **Step 4: Smoke every route and preserve dashboard/chat navigation**

Open the chat route directly:

```sh
adb -s emulator-5554 shell am start -W \
  -a android.intent.action.VIEW \
  -c android.intent.category.BROWSABLE \
  -d 'grocery-agent://chat' \
  dev.agents.grocery
```

Exercise `/`, `/chat`, `/list`, `/households`, `/shared-list`, `/chat-history`, `/saved-recipes`, `/account`, `/report`, and Kroger callback routing. Confirm no redbox/native crash and the dashboard remains `/`.

- [ ] **Step 5: Verify chat lifecycle and keyboard behavior**

With the keyboard open:

1. Send valid text.
2. Rapidly press Send twice; observe one run.
3. Stop during token acquisition if reproducible.
4. Stop during streaming; partial output remains and draft does not return.
5. Force a recoverable run failure; draft returns with separate Retry and Dismiss actions.
6. Retry once; rapid double Retry starts one run.
7. Open New Chat while active; verify serialization and clean new thread.
8. Resume history success and force/observe failure rollback when possible.
9. Open/dismiss ActionSheet with action, Cancel, backdrop/pan, and hardware Back.
10. Open/dismiss Kroger AlertDialog with Cancel, action, and hardware Back.

Confirm composer SafeArea remains non-growing and Android keyboard avoidance uses height behavior without covering the composer.

- [ ] **Step 6: Verify list/query/mutation behavior**

- Grocery List and Shared List checkboxes toggle once per press.
- Shared List selectors expose one selected radio state.
- Whitespace keyboard submissions for household, invite, list, and item are no-ops.
- Valid keyboard/button submissions share behavior.
- Pull-to-refresh works on Households, Shared List, and Chat History.
- Navigate away from Households/Shared List and confirm off-screen polling does not continue unexpectedly.
- Exercise Kroger connect/cancel/reconnect/callback if credentials are available.

- [ ] **Step 7: Verify offline and recovery behavior**

Capture the original airplane state, then:

```sh
adb -s emulator-5554 shell cmd connectivity airplane-mode enable
adb -s emulator-5554 shell cmd connectivity airplane-mode disable
```

While offline, refresh or mutate and verify visible recoverable error/offline behavior with no false success. On reconnect, verify appropriate queries resume and no duplicate mutation/run occurs.

- [ ] **Step 8: Verify light, dark, and reduced motion**

```sh
adb -s emulator-5554 shell cmd uimode night no
adb -s emulator-5554 shell cmd uimode night yes
adb -s emulator-5554 shell settings put global window_animation_scale 0
adb -s emulator-5554 shell settings put global transition_animation_scale 0
adb -s emulator-5554 shell settings put global animator_duration_scale 0
```

Check dashboard, chat, destructive alerts/buttons/badges, dialogs, lists, account, loading, and commerce cards. Verify status-bar legibility, semantic contrast, and static understandable Skeletons.

- [ ] **Step 9: Verify accessibility hierarchy and TalkBack where available**

```sh
adb -s emulator-5554 shell uiautomator dump /sdcard/grocery.xml >/dev/null
adb -s emulator-5554 pull /sdcard/grocery.xml /tmp/grocery.xml
```

Inspect labels/roles/states for buttons, checkbox, radio, progressbar, busy/disabled, modal content, Retry/Dismiss, and loading controls. Confirm no duplicate Checkbox node or unnamed loading Button. If secure-setting commands are permitted, enable TalkBack using the installed service; otherwise enable it manually and record that limitation.

- [ ] **Step 10: Review filtered logs**

```sh
rg -n 'FATAL EXCEPTION|AndroidRuntime|Invariant Violation|TypeError|Unhandled|Unable to load script|Unable to resolve module|TurboModuleRegistry|Reanimated|Worklets|GestureHandler|Portal|Network request failed|ECONN|401|403|5[0-9]{2}' \
  /tmp/grocery-logcat.txt
```

A match is not automatically a failure; correlate expected offline/auth errors with visible recoverable UI. There must be no crash, unhandled error, missing native module, or unexplained false-success path.

- [ ] **Step 11: Restore every captured global setting even after failure**

Restore exact original night mode, airplane mode, three animation scales, enabled accessibility services, accessibility enabled, and touch exploration. Delete a setting only when its captured value was `null`. Stop logcat/Metro, force-stop the app, and remove temporary hierarchy/log files if they contain account data.

- [ ] **Step 12: Record observed versus blocked flows**

Report each acceptance item as:

- **Observed pass** — exercised on the installed app;
- **Observed failure** — include reproduction and focused fix task;
- **Blocked** — identify missing Clerk/Kroger/backend/test-data capability;
- **Not applicable** — Rating, Switch, Progress, or ConnectionBanner without data/owner.

Any observed defect receives a focused failing test, minimal fix, affected test rerun, Android export rerun, package/repository gate rerun, and repeated device check.
