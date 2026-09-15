# Agents

Agents is a multi-agent workspace with a Go gateway, Telegram worker, and web/mobile clients connected through AG-UI. It uses Cloudflare D1 for sessions and R2 for artifacts.

## Develop

Requires pnpm, Go 1.27+, Docker, and the credentials in [`.env.example`](.env.example).

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Use `pnpm dev:web`, `pnpm dev:agents`, or `pnpm dev:mobile` to run one surface.

## Verify

```bash
pnpm check
pnpm test
cd agents && go test -race ./... && go vet ./...
```

Railway infrastructure is defined in [`.railway/railway.ts`](.railway/railway.ts). The web client deploys to Vercel and the services deploy from the `agents/` directory.

### Design-system linting

`@shadcn/lint` is registered with Oxlint for `web`, `oral-boards`, `grocery-mobile`, and `@agents/ui`. Run the existing workspace commands:

```bash
pnpm lint
pnpm --filter web lint
pnpm --filter grocery-mobile lint
pnpm --filter @agents/ui lint
```

No `shadcn/*` rules are enabled yet. To choose rules, use the [available rules](https://github.com/shadcn-ui/lint/blob/main/docs/rules.md) and [configuration examples](https://github.com/shadcn-ui/lint/blob/main/docs/adoption.md).

Add shared web/UI rules to the `rules` object in [`packages/oxlint-config/tailwind.json`](packages/oxlint-config/tailwind.json). Add app-specific rules to that app's `.oxlintrc.json`; Grocery Mobile uses [`apps/grocery-mobile/.oxlintrc.json`](apps/grocery-mobile/.oxlintrc.json). Component and theme discovery use each workspace's `components.json` where present. Oral Boards recognizes the `@agents/ui` package through `settings.shadcn.ui` and discovers its own theme.
