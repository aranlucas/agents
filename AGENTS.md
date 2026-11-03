# Repository instructions

- Use `make`; verify with `make check && make test`. Run validation commands sequentially; do not overlap checks, tests, or builds. Keep the configured worker limits so local validation leaves the computer responsive.
- Keep one root Go module, command entry points in `cmd`, and service implementation in `internal`. `cmd/agents` is the deployable command; developer tools stay separate.
- Review Go agent changes against the [ADK Go reference](https://pkg.go.dev/google.golang.org/adk/v2).
- Validate tool arguments in application handlers; provider schemas do not replace domain validation.
- Use one SQLite file for persistence. ADK sessions use ADK's `session/database` service; application tables use `internal/storage`. Migrations in `migrations/sqlite` are filename-ordered and append-only; never edit an applied file.
- Define environment configuration in `internal/config` and list keys in `config.Keys`; production-supplied variables must also be declared in `.railway/railway.go`.
- The HTTP surface is limited to AG-UI, agent runtime, and deployment health endpoints.
- Oral Boards is maintained in `github.com/aranlucas/oral-boards`; do not reintroduce frontend workspaces here.

## Tooling

Before adding scripts or package scripts, try existing tool flags/subcommands, declarative config, maintained plugins, then a one-line Make target. Put assertions in Go tests. Custom scripts must cover repository-specific behavior unavailable through those options; their first comment names the native option that could not be used and why, they have Go test coverage, and the adding PR quotes that comment.

Use maintained libraries for general-purpose code, preferring existing dependencies. Dependency additions explain the choice in the PR; custom alternatives explain why the library did not fit.

- HTTP routing and clients: `net/http`.
- JSON: `encoding/json/v2` and `encoding/json/jsontext`.
- Clerk JWT verification: `github.com/clerk/clerk-sdk-go/v2/jwt`.
