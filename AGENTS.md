# Repository instructions

- Use `make`; verify with `make check && make test`. Run validation commands sequentially; do not overlap checks, tests, or builds. Keep the configured worker limits so local validation leaves the computer responsive.
- Keep `go.mod` at the repository root, command entry points in `cmd`, and service implementation packages in `internal`. The deployable command is `cmd/agents`; developer tools are separate commands.
- Review Go agent changes against the [ADK Go reference](https://pkg.go.dev/google.golang.org/adk/v2).
- SQLite is the only persistence: one file at `DATABASE_PATH` (default `.data/agents.db`, a Railway volume in production). ADK sessions use ADK's `session/database` service; application tables use `internal/storage`. Do not add another database. Migrations in `migrations/sqlite` apply in file-name order and are append-only; never edit an applied file.
- Every environment variable is read in `internal/config` and listed in `config.Keys`; production variables must also be declared in `.railway/railway.ts` (a test enforces both).
- The `/api/grocery/*` contract is spec-canonical: `api/openapi/grocery-gateway.yaml` is hand-authored; `oapi-codegen` generates the Go server/client. Agent runtime-state contracts remain Go-canonical via `cmd/contracts` as a separate system.
- Oral Boards is maintained in `github.com/aranlucas/oral-boards`; do not reintroduce frontend workspaces here.
