# Grocery Mobile component-plan convergence design

**Date:** 2026-07-16  
**Status:** Approved for implementation planning

## Relationship to the component plan

This design is the implementation boundary for [`docs/COMPONENT_PLAN.md`](../../COMPONENT_PLAN.md). It does not restate the full AniUI migration strategy. It records the decisions needed to finish the substantial uncommitted migration already present in the working tree without duplicating completed work.

The current tree already contains most shared primitives, screen migrations, overlay/root integration, semantic tokens, and the custom chat/commercial rendering required by the component plan. Implementation begins from that state rather than reinstalling or regenerating the catalog.

## Goals

1. Preserve the completed Uniwind/shared-component migration and the dashboard-at-`/` plus `/chat` navigation.
2. Keep and harden the TanStack Query conversion so native focus, connectivity, retry, polling, invalidation, callback, and token-refresh behavior is explicit and regression-tested.
3. Correct interaction, lifecycle, accessibility, and appearance defects introduced or exposed by the migration.
4. Finish the remaining explicit component-plan targets and broader reuse selected for expanded convergence.
5. Establish automated and real Android/ADB verification that exercises the native application rather than relying only on static checks.

## Non-goals

- Replacing Grocery-specific chat, state, product-image, Kroger-action, routing, or Clerk-auth behavior with generic AniUI blocks.
- Re-running `aniui init` or blindly overwriting reviewed local primitives.
- Adding `Switch`, `Progress`, or `ConnectionBanner` without an existing owning surface or reliable connection signal.
- Eliminating structural React Native `View`, `Pressable`, `ScrollView`, or `FlatList` usage merely to introduce wrappers.
- Rewriting already-readable tokenized typography and Card composition when it would only create churn.

## Architecture

### Shared UI foundation

Preserve the current shared Button, Card, Alert, Text, Input, Textarea, Skeleton, Spinner, EmptyState, Header, SafeArea, KeyboardView, RefreshControl, PromptInput, TypingIndicator, ActionSheet, AlertDialog, Collapsible, Checkbox, Chip, Avatar, Badge, and Icon foundation. Local variants and semantic tokens remain authoritative.

Before changing a catalog-equivalent primitive:

1. Run AniUI `doctor`, `status`, and the relevant component `diff` when available.
2. Fetch the reviewed registry source into a temporary location rather than generating over the working tree.
3. Replace the local implementation from that upstream source first.
4. Immediately normalize semantic tokens, imports, app-facing APIs, accessibility behavior, and tests so feature contracts remain intact.

This is an upstream-first strategy, not an exact unadapted overwrite: the registry implementation is the starting point, while Grocery Mobile's tokens, platform behavior, and tested consumer contracts remain acceptance requirements.

ActionSheet, AlertDialog, Collapsible, portal hosting, and gesture providers must converge on one coherent behavior stack. A portal host or dependency remains only when a final primitive consumes it. Android Back dismissal, modal semantics, keyboard-open positioning, and focus behavior are acceptance requirements regardless of the underlying implementation.

### Navigation and domain boundaries

Retain the dashboard at `/` and the separate `/chat` route. Do not perform another information-architecture redesign.

Continue to keep these surfaces custom:

- CopilotKit session and thread replay;
- streamed `NativeMarkdown` rendering;
- reasoning and tool-call disclosure content;
- message live-edge scrolling;
- `GroceryStateCard`, `KrogerProductImage`, and Kroger/list mutations;
- Expo Router and Clerk authentication state machines.

Shared primitives provide presentation and behavior beneath those domain components; they do not replace domain contracts.

### Query and connectivity foundation

Keep one stable TanStack Query client at the application root. The provider owns:

- React Native foreground/background focus integration;
- native online/offline state integration;
- shared retry defaults appropriate for mobile;
- stable query keys and narrowly scoped invalidation.

Query hooks must preserve the previous product behavior for:

- Grocery agent authorization/token refresh;
- Kroger connect and reconnect;
- Kroger callback propagation timing;
- household loading, creation, joining, and refresh;
- shared-list loading, creation, selection, item mutation, and refresh.

The conversion must not shorten external-account propagation windows or convert recoverable failures into false success. Reconnect behavior must be deterministic and tested.

## Interaction and error contracts

### Chat lifecycle

Agent and thread operations return an explicit outcome:

- `success`: the requested operation completed;
- `stopped`: the active run was intentionally cancelled;
- `failed`: an emitted or thrown runtime error prevented completion.

A synchronous in-flight guard is established before asynchronous Clerk token acquisition. Send, Retry, Stop, New Chat, and thread switching all use the same lifecycle state so overlapping operations cannot detach or overwrite one another.

CopilotKit `runAgent` and `connectAgent` promise resolution is not sufficient evidence of success because the installed SDK can catch and emit failures. The controller must observe the SDK failure path and only run completion callbacks after confirmed success.

Outcome behavior:

- **Stop:** retain partial output, do not restore submitted composer text, and do not show a failure alert.
- **Send failure:** restore the retained user input and expose separate accessible Retry and Dismiss actions.
- **Retry:** start exactly one new run using the retained failed input.
- **History failure:** restore the previous thread, messages, and agent state; do not navigate to an empty failed thread.
- **New Chat / thread switch:** serialize or intentionally cancel active work through the shared lifecycle state.

### Forms and mutations

Keyboard submission and button submission call the same validated handler. Whitespace-only household names, invite codes, shared-list names, and item names do not reach API mutations.

Mutation success invalidates only affected queries. Mutation and query failures remain visible and recoverable. Loading controls keep stable accessible names while busy.

## Primitive convergence

The implementation must complete these concrete changes:

1. Make `CheckboxPrimitive.Root` the single native press target and accessibility node; do not nest a second `Pressable` under an ignored native `asChild` prop.
2. Make Chip default to button semantics only when a caller has not supplied another role. Radio-like chips expose the corresponding checked/selected state.
3. Reset Avatar image-failure state when its source changes so a later valid image replaces the fallback.
4. Preserve Button accessible names while loading.
5. Make Skeleton honor reduced-motion preferences, matching TypingIndicator behavior.
6. Use semantic destructive foreground tokens for Button and Badge content in both themes.
7. Replace chat starter-suggestion Buttons with Chip while preserving wrapping and the existing send action.
8. Use the shared RefreshControl in Chat History.
9. Move BrandMark into a dedicated bespoke module, update its imports, and delete the legacy `src/components/ui.tsx` file.
10. Use shared EmptyState for remaining shared-list empty branches.
11. Replace one-off account/Kroger status presentation with Badge.
12. Reuse Price, Rating, Badge, Card subcomponents, and related commerce primitives where the existing data supports them and the result reduces duplication. Keep product images and actions custom.

## Appearance and motion

Set Expo appearance to follow the system so the existing light and dark semantic token sets are reachable. Status-bar content and destructive foreground contrast must remain legible in both themes.

Reduced-motion behavior must be meaningful rather than merely faster. Infinite decorative pulses are suppressed or reduced while loading state remains understandable.

## Automated verification

### Test infrastructure

Extend Vitest and TypeScript test configuration to discover and typecheck `.test.tsx` with a React Native-compatible setup. Add focused coverage for:

- double Send during token acquisition;
- emitted run failure;
- intentional Stop;
- Retry;
- failed history connection rollback;
- query focus and online transitions;
- query invalidation and mutation errors;
- Kroger callback timing;
- whitespace keyboard submissions;
- Checkbox interaction and state;
- Chip radio semantics;
- Avatar source recovery;
- loading-button accessibility naming;
- Skeleton reduced motion;
- ActionSheet and AlertDialog dismissal;
- chat Retry and Dismiss controls.

### Build and CI

Add a deterministic grocery-mobile Android export/build command backed by Expo Android export. Run it in CI so Metro resolution, Expo Router, Uniwind, Reanimated/Worklets, gesture handling, and native dependency integration cannot regress while ordinary TypeScript tests remain green.

Final automated gates:

```sh
pnpm --filter grocery-mobile typecheck
pnpm --filter grocery-mobile lint
pnpm --filter grocery-mobile test
pnpm --filter grocery-mobile fmt:check
pnpm dlx @aniui/cli doctor
pnpm --filter grocery-mobile build:android
pnpm check
pnpm test
```

The exact package script name may follow the existing repository naming convention, but it must execute a deterministic Android Expo export.

## Android and ADB verification

Use a connected Android emulator or device and `adb` after the final implementation and automated gates.

1. Confirm the target with `adb devices`.
2. Build/install or launch the appropriate development build.
3. Clear or filter `adb logcat` before exercising critical flows.
4. Drive and observe:
   - dashboard and `/chat` navigation;
   - sign-in and chat with the keyboard open;
   - Send, rapid double Send, Stop, Retry, New Chat, and history replay;
   - Grocery List and Shared List checkbox mutations;
   - whitespace keyboard submissions;
   - Kroger confirmation dialogs, cancellation, and hardware Back;
   - ActionSheet presentation and dismissal;
   - pull-to-refresh, loading, empty, error, offline, reconnect, and recovered states;
   - account Avatar/Badge and commerce-card rendering.
5. Toggle Android system light/dark appearance and verify semantic colors, destructive contrast, and status-bar legibility.
6. Enable reduced animations and verify loading states remain understandable without continuous decorative motion.
7. Inspect the Android hierarchy and use TalkBack where available to verify labels, roles, checked/busy states, modal behavior, and touch targets.
8. Review filtered logcat output for JavaScript, native, Reanimated, gesture, portal, and network errors.

The completion report must distinguish behavior observed on device from flows blocked by credentials, backend data, or unavailable device capabilities.

## Implementation sequence

1. Establish the final dependency and provider architecture: TanStack Query connectivity, AniUI diagnostics, and overlay/portal strategy.
2. Fix query, callback, form-validation, and CopilotKit lifecycle behavior before visual polish.
3. Correct primitive interaction and accessibility defects.
4. Finish explicit component-plan gaps and expanded reuse.
5. Enable system appearance and reduced-motion behavior.
6. Add focused TSX/hook tests and the deterministic Android export/CI gate.
7. Run package and repository checks.
8. Perform the full Android/ADB pass and record concrete results.

## Acceptance criteria

The work is complete when:

- no completed migration work has been regenerated or duplicated;
- the approved dashboard and `/chat` navigation remain functional;
- query, callback, mutation, and agent/thread behavior is explicit and regression-tested;
- Stop, failure, Retry, and history rollback produce the defined outcomes;
- all primitive convergence items above are implemented or documented as inapplicable because the corresponding data/surface does not exist;
- light, dark, and reduced-motion behavior is reachable and verified;
- package checks, AniUI diagnostics, Android export, and repository checks pass;
- the affected application flows are exercised through Android and `adb` with no unresolved runtime errors.
