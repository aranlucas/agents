# Repository Guide for Coding Agents

This pnpm monorepo contains an ADK-Go multi-agent backend and Next.js/Expo clients.

## Structure

```text
agents/
  cmd/gateway/            Go AG-UI gateway
  cmd/telegram/           Go Telegram long-poll worker
  <name>/agent/           12 typed ADK-Go authored agent packages
  internal/agui/          AG-UI request/event bridge
  internal/cloudflare/    D1 sessions/rates/links and R2 artifacts
  internal/providers/     in-process OpenAI-compatible and Gemini adapters
  migrations/d1/          idempotent D1 schemas
apps/web/                  Next.js 16 + CopilotKit
apps/mobile/               Expo Router AG-UI client
packages/types/            shared client state contracts
```

## Commands

```bash
pnpm install
pnpm dev
pnpm check
pnpm test

cd agents
golangci-lint run ./...
go test -race ./...
go vet ./...
gofmt -w .
```

The gateway runs on port 8000. It mounts `/<agent>/agui`,
`/<agent>/agents/state`, `/<agent>/agui/capabilities`, and `/<agent>/health`.

## Go agent conventions

- Use strong domain types. Restrict `any` to JSON, ADK, MCP, and other library boundaries.
- Keep each agent under `agents/<name>/agent/` with `agent.go`, typed state,
  embedded `instructions.md`, deterministic tests, and a `tools/` package with
  one file per registered tool.
- Construct tools with ADK-Go `functiontool.New`; use task-mode child agents or
  `agent.New` custom routing for deterministic orchestration.
- State is authoritative. Commit validated state deltas through the shared
  transaction helper; never paste full artifacts into chat.
- Temporary secrets use `session.KeyPrefixTemp` and must never enter D1,
  AG-UI state snapshots, logs, or errors.
- Remote HTTP/MCP clients require TLS (loopback HTTP is test-only), bounded
  bodies, deadlines, allowlists, and sanitized errors.
- D1 and R2 are mandatory. Never add a local database or alternate persistence fallback.
- Preserve `/resume` as the only public agent route.

## Adding an agent

1. Add its typed package and tests under `agents/<name>/agent/`.
2. Register it explicitly in `agents/cmd/gateway/main.go`.
3. Add shared TypeScript state only for fields active clients consume.
4. Add route/identity/state contract coverage.
5. Run the full Go, web, and mobile checks plus both image smokes.

## Deployment

- Gateway: Railway using `agents/Dockerfile` and root `railway.toml`.
- Telegram: separate Railway service using `agents/Dockerfile.telegram` and
  `agents/railway.telegram.toml`.
- Both final images are static, non-root, and contain neither scripting runtime nor Node.
- Web: Vercel (`apps/web`). Mobile: EAS (`apps/mobile`).
- Production acceptance includes `agents/scripts/production-smoke.sh` and a
  Railway gateway RSS maximum below 0.4 GB measured by `measure-rss.sh`.
