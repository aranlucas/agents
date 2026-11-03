# Agents

Go service hosting specialist AI workflows through AG-UI and agent-runtime endpoints, using Google's ADK and one SQLite database. The Oral Boards client lives in [its own repository](https://github.com/aranlucas/oral-boards).

## Run the gateway locally

Use Go satisfying [go.mod](go.mod), Make, and [Portless](https://github.com/vercel-labs/portless) (`npm install -g portless`). [mise.toml](mise.toml) selects the latest Go toolchain.

~~~sh
cp .env.example .env
~~~

Fill in `GROQ_API_KEY`, `OPENROUTER_API_KEY`, and `GOOGLE_APPLICATION_CREDENTIALS_JSON` in `.env` before starting: the gateway constructs every agent, including Trends' BigQuery client. Use your Clerk instance's `CLERK_JWKS_URL` and `CLERK_ISSUER` to authenticate client requests; grocery OAuth lookup also needs `CLERK_SECRET_KEY`. See [.env.example](.env.example) for integration settings.

~~~sh
make dev
~~~

Portless serves the gateway at `https://agents.localhost`; its first run may ask for `sudo` to bind port 443 and trust a local certificate. Startup applies pending SQLite migrations to `.data/agents.db` (override with `DATABASE_PATH`). Keep that file out of version control.

Run `make check && make test` before submitting changes; install golangci-lint matching [CI](.github/workflows/ci.yml). Other development targets are in the [Makefile](Makefile).

`/live` reports process responsiveness. `/ready` (also `/health`) checks the migrated database without calling model providers; all agents must build before the listener opens.

See [runtime rationale](docs/adk-runtime.md), [Railway operations](.railway/README.md), [planned user outcomes](ROADMAP.md), and [security requirements](SECURITY.md). Licensed under [MIT](LICENSE).
