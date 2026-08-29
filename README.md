# Agents Monorepo — CopilotKit x ADK-Go

A production multi-agent workspace with a Go ADK gateway, a Go Telegram worker,
and web/mobile clients sharing live state over AG-UI.

The gateway exposes 13 agents: travel, grocery, fitness, wellness, expense,
oral boards, trends, presentation, research, spreadsheet, the public resume
assistant, a private job-matching/application assistant, and a private software
engineering interview coach. Cloudflare D1 is the sole session/link/rate-limit
store and R2 is the sole artifact store. There is no local or Postgres fallback.

## Architecture

```text
apps/web    -> CopilotKit runtime -> Go gateway /<agent>/agui
apps/mobile -> CopilotKit runtime -> Go gateway /<agent>/agui
Telegram    -> Go long poller    -> ADK-Go specialist agents
                                -> D1 sessions + R2 artifacts
Go gateway  -> MCP client        -> Cloudflare Kroger shopping Worker
```

State is the source of truth: agents write typed state through tools and the
clients render state snapshots/deltas. Clerk protects every agent except
`resume`; OAuth credentials are overlaid only for the current invocation.

## Local development

Prerequisites: pnpm, Go 1.27.0, Docker, and the credentials documented in
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
pnpm --filter agents contracts:check
cd agents && golangci-lint run ./... && go test -race ./... && go vet ./...
docker build -f agents/Dockerfile -t agents-gateway-go:local .
docker build -f agents/Dockerfile.telegram -t agents-telegram-go:local .
bash agents/scripts/smoke-image.sh agents-gateway-go:local
bash agents/scripts/smoke-telegram.sh agents-telegram-go:local
```

Railway infrastructure is defined in code at
[.railway/railway.ts](.railway/railway.ts); see [.railway/README.md](.railway/README.md)
for the plan/apply workflow. The `agents` project runs a single `agents-gateway`
service in its `production` and `development` environments. The web deploys to
Vercel, mobile through EAS, and the Kroger shopping MCP from
`apps/ai-shopping-mcp` to the existing `ai-meal-planner-mcp` Cloudflare Worker.

The gateway runs the idempotent `/app/migrate` binary before starting, exposes
process-only `/live`, and uses schema/D1/R2-aware `/ready` for deployment
health. Set `APP_ENV=production` on the service. It also requires all `CF_*`
values, `ALLOWED_ORIGINS` (including `*` for open CORS), `CLERK_ISSUER`, and the
OpenRouter, Groq, and Gemini keys.
`ALLOWED_ORIGINS` also accepts local HTTP origins like `http://localhost:3000` in
production for local debugging.
It also requires `GOOGLE_APPLICATION_CREDENTIALS_JSON` for the advertised
Google Trends surface.
`CLERK_SECRET_KEY` enables OAuth account lookup where that feature is used.

The Telegram worker (`agents/Dockerfile.telegram`) builds and smoke-tests
locally but is not currently deployed to Railway. Add an `agents-telegram`
service to `.railway/railway.ts` when it should be; it needs all `CF_*` values,
`GROQ_API_KEY`, and `TELEGRAM_BOT_TOKEN`, and browser-origin and Clerk-JWT
settings stay gateway-only.

Production acceptance requires an authenticated Clerk session token and both
deployed service URLs. The smoke script health-checks every registered route,
runs the Resume agent, exercises a client tool and Grocery OAuth headers, and
checks Telegram readiness before recording Railway's raw RSS samples. It still
requires `TELEGRAM_HEALTH_URL`, so it cannot pass end to end until the Telegram
worker is deployed:

```bash
AGENTS_BASE_URL=https://agents-gateway.example \
SMOKE_AUTH_TOKEN="$CLERK_SESSION_TOKEN" \
TELEGRAM_HEALTH_URL=https://agents-telegram.example \
  bash agents/scripts/production-smoke.sh
bash agents/scripts/measure-rss.sh agents-gateway production 15m
```

The RSS check fails unless Railway returns at least one sample and the peak is
strictly below 0.4 GB.
