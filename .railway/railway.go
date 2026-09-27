package main

import "github.com/railwayapp/railway-go-sdk"

// Railway defines the whole project; the CLI supplies the evaluation entry point.
func Railway() railway.Project {
	// SQLite volumes attach to one service and one replica.
	// Declare the existing region and capacity so applying IaC preserves them.
	data := railway.Volume("agents-data", map[string]any{"region": "us-west2", "sizeMB": 5000})
	gateway := railway.ServiceNamed("agents-gateway", railway.ServiceConfig{
		// Wait for GitHub CI so a failing main never deploys.
		"source": railway.Github("aranlucas/agents", map[string]any{"checkSuites": true}),
		// Railpack builds cmd/agents into /app/out and starts ./out.
		// Migrations run at startup,
		// since volumes are unavailable during pre-deploy.
		"build":        map[string]any{"builder": "RAILPACK"},
		"volumeMounts": map[string]any{"/app/.data": data},
		"healthcheck":  "/ready",
		"replicas":     map[string]any{"us-west2": 1},
		"deploy": map[string]any{
			// Serverless keeps the idle gateway's public endpoint available.
			"sleepApplication": true,
			"limitOverride": map[string]any{
				"containers": map[string]any{"cpu": 0.5, "memoryBytes": 500000000},
			},
		},
		"env": map[string]any{
			"APP_ENV": railway.Preserve(),

			// Browser origins and Clerk-issued JWT verification.
			"ALLOWED_ORIGINS":  railway.Preserve(),
			"CLERK_ISSUER":     railway.Preserve(),
			"CLERK_JWKS_URL":   railway.Preserve(),
			"CLERK_SECRET_KEY": railway.Preserve(),

			// Model providers.
			"GROQ_API_KEY":       railway.Preserve(),
			"MISTRAL_API_KEY":    railway.Preserve(),
			"NVIDIA_NIM_API_KEY": railway.Preserve(),
			"OPENROUTER_API_KEY": railway.Preserve(),

			// Agent-specific credentials.
			"BRAVE_API_KEY":                       railway.Preserve(),
			"GOOGLE_APPLICATION_CREDENTIALS_JSON": railway.Preserve(),

			// Observability. SENTRY_DSN is unset today; listing it keeps the gateway
			// from planning a delete once it is set in the dashboard.
			"SENTRY_DSN": railway.Preserve(),
		},
	})
	return railway.ProjectNamed("agents", []any{data, gateway})
}
