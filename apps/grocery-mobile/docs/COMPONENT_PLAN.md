# Component structure plan: adopting AniUI

How Grocery Agent moves from bespoke `StyleSheet.create` components to
[AniUI](https://www.aniui.dev/) as the preferred source registry for native UI.
AniUI follows the shadcn model: components are copied into the app, reviewed,
and owned by this repo rather than added as a runtime component-library
dependency.

## Decision

- Use AniUI's Uniwind variants and install only the components the app needs.
- Prefer AniUI whenever its catalog has an equivalent primitive. Vendor it into
  `src/components/ui/`, normalize it to this app's semantic tokens and Uniwind
  conventions, then adopt it directly from feature code. Keep local components
  for Grocery-specific behavior and gaps in the AniUI catalog.
- Treat AniUI blocks as reference implementations, not drop-in screens. Grocery
  Agent's CopilotKit state, Expo Router navigation, Clerk auth, markdown, and
  product-tool rendering remain authoritative.
- Do not mix in NativeWind. This app is already on Uniwind and Tailwind v4.

## Why AniUI fits this repo

- Its [registry](https://www.aniui.dev/docs/shadcn-registry) is compatible with
  an existing shadcn/RNR-style project, including the `ui` and `lib` aliases and
  semantic tokens already present here.
- Uniwind is AniUI's recommended engine for Expo SDK 55+; its
  [compatibility matrix](https://www.aniui.dev/docs/compatibility) explicitly
  covers Expo SDK 57, React Native 0.86, React 19.2, Reanimated 4.5, and
  `react-native-worklets` 0.10 — the versions used by this app.
- It provides a broader mobile-first catalog than the current primitive set:
  chat, loading, empty-state, connection, list, product, and overlay patterns
  are available without inventing another local abstraction.
- Complex controls use `@rn-primitives/*` for behavior and accessibility;
  styling stays in Tailwind utilities backed by `global.css` theme tokens.
- The CLI supports `doctor`, `status`, `diff`, and selective updates, which
  gives vendored components an explicit maintenance path.

## Current baseline

The current worktree already has the foundation AniUI expects:

- Uniwind + Tailwind v4 configured in `metro.config.js` and `global.css`.
- Semantic light/dark tokens in `global.css`.
- `@/components/ui`, `@/lib`, and `@/lib/utils` aliases.
- Vendored `text`, `button`, `card`, `input`, `textarea`, `label`, `alert`,
  `badge`, `separator`, `skeleton`, and `icon` components.
- Reanimated, Worklets, Gesture Handler, Lucide, `cva`, `clsx`, and
  `tailwind-merge` already installed.

The app currently uses the open-source Uniwind package. Class-driven
`animate-*`, transition, and `uw-*` entering/exiting utilities require Uniwind
Pro; keep the few open-source animation implementations isolated inside shared
primitives such as `Skeleton` and `TypingIndicator`. App screens and domain
components should remain class-only and must not grow one-off animated styles.

Because this foundation exists, do **not** run `aniui init` in place: it can
rewrite Metro, theme, utility, and TypeScript configuration. Add the registry
namespace to `components.json`, then install components selectively:

```json
{
  "registries": {
    "@aniui": "https://aniui.dev/r/{name}.json"
  }
}
```

Use the repo package manager for CLI commands:

```sh
pnpm dlx shadcn@latest add @aniui/chip
```

Review every generated source and dependency diff before keeping it. AniUI's
own CLI may be used for diagnostics and upstream comparison after the registry
is established:

```sh
pnpm dlx @aniui/cli doctor
pnpm dlx @aniui/cli status
pnpm dlx @aniui/cli diff chip
```

## Phase 1 — Consolidate the existing primitives

Keep the current core files and finish replacing the bespoke exports from
`src/components/ui.tsx`:

| Today                                  | Target                                                    |
| -------------------------------------- | --------------------------------------------------------- |
| `PrimaryButton` / `SecondaryButton`    | `Button` with `variant="default"` / `"secondary"`         |
| `Card`                                 | `Card` plus `CardHeader` / `CardContent` where useful     |
| `InlineError`                          | `Alert variant="destructive"`                             |
| Raw `Text` plus per-screen font styles | Shared `Text` typography variants                         |
| Raw composer `TextInput`               | Shared `Textarea`, preserving auto-grow and send behavior |
| Known-layout loading placeholders      | `Skeleton`                                                |
| Indeterminate loading                  | AniUI `Spinner` or the shared button `loading` state      |

`BrandMark` stays bespoke because it is an asset, not a primitive.

## Phase 2 — Add high-value AniUI components

Add components in small, reviewable groups rather than importing the catalog:

1. `chip`, `empty-state`, `spinner`, and `typing-indicator`.
2. `safe-area`, `keyboard-view`, `header`, and `refresh-control`.
3. `action-sheet`, `alert-dialog`, `collapsible`, and `checkbox`.
4. `avatar`, then `switch` and `progress` when their owning screens are migrated.

Concrete replacements:

| Grocery surface                                      | AniUI component                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| Starter suggestions and filter pills                 | `Chip` (interactive), not `Badge` (display-only)                    |
| Empty grocery list, recipes, households, and history | `EmptyState`                                                        |
| Agent waiting state before streamed content arrives  | `TypingIndicator`                                                   |
| Offline/reconnecting state                           | `ConnectionBanner`, if CopilotKit exposes reliable connection state |
| Chat conversation actions                            | `ActionSheet`                                                       |
| Chat composer                                        | `PromptInput`                                                       |
| “Add this list to Kroger?” confirmation              | `AlertDialog`                                                       |
| Reasoning and tool-call disclosure                   | `Collapsible`                                                       |
| Shared-list item completion                          | `Checkbox`                                                          |
| App navigation chrome                                | `Header`                                                            |
| Signed-in account control                            | `Avatar` with initials fallback                                     |
| Screen and composer insets                           | `SafeArea`                                                          |
| Chat and sign-in keyboard handling                   | `KeyboardView`                                                      |
| Pull-to-refresh screens                              | `RefreshControl`                                                    |
| Clerk sign-in, sign-up, and verification             | AniUI `Login` block structure with existing auth handlers           |

Overlay components require `PortalHost` from `@rn-primitives/portal` as the
last child of the root `GestureHandlerRootView`. Add it in the same change as
the first overlay, not during unrelated primitive work.

Follow AniUI's
[Android integration guide](https://www.aniui.dev/docs/android#bottom-sheet-action-sheet-select):

- Wrap the entire app in `GestureHandlerRootView`; bottom sheets, action sheets,
  selects, and gesture-driven overlays depend on it.
- Keep Android `softwareKeyboardLayoutMode` on `resize`. The shared AniUI
  `KeyboardView` retains its platform defaults; the chat screen explicitly uses
  Android `height` because Expo Go does not apply the app-specific activity
  configuration. Keep its composer `SafeArea` non-growing with `flex-none`.
- Use `react-native-safe-area-context` for edge-to-edge safe areas.
- Make dialogs dismiss from Android's hardware back button and test overlays
  and the composer with the keyboard open.

## Phase 3 — Chat and commerce patterns

Use AniUI's [Chat block](https://www.aniui.dev/blocks/chat),
[Chat Bubble](https://www.aniui.dev/docs/chat-bubble), and
[Product List block](https://www.aniui.dev/blocks/product-list) as visual and
accessibility references only.

- Keep Grocery Agent's message renderer custom. It must support streamed
  CopilotKit messages, `NativeMarkdown`, reasoning/tool sections, frontend tool
  results, retry/cancel behavior, and history replay; AniUI's simple chat bubble
  does not replace that contract.
- Use AniUI `PromptInput` as the controlled composer shell. Map
  `streaming={isRunning}` and `onStop` to CopilotKit's active run so the send
  arrow becomes a real stop control while the agent responds.
- Do not add AniUI `StreamingText`: CopilotKit already owns token streaming and
  `NativeMarkdown` already owns incremental markdown rendering.
- Reuse AniUI's `Price`, `Rating`, `Badge`, `Card`, `Chip`, and empty/loading
  patterns inside `GroceryStateCard` and product results where they improve the
  existing domain components. Keep `KrogerProductImage` and product actions
  custom.
- Follow AniUI's [Login block](https://www.aniui.dev/blocks/login) for the
  sign-in screen hierarchy while retaining Clerk's Google SSO, credential
  sign-in, account creation, and email verification state machine.

## Phase 4 — Convergence and cleanup

1. Migrate remaining screens (`list`, `saved-recipes`, `chat-history`,
   `account`, `report`, and sign-in) to the shared primitives.
2. Delete `src/components/ui.tsx` once no imports remain; shrink `theme.ts` to
   non-component constants or remove it after all colors come from tokens.
3. Do not add new `StyleSheet.create` rules for typography, color, borders,
   radii, or spacing that a shared component or Tailwind utility already
   covers. Native-only layout and third-party `style` props remain valid.
4. Before updating vendored AniUI source, run `aniui status` and `aniui diff`;
   never overwrite local variants blindly.
5. If another native app needs the same primitives, first prove the APIs stable
   here, then hoist them into `packages/native-ui`. Do not share prematurely.

## What remains custom

- CopilotKit session/state and history replay.
- Message scrolling and streamed markdown.
- Reasoning and frontend-tool result content.
- `GroceryStateCard`, `KrogerProductImage`, Kroger actions, and list mutations.
- Expo Router navigation and Clerk authentication.

These domain components sit on top of AniUI primitives; they are not registry
components themselves.

## Verification gates per phase

- `pnpm --filter grocery-mobile typecheck && pnpm --filter grocery-mobile lint && pnpm --filter grocery-mobile test`
- `pnpm --filter grocery-mobile fmt:check`
- `pnpm dlx @aniui/cli doctor` after registry or dependency changes.
- `pnpm exec expo export --platform android` from `apps/grocery-mobile` after
  Metro, Uniwind, Reanimated, Worklets, or portal changes.
- Visual and accessibility pass on Android for chat, keyboard avoidance, menu
  positioning, dialogs, screen-reader labels, reduced motion, and dark mode.
- Repo-wide `pnpm check && pnpm test` before merge.

## Risks

- Registry additions can overwrite existing files with the same name. Inspect
  the CLI diff and prefer adding missing components over replacing stable ones.
- AniUI's defaults may not match Grocery Agent's token names, touch targets, or
  component APIs exactly. Normalize source once when vendoring; do not add
  wrappers solely to preserve upstream examples.
- Uniwind uses a 16px rem base by default while this app configures `rem: 14`.
  Keep the app's existing scale and visually check vendored spacing and type.
- Overlay components add portal and positioning behavior that must be tested on
  Android with the keyboard open.
- AniUI's catalog evolves. Pin the reviewed source in git and update
  intentionally through `status` / `diff`; do not depend on latest registry
  output during normal builds.
