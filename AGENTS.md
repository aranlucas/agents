# Repository instructions

- Use `make`; verify with `make check && make test`. Run validation commands sequentially; do not overlap checks, tests, or builds. Keep the configured worker limits so local validation leaves the computer responsive.
- Keep `go.mod` at the repository root, command entry points in `cmd`, and service implementation packages in `internal`. The deployable command is `cmd/agents`; developer tools are separate commands.
- Review Go agent changes against the [ADK Go reference](https://pkg.go.dev/google.golang.org/adk/v2).
- SQLite is the only persistence: one file at `DATABASE_PATH` (default `.data/agents.db`, a Railway volume in production). ADK sessions use ADK's `session/database` service; application tables use `internal/storage`. Do not add another database. Migrations in `migrations/sqlite` apply in file-name order and are append-only; never edit an applied file.
- Every environment variable is read in `internal/config` and listed in `config.Keys`; production variables must also be declared in `.railway/railway.go` (a test enforces both).
- The HTTP surface is limited to AG-UI, agent runtime, and deployment health endpoints.
- Oral Boards is maintained in `github.com/aranlucas/oral-boards`; do not reintroduce frontend workspaces here.

## Scripts: native first

Before adding a script file (`scripts/`, `bin/`, `tools/`, root `*.sh|*.py|*.mjs`) or a package script that runs one, take the first rung that works:

1. A flag or subcommand of a tool the repo already uses (`<tool> --help`).
2. Declarative config for that tool (`go.mod`, `.golangci.yml`, `mise.toml`).
3. A maintained plugin for that tool.
4. A one-line Makefile target that calls a native command.
5. A test in the existing runner (go test), for anything that asserts.
6. A custom script, only for behavior specific to this repo. Its first comment names the native rung it couldn't use and why. It has a test in the existing runner, and the PR that adds it quotes that comment.

## Code: libraries first

Before hand-writing general-purpose code, use a well-maintained library: actively released, widely adopted, typed, and a fit for this stack. Reach for one already in the dependencies first. Write custom code for domain logic and for the glue no library covers. A PR that adds a dependency says why it was picked; a PR that hand-writes something a library covers names the library and why it didn't fit.

- HTTP routing and clients → Go's net/http.
- JSON encoding and decoding → Go's encoding/json/v2 and encoding/json/jsontext.
- Clerk JWT verification → github.com/clerk/clerk-sdk-go/v2/jwt.
