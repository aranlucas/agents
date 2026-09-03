# Railway configuration

This project defines its Railway infrastructure in code.

```txt
.railway/railway.ts
```

Use this file to describe the Railway project you want: services, databases, buckets, custom domains, replicas, groups, and environment variables.

## This repository

The `agents` project has one service, `agents-gateway`, in two environments:

| Environment   | Notes                                        |
| ------------- | -------------------------------------------- |
| `production`  | Sleeps when idle (`sleepApplication: true`). |
| `development` | Sleeps when idle (`sleepApplication: true`). |

Both environments use the same configuration. Plan and apply target one environment at a time — run both.

```bash
railway link --project agents --environment production
railway config plan
```

## Continuous apply

`.github/workflows/railway.yml` applies this configuration to development and
then production when `.railway/**` or the workflow itself changes on `main`.
It can also be run manually from GitHub Actions. Ordinary application commits
do not reapply unchanged infrastructure configuration.

The GitHub source has Railway's Wait for CI setting disabled, so source deploys
start immediately instead of waiting for every monorepo push workflow.

The workflow requires a workspace-scoped Railway token in the
`RAILWAY_API_TOKEN` repository secret so it can manage both environments. It
does not pass `--confirm-destructive`, so a destructive plan fails safely and
must be reviewed and applied manually.

Secrets are rendered as `preserve()`, which means "keep whatever is already set in Railway". No secret values live in this repo.

**Every variable the service should keep must be listed in `env`.** A variable that exists in Railway but is missing from `.railway/railway.ts` is planned as a destructive `Delete variable`. Add new variables here at the same time you add them in the dashboard.

This replaced the former `railway.toml` and `agents/railway.telegram.toml`. A service cannot be managed by Config as Code and Infrastructure as Code at the same time, so do not reintroduce a `railway.json`/`railway.toml` for `agents-gateway`.

The Telegram worker is not deployed. To deploy it, add a second `service("agents-telegram", ...)` using `agents/Dockerfile.telegram` and add it to the `resources` array.

## Common commands

Create the configuration files:

```bash
railway config init
```

Import an existing Railway project into code:

```bash
railway config pull
```

Preview what Railway would change:

```bash
railway config plan
```

Apply the planned changes:

```bash
railway config apply
```

## Notes

- `railway config plan` is safe and does not change Railway.
- `railway config apply` previews changes and asks before applying unless you pass `--yes`.
- Destructive changes in non-interactive or agent sessions require `railway config apply --confirm-destructive` after reviewing the plan.
- Services already managed by `railway.json` must be migrated before `.railway/railway.ts` can manage them.
- Use `replicas` for scaling; advanced placement can still specify region names.
- Use `group("Name", [resources])` to keep large projects organized on the Railway canvas.
- Secrets imported from Railway are rendered as `preserve()` so existing values are retained without writing secret values to source. Use `railway config pull --omit-preserved-variables` for a smaller import.
- `railway config plan --detailed-exit-code` exits `2` when changes are pending, which is useful for gating CI on drift.
