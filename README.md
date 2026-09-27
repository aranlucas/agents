# Agents

Go ADK service with an HTTP gateway, optional Telegram worker mode, Cloudflare D1 sessions, and R2 artifacts. The study app lives in [aranlucas/oral-boards](https://github.com/aranlucas/oral-boards).

Requires Go 1.27+, Make, and golangci-lint 2.13.1 for checks. Shell smoke tests require bash, curl, and jq. The service and image do not require Node.js. Development and validation use Make.

```sh
cp .env.example .env
make dev
```

The single deployable executable is built with `make build` as `bin/agents`. It defaults to `serve`; `agents migrate` applies the unchanged embedded D1 migrations, and `agents telegram` runs the optional long-poll worker. Configuration comes from the environment and `.env`; never commit credentials.

```sh
make check
make test
make build
```

Validation runs sequentially with `GOMAXPROCS=2`, `GOFLAGS=-p=1`, two test parallel slots, and two lint workers. `docker compose up --build agents` runs the gateway. `docker compose --profile telegram up --build` also starts the optional worker using the same image and executable.

The root `go.mod` declares `github.com/aranlucas/agents`. Commands live in `cmd/`; server implementations and domain agents live in `internal/`, following the [Go server layout guidance](https://go.dev/doc/modules/layout#server-project). `cmd/contracts` and `cmd/evalrun` are development tools and are not shipped in the service image. Evaluation datasets live beside their agent under `internal/<agent>/eval/datasets`; reports go to `artifacts/<agent>/grade_results`.

The hand-authored grocery API spec remains canonical in `api/openapi/grocery-gateway.yaml`; `make api` generates its Go server/client. Runtime-state contracts remain Go-canonical through `cmd/contracts`: `make contracts` writes JSON schemas to `api/contracts` and the shell route catalog to `scripts/generated-agent-routes.sh`. External TypeScript clients can export a projection explicitly with `go run ./cmd/contracts -typescript-output /absolute/path/agent-contracts.ts`.

D1 and R2 remain the only application persistence layers. The bundled SQLite file under `assets/oralboards` is an immutable reference corpus. Worker names, bindings, and D1 migration contents and versions are unchanged.

Railway deployment configuration is isolated in [`.railway`](.railway/README.md). It points to the root Dockerfile and uses `/app/agents migrate` before deployment. Existing cloud deployments are not modified by this local restructuring.
