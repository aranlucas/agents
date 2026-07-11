# Agents Monorepo — CopilotKit x ADK-Go

A production multi-agent workspace with a Go ADK gateway, a Go Telegram worker,
and web/mobile clients sharing live state over AG-UI.

The gateway exposes 12 agents: travel, grocery, fitness, wellness, expense,
oral boards, trends, Excalidraw, presentation, research, spreadsheet, and the
public resume assistant. Cloudflare D1 is the sole session/link/rate-limit
store and R2 is the sole artifact store. There is no local or Postgres fallback.

## Architecture

```text
apps/web    -> CopilotKit runtime -> Go gateway /<agent>/agui
apps/mobile -> @ag-ui/client     -> Go gateway /<agent>/agui
Telegram    -> Go long poller    -> ADK-Go specialist agents
                                -> D1 sessions + R2 artifacts
```

State is the source of truth: agents write typed state through tools and the
clients render state snapshots/deltas. Clerk protects every agent except
`resume`; OAuth credentials are overlaid only for the current invocation.

## Local development

Prerequisites: pnpm, Go 1.26, Docker, and the credentials documented in
[.env.example](.env.example).

```bash
cp .env.example .env
pnpm install
pnpm dev                 # web + Go gateway + Go Telegram worker
pnpm dev:web             # web only
pnpm dev:agents          # gateway and Telegram containers
pnpm dev:mobile
```

The web app uses port 3000, the gateway 8000, and Telegram health 8082.

## Verification

```bash
pnpm check
pnpm test
cd agents && golangci-lint run ./... && go test -race ./... && go vet ./...
docker build -f agents/Dockerfile -t agents-gateway-go:local .
docker build -f agents/Dockerfile.telegram -t agents-telegram-go:local .
bash agents/scripts/smoke-image.sh agents-gateway-go:local
bash agents/scripts/smoke-telegram.sh agents-telegram-go:local
```

Deployment uses [railway.toml](railway.toml) for the gateway and
[agents/railway.telegram.toml](agents/railway.telegram.toml) for the worker.
The web deploys to Vercel and mobile through EAS.
