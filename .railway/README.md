# Railway infrastructure

The Go service deploys from the repository root with Railpack defaults: it builds the first command under `cmd/` (`cmd/agents`, kept first by a test) into `/app/out`, starts `./out` (which serves), and keeps the whole build directory in the runtime image. The gateway health check is `/ready`, which requires a migrated database and reports whether the lazily built agent surface is `pending`, `ok`, or `failed`.

SQLite lives on the `agents-data` volume mounted at `/app/.data`, explicitly kept at 5000 MB in `us-west2`. Railway does not mount volumes during pre-deploy, so there is no pre-deploy command: `agents serve` applies migrations at startup. A volume attaches to one service and one replica, so keep the gateway at a single replica. Railpack's runtime image runs as root, so the root-owned volume is writable.

Infrastructure is authored in `.railway/railway.go` using Railway’s beta Go SDK, pinned in the repository root `go.mod`. The CLI evaluates `Railway()` with its own temporary entry point; Go resolves dependencies from the parent module, so there is no nested module or JavaScript package. Planning and applying require Go and the Railway CLI.

`make check` and `make test` explicitly include `.railway`, since Go’s `./...` skips directories beginning with a dot. For the same reason `go mod tidy` cannot see the SDK import here; `internal/railwaysdk` imports it behind a `tidy` build tag so tidy keeps it. The graph fixture in `testdata/project.json` records the previous TypeScript configuration plus the existing volume region and capacity to verify the intended infrastructure settings. Update it when intentionally changing infrastructure.

```sh
make railway-plan ENV=production
make railway-apply ENV=production                          # non-destructive plans
make railway-apply ENV=production CONFIRM_DESTRUCTIVE=1    # plans that delete variables
make railway-up ENV=production                             # deploy the local checkout
```

Pull requests that touch `.railway/` run `railway-plan.yml`: [`railwayapp/config`](https://github.com/railwayapp/config) plans development and production, comments production's diff on the pull request (marking destructive changes), and uploads each plan as an artifact pinned to the change set, the environment's config etag, and the `.railway/` tree. After merge, `railway-apply.yml` applies exactly those plans, development first, then production in the `railway-production` GitHub environment (add required reviewers there to gate it). Apply never re-plans: if an environment or `.railway/` changed since the plan, it fails, and a new pull request re-plans. Merging approves destructive changes, so variable removals no longer need a local apply. Direct pushes to `main` have no pinned plan and fail by design. The workflows need environment-scoped project tokens in the `RAILWAY_TOKEN_DEVELOPMENT` and `RAILWAY_TOKEN_PRODUCTION` repository secrets. Locally, removing variables still needs `CONFIRM_DESTRUCTIVE=1` (`--confirm-destructive`).

The service source waits for the GitHub CI check suite (`checkSuites: true`), so a failing `main` does not deploy. If GitHub Actions cannot run (for example a billing hold), pushes are not deployed; use `make railway-up`.

Keep each preserved environment variable listed in the IaC source: omitted variables are planned for deletion. `internal/config` lists every variable the service reads in `config.Keys`, and a Go test fails if a production variable is missing here or if this file declares one the service never reads.
