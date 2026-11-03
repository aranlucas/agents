# Railway operations

SQLite lives on the `agents-data` volume at `/app/.data`. Keep its region and capacity explicit in [railway.go](railway.go) to avoid an unintended volume reset, and keep one replica because the volume cannot be shared across replicas. Volumes are unavailable during pre-deploy, so the server migrates the database at startup. All agents build before listening; `/ready` checks the migrated database without calling providers.

Railpack builds the first directory under `cmd/` into `/app/out` and starts `./out`. Keep `cmd/agents` first; a test protects that ordering. The Go SDK uses the root module. [internal/railwaysdk](../internal/railwaysdk/tidy.go) retains the SDK dependency for `go mod tidy`, which otherwise skips `.railway/`. `make check` and `make test` explicitly include this directory. Update [the infrastructure fixture](testdata/project.json) when intentionally changing the graph.

## Plan and apply

Review the production plan on the pull request before merging. [The plan workflow](../.github/workflows/railway-plan.yml) uploads a plan pinned to the change set, environment etag, and `.railway/` tree; [the apply workflow](../.github/workflows/railway-apply.yml) applies it after merge without re-planning. Merging approves marked destructive changes. Configure required reviewers on the `railway-production` GitHub environment for a separate approval gate. Both workflows use `RAILWAY_TOKEN_PRODUCTION`.

If the environment or `.railway/` changes after planning, apply fails: use a new pull request to re-plan. Direct pushes to `main` have no pinned plan and fail by design.

For local operations, install Go and the Railway CLI and authenticate to the project:

```sh
make railway-plan ENV=production
make railway-apply ENV=production
# Only after reviewing a plan that deletes variables:
make railway-apply ENV=production CONFIRM_DESTRUCTIVE=1
```

Keep every variable to preserve declared in `railway.go`; omitted variables are planned for deletion. The production entries in `config.Keys` are checked against the evaluated infrastructure graph.

## Deploy when GitHub CI is unavailable

The service waits for GitHub checks before deploying a push. If Actions cannot run, `make railway-up ENV=production` deploys the local checkout and bypasses that wait. Run `make check && make test` and review the checkout before using this manual path.
