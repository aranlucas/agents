# Railway infrastructure

The Go service deploys from the repository root using `Dockerfile` and one `/app/agents` executable. The predeploy command is `/app/agents migrate`; the gateway health check is `/ready`. The existing `agents-gateway` service, two environments, region, scale, preserved environment variables, and GitHub source are unchanged.

Railway supports infrastructure configuration only through TypeScript. `.railway/railway.ts` is deployment tooling, isolated from the Go module and runtime image; it has its own package manifest and lockfile. It is not an application workspace.

```sh
pnpm --dir .railway install --frozen-lockfile
railway link --project agents --environment production --service agents-gateway
railway config plan
```

Apply a reviewed plan with `railway config apply`. Repeat for development. The GitHub infrastructure workflow installs this isolated package before planning and applying both environments; it requires the existing `RAILWAY_API_TOKEN` repository secret. No live infrastructure is changed by editing these files.

Keep each preserved environment variable listed in the IaC source: omitted variables can be planned for deletion. D1 and R2 names/bindings are managed separately in `cloudflare/wrangler.toml` and must remain stable. Do not add `railway.json` or `railway.toml` alongside the existing IaC configuration.

Telegram is optional and is not currently deployed. If needed, configure a worker with the same Dockerfile and `/app/agents telegram`; it does not require a second image or binary.
