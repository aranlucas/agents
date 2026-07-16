# Component structure plan: adopting React Native Reusables

How Grocery Agent moves from bespoke `StyleSheet.create` components to
[React Native Reusables](https://reactnativereusables.com/docs/components/)
(RNR) — the shadcn/ui port for React Native — as the component foundation.

## Why RNR fits this repo

- It follows the shadcn copy-in registry model already used by
  `packages/ui` on the web side: components are vendored source, not a
  runtime dependency, so we own and restyle them freely.
- It is built on NativeWind + `class-variance-authority` + `tailwind-merge`
  — the same stack as `packages/ui` — which satisfies the repo rule to use
  Tailwind's utility scale and shared semantic theme tokens instead of
  ad-hoc style objects.
- Accessibility (roles, states, focus) comes from `@rn-primitives/*`
  instead of being re-implemented per component (today every Pressable
  hand-rolls `accessibilityRole`/`accessibilityState`).

## Current pain being solved

- `src/components/ui.tsx` hand-rolls PrimaryButton, SecondaryButton, Card,
  InlineError with one-off StyleSheet objects and hex colors from
  `src/lib/theme.ts`.
- `grocery-chat.tsx` carries ~200 lines of StyleSheet for chat bubbles,
  a hand-built Modal menu, disclosure toggles, and suggestion chips —
  all of which have direct RNR equivalents.
- No dark mode story; colors are hard-coded light-theme hex values.

## Phase 0 — Foundation (one PR)

1. Install NativeWind + Tailwind in `apps/grocery-mobile` (follow the
   expo-tailwind-setup skill; Tailwind v4 to match `packages/ui`).
2. Define the semantic token layer as CSS variables in `global.css`,
   mapping the existing palette from `src/lib/theme.ts`:
   `--background` #f7f8f2, `--card`/`--popover` #ffffff, `--muted`
   #eef2e8, `--primary` #15803d (pressed #166534), `--secondary` forest
   #14532d, `--foreground` #17201a, `--muted-foreground` #667067,
   `--border` #dfe5dc, `--destructive` #b42318 (+ surface #fef3f2).
   Add a `dark:` block with placeholder values so dark mode is a token
   edit, not a refactor.
3. Run the RNR CLI init (`npx react-native-reusables/cli@latest init` or
   add `components.json`) targeting `src/components/ui/`.
4. Keep `src/lib/theme.ts` exporting the same names during migration
   (re-derived from the CSS variables) so unmigrated screens keep working.

## Phase 1 — Core primitives (vendored via CLI)

Add: `text`, `button`, `card`, `input`, `textarea`, `label`, `alert`,
`badge`, `separator`, `skeleton`, `icon`.

Replace the bespoke pieces:

| Today                                        | Becomes                                                           |
| -------------------------------------------- | ----------------------------------------------------------------- |
| `PrimaryButton` / `SecondaryButton` (ui.tsx) | `Button` with `variant="default"` / `"secondary"`, `size="lg"`    |
| `Card` (ui.tsx)                              | RNR `Card` (+ `CardHeader`/`CardContent` where useful)            |
| `InlineError` (ui.tsx)                       | `Alert` with `variant="destructive"`                              |
| Raw `Text` + per-screen font styles          | RNR `Text` typography variants (`h1`–`h4`, `p`, `muted`, `small`) |
| Composer `TextInput` (grocery-chat)          | `Textarea` (auto-grow, themed)                                    |
| Suggestion starter chips                     | `Button variant="outline"` or `Badge`                             |
| Loading placeholders / spinners              | `Skeleton` where layout is known                                  |

`BrandMark` stays bespoke (it's an asset, not a primitive).

## Phase 2 — Overlays and disclosure

Add: `dropdown-menu`, `alert-dialog`, `dialog`, `collapsible`, `avatar`,
`progress`, `switch`, `checkbox`, `tooltip` (as needed).

- The hand-built chat menu `Modal` in `grocery-chat.tsx` (menuLayer /
  chatMenu / menuItem styles) → `DropdownMenu` anchored to the menu
  button; `Separator` replaces `menuDivider`.
- `Alert.alert("Add this list to Kroger?", …)` → `AlertDialog` so the
  confirmation is styled, testable, and consistent on both platforms.
- `ReasoningSection` / `ToolCallSection` disclosure toggles →
  `Collapsible` (keeps the custom streamed content inside).
- Checkbox lands with the shared-lists work (item check-off).

## Phase 3 — Convergence and cleanup

1. Migrate remaining screens (`list`, `saved-recipes`, `chat-history`,
   `account`, `report`, sign-in) to the vendored primitives.
2. Delete `src/components/ui.tsx` once no imports remain; shrink
   `theme.ts` to non-component constants (or delete it).
3. Add an oxlint/review convention: no new `StyleSheet.create` for
   anything a vendored `ui/` component covers; layout-only styles are
   fine.
4. If `apps/mobile` (or a future native app) needs the same primitives,
   hoist `src/components/ui/` + tokens into a `packages/native-ui`
   workspace package; do not do this preemptively.

## What we deliberately keep custom

- Chat message bubbles, `MessageScroller`, `NativeMarkdown`,
  `GroceryStateCard`, `KrogerProductImage` — domain components; they sit
  _on top of_ the primitives (Card, Text, Collapsible) rather than being
  replaced by them.
- Navigation/layout remains Expo Router; RNR is view-layer only.

## Verification gates per phase

- `pnpm --filter grocery-mobile typecheck && lint && test`, then repo-wide
  `pnpm check && pnpm test`.
- `npx expo export --platform android` still succeeds (NativeWind/Metro
  config is the risky part of Phase 0).
- Visual pass on the Pixel API 35 emulator over ADB for the chat screen,
  menu, and confirmation dialog.

## Risks

- NativeWind + Metro config interplay with the existing
  `metro.config.js` shims (node-crypto) — validate in Phase 0 before any
  component work.
- RNR targets NativeWind v4+/Uniwind; pin whichever the CLI scaffolds and
  match `tailwindcss` major with `packages/ui` (v4) to share token
  conventions.
- Mixed styling during migration is expected; phases are small enough
  that each PR leaves the app fully working.
