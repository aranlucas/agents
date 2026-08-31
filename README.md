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
