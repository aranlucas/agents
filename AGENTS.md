# Repository instructions

- Use `make`; verify with `make check && make test`. Run validation commands sequentially; do not overlap checks, tests, or builds. Keep the configured worker limits so local validation leaves the computer responsive.
- Keep `go.mod` at the repository root, command entry points in `cmd`, and service implementation packages in `internal`. The deployable command is `cmd/agents`; developer tools are separate commands.
- Review Go agent changes against the [ADK Go reference](https://pkg.go.dev/google.golang.org/adk/v2).
- D1 and R2 are mandatory; do not add alternate persistence. Keep Worker names, bindings, and D1 migration history stable.
- The `/api/grocery/*` contract is spec-canonical: `api/openapi/grocery-gateway.yaml` is hand-authored; `oapi-codegen` generates the Go server/client. Agent runtime-state contracts remain Go-canonical via `cmd/contracts` as a separate system.
- Oral Boards is maintained in `github.com/aranlucas/oral-boards`; do not reintroduce frontend workspaces here.
