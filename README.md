# Agents

Go [ADK](https://pkg.go.dev/google.golang.org/adk/v2) service: one gateway serving every agent over AG-UI, backed by SQLite. The study app lives in [aranlucas/oral-boards](https://github.com/aranlucas/oral-boards).

## Development

Needs Go (latest stable; `mise.toml` installs it, `go.mod` sets the minimum), Make, and golangci-lint 2.13.1. No Node.js or CGO.

```sh
cp .env.example .env
make dev      # serves on :8000; migrates .data/agents.db on startup
```

| Target | Does |
|---|---|
| `make check` | golangci-lint (includes govet and gofumpt) and the contracts check |
| `make test` | race tests |
| `make build` | `bin/agents` (static, `CGO_ENABLED=0`) |
| `make vuln` | govulncheck |
| `make fmt` | `golangci-lint fmt` |
| `make contracts` | regenerates `api/contracts` and `scripts/generated-agent-routes.sh` |

CI runs `make check`, `make test`, and `make build vuln` as parallel jobs.

## Layout

- `cmd/agents` is the only deployable: `agents serve` (default) or `agents migrate`.
- `cmd/contracts` and `cmd/evalrun` are developer tools. Eval datasets live in `internal/agents/<agent>/eval/datasets`; reports go to `artifacts/<agent>/grade_results`.
- `internal/config` is the only package that reads the environment; `config.Keys` lists every variable.
- `internal/app` composes the database and every agent for `internal/gateway`.
- `internal/agents/<name>` holds each agent: expense, fitness, grocery, interview, jobs, presentation, research, spreadsheet, travel, trends, wellness.
- `internal/storage` owns SQLite: application tables, ADK sessions (`session/database`), and ADK artifacts.

## Persistence

One SQLite file at `DATABASE_PATH` (default `.data/agents.db`). Migrations in `migrations/sqlite` apply in file-name order at startup; they are append-only.

## HTTP surface

Per-agent AG-UI endpoints at `/<agent>/agui`, the agent runtime, and health checks: `/live` (process) and `/ready` (migrated database and agent build state). Runtime-state contracts are Go-canonical via `cmd/contracts`.

## Deployment

Railway builds `cmd/agents` with Railpack, mounts a volume at `/app/.data`, and runs one replica. A push to `main` deploys only after every GitHub check on that commit passes; a skipped deploy is not retried, so fix the check and push again (or `make railway-up`).

Infrastructure is code in [`.railway/railway.go`](.railway/README.md). Change it through a pull request: CI plans development and production and comments the diff; merging applies exactly that plan. Locally:

```sh
make railway-plan ENV=production
make railway-apply ENV=production CONFIRM_DESTRUCTIVE=1   # only when removing variables
make railway-up ENV=production                            # deploy the local checkout
```

`scripts/production-smoke.sh` checks a deployed gateway (`AGENTS_BASE_URL`, optional `SMOKE_AUTH_TOKEN`; needs bash, curl, jq).

## License

[MIT](LICENSE).
