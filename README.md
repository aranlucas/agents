# Agents

Go ADK service with an HTTP gateway and SQLite persistence. The study app lives in [aranlucas/oral-boards](https://github.com/aranlucas/oral-boards).

Requires Go 1.27+, Make, and golangci-lint 2.13.1 for checks. Shell smoke tests require bash, curl, and jq. The service does not require Node.js or CGO; the Railway targets need the Railway CLI.

```sh
cp .env.example .env
make dev
```

The single deployable executable is built with `make build` as `bin/agents`. It defaults to `serve`; `agents migrate` applies the embedded migrations to `DATABASE_PATH` without serving. Configuration comes from the environment and `.env`; never commit credentials.

```sh
make check
make test
make build
```

Local validation runs sequentially with `GOMAXPROCS=2`, `GOFLAGS=-p=1`, two test parallel slots, and two lint workers. CI uses the tools' default concurrency to use all available runner CPUs; race detection remains enabled.

## Layout

The root `go.mod` declares `github.com/aranlucas/agents`. Commands live in `cmd/`; server implementations and domain agents live in `internal/`, following the [Go server layout guidance](https://go.dev/doc/modules/layout#server-project).

- `cmd/agents` dispatches `serve` and `migrate`; each mode is a `func(context.Context) error`.
- `internal/config` is the only package that reads the environment. `config.Keys` lists every variable.
- `internal/app` is the shared composition root: it opens the database and builds every agent for the gateway.
- `internal/agents/<name>` holds each authored ADK agent (instructions, tools, state).
- `internal/grocerystore` persists households, grocery lists, recipes, and the shopping profile for agent tools.
- `internal/storage` owns SQLite: application tables through `Statement` batches (one transaction per batch), ADK sessions through ADK's `session/database` service, and versioned ADK artifacts.
- `cmd/contracts` and `cmd/evalrun` are development tools and are not shipped in the service image. Evaluation datasets live beside their agent under `internal/agents/<agent>/eval/datasets`; reports go to `artifacts/<agent>/grade_results`.

## Persistence

SQLite is the only application persistence. The database is one file at `DATABASE_PATH` (default `.data/agents.db`, which is git-ignored). `agents serve` applies migrations at startup, so a fresh checkout needs no setup. Migrations in `migrations/sqlite` apply in file-name order; each file name is its permanent version, so only ever append new files.

## Contracts

The HTTP surface exposes AG-UI, agent runtime, and deployment health endpoints. Runtime-state contracts remain Go-canonical through `cmd/contracts`: `make contracts` writes JSON schemas to `api/contracts` and the shell route catalog to `scripts/generated-agent-routes.sh`. External TypeScript clients can export a projection explicitly with `go run ./cmd/contracts -typescript-output /absolute/path/agent-contracts.ts`.

## Deployment

Railway builds the service with Railpack (no Dockerfile) and mounts a volume at `/app/.data` for the database; it runs a single replica. Configuration is isolated in [`.railway`](.railway/README.md).

```sh
make railway-plan ENV=production                          # preview config changes
make railway-apply ENV=production CONFIRM_DESTRUCTIVE=1   # apply a reviewed plan
make railway-up ENV=production                            # deploy the local checkout
```

## License

The source code is available under the [MIT License](LICENSE). Career profiles and credentials belong in user input or private runtime configuration, not the repository.
