# Railway infrastructure

The Go service deploys from the repository root with Railpack defaults: it builds the first command under `cmd/` (`cmd/agents`, kept first by a test) into `/app/out`, starts `./out` (which serves), and keeps the whole build directory in the runtime image, so `assets/` is present. The gateway health check is `/ready`, which requires a migrated database and reports whether the lazily built agent surface is `pending`, `ok`, or `failed`.

SQLite lives on the `agents-data` volume mounted at `/app/.data`, explicitly kept at 5000 MB in `us-west2`. Railway does not mount volumes during pre-deploy, so there is no pre-deploy command: `agents serve` applies migrations at startup. A volume attaches to one service and one replica, so keep the gateway at a single replica. Railpack's runtime image runs as root, so the root-owned volume is writable.

Infrastructure is authored in `.railway/railway.go` using Railway’s beta Go SDK, pinned in the repository root `go.mod`. The CLI evaluates `Railway()` with its own temporary entry point; Go resolves dependencies from the parent module, so there is no nested module or JavaScript package. Planning and applying require Go and the Railway CLI. CI installs the CLI through npm; pnpm is no longer needed.

`make check` and `make test` explicitly include `.railway`, since Go’s `./...` skips directories beginning with a dot. The graph fixture in `testdata/project.json` records the previous TypeScript configuration plus the existing volume region and capacity to verify the intended infrastructure settings. Update it when intentionally changing infrastructure.

```sh
make railway-plan ENV=production
make railway-apply ENV=production                          # non-destructive plans
make railway-apply ENV=production CONFIRM_DESTRUCTIVE=1    # plans that delete variables
make railway-up ENV=production                             # deploy the local checkout
```

Removing variables is destructive and needs `CONFIRM_DESTRUCTIVE=1` (`--confirm-destructive`), which the GitHub workflow never passes; apply those plans locally. The workflow applies development first and production second, and the production job runs in the `railway-production` GitHub environment, so adding required reviewers there gates it. It requires the existing `RAILWAY_API_TOKEN` repository secret.

The service source waits for the GitHub CI check suite (`checkSuites: true`), so a failing `main` does not deploy. If GitHub Actions cannot run (for example a billing hold), pushes are not deployed; use `make railway-up`.

Keep each preserved environment variable listed in the IaC source: omitted variables are planned for deletion. `internal/config` lists every variable the service reads in `config.Keys`, and a Go test fails if a production variable is missing here or if this file declares one the service never reads.

Telegram is optional and not deployed. The worker needs the same database file, so it cannot run as a separate Railway service with its own volume; run it in the gateway's container if it is ever needed.
