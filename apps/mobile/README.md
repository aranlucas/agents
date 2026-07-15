# Agents mobile

Expo app for the four agent workflows that currently have native screens:

- Travel planning
- Grocery and meal planning
- Fitness planning with Android Health Connect sync
- Coordinated wellness planning

Each tab uses the CopilotKit-compatible runtime hosted by the Go gateway, renders backend state as a compact summary, and refreshes the Clerk session token immediately before a run. Fitness activity data is sent to that same authenticated gateway and persisted in D1.

## Configuration

Copy `.env.example` to `.env.local` and set:

- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_COPILOTKIT_RUNTIME_URL`
- `EXPO_PUBLIC_AGENTS_BASE_URL` for Health Connect sync

Android rewrites local `localhost` URLs to the emulator host at `10.0.2.2`.

## Development

From the repository root:

```bash
pnpm install
pnpm --filter mobile start
pnpm --filter mobile android
pnpm --filter mobile ios
pnpm --filter mobile web
```

Validate the app with:

```bash
pnpm --filter mobile lint
pnpm --filter mobile fmt:check
pnpm --filter mobile typecheck
pnpm --filter mobile test
```

EAS build profiles live in `eas.json`. The custom Health Connect module requires a development client or native build; it is unavailable in Expo Go.
