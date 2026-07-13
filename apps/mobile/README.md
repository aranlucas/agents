# Chat Template

https://github.com/user-attachments/assets/864ca10c-be94-4c45-8e98-a71bff7a0042

A high-performance AI chatbot template built with [Expo](https://expo.dev) and [Expo Router](https://docs.expo.dev/router/introduction/). Ships with iOS 26 Liquid Glass support, a responsive web UI, and runs on iOS, Android, and web from a single codebase.

## Features

- **Liquid Glass** -- glassmorphic prompt composer, navigation bars, and toolbar buttons on iOS 26 via `expo-glass-effect`
- **Web-first sidebar** -- collapsible sidebar with Radix context menus, dropdown menus, and tooltips for a desktop-grade web experience
- **Streaming messages** with throttled ~30fps updates, markdown rendering (code blocks, tables, inline formatting), and shimmer loading states
- **Platform-adaptive layouts** -- native gesture-driven drawer on iOS/Android, sidebar + inset content panel on web
- **Dark mode** -- automatic light/dark theme using OKLCH design tokens in Tailwind CSS v4
- **Native UI controls** -- SwiftUI model picker menu, toolbar buttons, and haptic feedback on iOS
- **Keyboard-aware** -- prompt input stays above the keyboard with `react-native-keyboard-controller`
- **Virtualized chat** -- performant scrolling with `@legendapp/list` and Reanimated-powered scroll-to-bottom button

## Tech Stack

| Layer      | Technology                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| Framework  | Expo SDK 55, React Native 0.83, React 19                                                                                |
| Navigation | Expo Router (file-based) with typed routes, [Legend List](https://legendapp.com/open-source/list/) for virtualized chat |
| Styling    | Tailwind CSS v4 via [Uniwind](https://uniwind.dev/) + `tailwind-merge`                                                  |
| Native UI  | `@expo/ui` (SwiftUI), `expo-haptics`, `expo-glass-effect`, SF symbols via `expo-image`                                  |
| Web UI     | Radix UI (context menu, dropdown menu, tooltips), Lucide icons                                                          |
| Markdown   | Custom AST renderer with `mdast-util-from-markdown` + `react-syntax-highlighter`                                        |
| Animations | `react-native-reanimated`, `react-native-gesture-handler`                                                               |

## Getting Started

### Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable              | Description                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`   | Your [Anthropic API key](https://console.anthropic.com/settings/keys). Used by the server-side chat API route (`app/api/chat+api.ts`) via `@ai-sdk/anthropic`. |
| `EXPO_PUBLIC_MOCK_AI` | Set to `1` to use mock streaming responses instead of calling the Anthropic API. Useful for UI development without an API key.                                 |

### Install & Run

```bash
# Install dependencies
bun install

# Start the dev server
bun start

# Run on a specific platform
bun run ios
bun run android
bun run web
```

> Requires [Bun](https://bun.sh) and the [Expo CLI](https://docs.expo.dev/get-started/installation/). For iOS, you'll need Xcode and a simulator or device.

## Customization

### Theme

Edit `global.css` to change the design tokens. Colors use OKLCH for perceptual uniformity across light and dark modes. The `@theme` block maps CSS variables to Tailwind classes:

```css
--app-background  ->  bg-background
--app-foreground  ->  text-foreground
--app-muted       ->  bg-muted
--app-border      ->  border-border
/* etc. */
```

### Chat Backend

The template ships with mock streaming responses in `app/index.tsx`. Replace `mockStreamResponse` with your API integration -- the streaming architecture (`createStreamingStore` + throttled token callback) is ready for real LLM APIs.

### Agent screens (AG-UI)

The agent tabs use the [AG-UI](https://docs.ag-ui.com/) protocol via [`@ag-ui/client`](https://www.npmjs.com/package/@ag-ui/client). The production path should point at the web CopilotKit runtime, while direct ADK service URLs remain useful for local agent development.

- Set `EXPO_PUBLIC_COPILOTKIT_RUNTIME_URL=https://your-web-app.example.com/api/copilotkit` for production APKs. Mobile will call `/agent/{agentId}/run`, so the Next.js runtime can resolve the Kroger OAuth token before forwarding to the ADK services. Fitness data syncs separately from Android Health Connect to the authenticated gateway endpoint.
- Leave `EXPO_PUBLIC_COPILOTKIT_RUNTIME_URL` unset for local direct-agent testing. `EXPO_PUBLIC_AGENTS_BASE_URL` points at the gateway and mobile builds `/<agent>/agui` URLs from it; Android local defaults use `10.0.2.2` so emulator APKs can reach host-machine agents.
- `src/utils/use-agent.ts` wraps a long-lived `HttpAgent`, streams assistant tokens through `onMessagesChanged`, and applies AG-UI state snapshots/JSON-patch deltas through `onStateChanged`.
- Each screen renders from agent state (e.g. trip cards, shopping-list chips, fitness/wellness summaries) -- **state is the source of truth**, not chat text.
- The Clerk user id is forwarded as `x-clerk-user-id`; when signed in, the Clerk session JWT is sent as `Authorization` for the CopilotKit runtime.

### Android APK builds (CI)

`.github/workflows/android-apk.yml` builds an installable APK and publishes it to a GitHub Release with the GitHub CLI (`gh`):

- **Push a tag** like `v1.2.3` → the APK is attached to that tag's release.
- **Run manually** (Actions → _Android APK_ → _Run workflow_) → a timestamped prerelease is created.

The job runs `expo prebuild` + `./gradlew assembleRelease` on the runner, so no EAS account or secret is required. The release APK is signed with the **debug keystore** — wire a real keystore (and Play upload) before public distribution. For cloud builds / store submission instead, `eas.json` defines `preview` (APK) and `production` (AAB) profiles for `eas build --platform android`.

### Database

I recommend using Convex, which you can setup in a single command:

```
npx eas-cli@latest integrations:convex:connect
```

Pair this with [better-auth](https://labs.convex.dev/better-auth/framework-guides/expo) for authentication. Convex also has support for Expo Notifications: [Learn more](https://www.convex.dev/components/push-notifications).

## License

This template was made for https://agent.expo.dev and is made freely available under the MIT license.
