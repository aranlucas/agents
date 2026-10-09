# A team of focused AI agents, behind one gateway

[![CI](https://github.com/aranlucas/agents/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/aranlucas/agents/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/github/license/aranlucas/agents)](LICENSE)
![Go](https://img.shields.io/badge/Go-1.27-00ADD8?logo=go&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-one_database-003B57?logo=sqlite&logoColor=white)

![Illustration of specialist AI workflows connected through one shared gateway](docs/images/readme-cover.png)

*Concept artwork for the agent platform; it does not show the running application.*


Give each job to the agent built for it, and give every client one place to connect. This Go service hosts focused workflows for grocery planning, travel, fitness, research, job search, spreadsheets, and more through AG-UI and agent-runtime endpoints. Google's ADK powers the agents; a single SQLite database stores their sessions and application data.

> “Help me plan meals for the week” goes to Grocery. “Build me a weekend itinerary” goes to Travel. The gateway handles the shared runtime and persistence around them.

## One gateway, many workflows

The current catalog includes agents for expense tracking, fitness, grocery planning, interviews, job search, presentations, research, spreadsheets, travel, trends, and wellness. The separate Oral Boards web app is maintained in [its own repository](https://github.com/aranlucas/oral-boards).

~~~mermaid
flowchart LR
  Client[Web or mobile client] --> Gateway[Go gateway]
  Gateway --> Agents[Focused ADK agents]
  Agents --> Store[(SQLite sessions and app data)]
  Gateway --> Health[Live and ready checks]
~~~

## Run the gateway locally

Requirements: Go 1.27.1 or a compatible toolchain, Make, and Node.js 24 or newer for [Portless](https://github.com/vercel-labs/portless/tree/v0.15.7). The `mise.toml` file pins the Go toolchain.

~~~sh
npm install -g portless@0.15.7
cp .env.example .env
make dev
~~~

The gateway is available at `https://agents.localhost`, including `/live` and `/ready`. Portless assigns the backend port through the existing `PORT` setting. The server applies pending SQLite migrations at startup. The database file defaults to `.data/agents.db`; set `DATABASE_PATH` in `.env` to use another path. Add the provider or service credentials needed by the workflows you want to run.

| Command | Why you might use it |
| --- | --- |
| `make check` | Run lint and verify generated runtime contracts. |
| `make test` | Run the Go race-enabled test suite. |
| `make build` | Build the static gateway binary at `bin/agents`. |
| `make vuln` | Run govulncheck against the Go packages. |
| `make contracts` | Regenerate API contracts and agent route scripts. |

### Local development URLs

`make dev` runs the gateway through Portless on its assigned backend port.

A linked Git worktree gets a branch-prefixed hostname, such as
`https://fix-ui.agents.localhost`. Worktrees still need separate `DATABASE_PATH`
values for isolated application data. For a browser client on a different
origin, include that exact frontend origin in `ALLOWED_ORIGINS`.

Portless starts a shared HTTPS proxy and may request local administrator access on
first use to bind port 443 and trust its development certificate. Use the URL it
prints if your proxy uses a custom port or domain. Stop the command with Ctrl+C;
`portless doctor` checks local proxy, certificate, and DNS setup.

## Find your way around

- `cmd/agents` contains the deployable server and migration commands.
- `internal/app` assembles configuration, persistence, and the gateway.
- `internal/agents/<name>` contains agent workflows and their evaluations.
- `internal/gateway` exposes AG-UI, agent-runtime, and health endpoints.
- `internal/config` is the single reader for environment variables.
- `internal/storage` owns SQLite tables, ADK sessions, and artifacts.
- `migrations/sqlite` contains append-only, filename-ordered migrations.
- `api/contracts` and `cmd/contracts` define and verify runtime-state contracts.

The `/live` endpoint reports process health. `/ready` checks database migrations and agent build state.

See [ADK runtime choices](docs/adk-runtime.md) for the pinned upstream revision, provider APIs, conversation compaction, and MCP tracing and connection lifetime.

## Deploy

Railway builds `cmd/agents` and mounts persistent storage at `/app/.data`. Infrastructure configuration is in [`.railway/`](.railway/README.md). GitHub checks must pass before the service is updated.
