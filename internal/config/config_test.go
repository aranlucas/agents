package config

import (
	"maps"
	"strings"
	"testing"
)

func TestLoadNormalizesHTTPAndProviderConfiguration(t *testing.T) {
	env := requiredEnv()
	env["PORT"] = " 9000 "
	env["ALLOWED_ORIGINS"] = " https://app.example.com,https://mobile.example.com, https://app.example.com "
	env["GROQ_API_KEY"] = "secret"

	cfg, err := Load(func(key string) string { return env[key] })
	if err != nil {
		t.Fatal(err)
	}
	if cfg.HTTP.Port != "9000" {
		t.Fatalf("port = %q", cfg.HTTP.Port)
	}
	if cfg.Environment != EnvironmentTest {
		t.Fatalf("environment = %q", cfg.Environment)
	}
	if got := strings.Join(cfg.HTTP.Origins, ","); got != "https://app.example.com,https://mobile.example.com" {
		t.Fatalf("origins = %q", got)
	}
	provider, ok := cfg.Providers["groq"]
	if !ok || provider.APIKey != "secret" || provider.BaseURL != "https://api.groq.com/openai/v1" {
		t.Fatalf("provider = %#v, present = %v", provider, ok)
	}
}

func TestProviderAPIsAreSharedByGatewayAndEval(t *testing.T) {
	providers := LoadProviders(func(string) string { return "fixture-key" })
	for name, api := range map[string]ModelAPI{
		"groq": ResponsesAPI, "nvidia": ChatCompletionsAPI,
		"mistral": ChatCompletionsAPI, "openrouter": ChatCompletionsAPI,
	} {
		if providers[name].API != api {
			t.Errorf("%s API = %q, want %q", name, providers[name].API, api)
		}
	}
}

func TestLoadAcceptsWildcardOrigin(t *testing.T) {
	env := requiredEnv()
	env["ALLOWED_ORIGINS"] = "*"
	cfg, err := Load(func(key string) string { return env[key] })
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(cfg.HTTP.Origins, ","); got != "*" {
		t.Fatalf("origins = %q", got)
	}
}

func TestLoadDefaultsToWildcardOrigin(t *testing.T) {
	env := requiredEnv()
	cfg, err := Load(func(key string) string { return env[key] })
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(cfg.HTTP.Origins, ","); got != "*" {
		t.Fatalf("origins = %q", got)
	}
}

func TestLoadRequiresExplicitEnvironment(t *testing.T) {
	env := requiredEnv()
	delete(env, "APP_ENV")
	_, err := Load(func(key string) string { return env[key] })
	if err == nil || !strings.Contains(err.Error(), "APP_ENV is required") {
		t.Fatalf("Load() error = %v", err)
	}
}

func TestLoadRejectsDevelopmentProfileOnRailway(t *testing.T) {
	env := requiredEnv()
	env["APP_ENV"] = "development"
	env["RAILWAY_ENVIRONMENT_ID"] = "production-environment"
	_, err := Load(func(key string) string { return env[key] })
	if err == nil || !strings.Contains(err.Error(), "APP_ENV must be production") {
		t.Fatalf("Load() error = %v", err)
	}
}

func TestLoadProductionFailsClosed(t *testing.T) {
	base := requiredEnv()
	base["APP_ENV"] = "production"
	base["ALLOWED_ORIGINS"] = "https://agents.example.com"
	base["CLERK_JWKS_URL"] = "https://clerk.example.com/.well-known/jwks.json"
	base["CLERK_ISSUER"] = "https://clerk.example.com"

	for name, mutate := range map[string]func(map[string]string){
		"missing Google key": func(env map[string]string) { delete(env, "GOOGLE_APPLICATION_CREDENTIALS_JSON") },
		"missing origins":    func(env map[string]string) { delete(env, "ALLOWED_ORIGINS") },
		"HTTP origin":        func(env map[string]string) { env["ALLOWED_ORIGINS"] = "http://agents.example.com" },
		"missing Clerk JWKS": func(env map[string]string) { delete(env, "CLERK_JWKS_URL") },
		"missing Clerk issuer": func(env map[string]string) {
			delete(env, "CLERK_ISSUER")
		},
	} {
		t.Run(name, func(t *testing.T) {
			env := mapsClone(base)
			mutate(env)
			if _, err := Load(func(key string) string { return env[key] }); err == nil {
				t.Fatal("Load() succeeded")
			}
		})
	}

	cfg, err := Load(func(key string) string { return base[key] })
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.Environment.IsProduction() || strings.Join(cfg.HTTP.Origins, ",") != "https://agents.example.com" {
		t.Fatalf("production config = %#v", cfg)
	}
}

func TestLoadProductionAcceptsWildcardOrigin(t *testing.T) {
	env := requiredEnv()
	env["APP_ENV"] = "production"
	env["ALLOWED_ORIGINS"] = "*"
	env["CLERK_JWKS_URL"] = "https://clerk.example.com/.well-known/jwks.json"
	env["CLERK_ISSUER"] = "https://clerk.example.com"

	cfg, err := Load(func(key string) string { return env[key] })
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.Environment.IsProduction() || strings.Join(cfg.HTTP.Origins, ",") != "*" {
		t.Fatalf("production wildcard config = %#v", cfg)
	}
}

func TestLoadRejectsInvalidPortAndOriginComponents(t *testing.T) {
	for name, input := range map[string][2]string{
		"invalid port":       {"PORT", "70000"},
		"origin query":       {"ALLOWED_ORIGINS", "https://app.example.com?tenant=one"},
		"origin credentials": {"ALLOWED_ORIGINS", "https://user@app.example.com"},
	} {
		t.Run(name, func(t *testing.T) {
			env := requiredEnv()
			env[input[0]] = input[1]
			if _, err := Load(func(key string) string { return env[key] }); err == nil {
				t.Fatal("Load() succeeded")
			}
		})
	}
}

func TestLoadAllowsLocalhostHTTPOriginInProduction(t *testing.T) {
	env := requiredEnv()
	env["APP_ENV"] = "production"
	env["ALLOWED_ORIGINS"] = "http://localhost:3000"
	env["CLERK_JWKS_URL"] = "https://clerk.example.com/.well-known/jwks.json"
	env["CLERK_ISSUER"] = "https://clerk.example.com"

	cfg, err := Load(func(key string) string { return env[key] })
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.Environment.IsProduction() || strings.Join(cfg.HTTP.Origins, ",") != "http://localhost:3000" {
		t.Fatalf("production localhost cors config = %#v", cfg)
	}
}

func TestLoadRejectsNonLocalHTTPOriginInProduction(t *testing.T) {
	env := requiredEnv()
	env["APP_ENV"] = "production"
	env["ALLOWED_ORIGINS"] = "http://app.example.com"
	env["CLERK_JWKS_URL"] = "https://clerk.example.com/.well-known/jwks.json"
	env["CLERK_ISSUER"] = "https://clerk.example.com"
	if _, err := Load(func(key string) string { return env[key] }); err == nil {
		t.Fatal("Load() succeeded")
	}
}

func TestLoadDatabaseDefaultsToLocalDataFile(t *testing.T) {
	env := map[string]string{"APP_ENV": "production", "RAILWAY_SERVICE_ID": "gateway-service"}
	environment, path, err := LoadDatabase(func(key string) string { return env[key] })
	if err != nil || !environment.IsProduction() || path != ".data/agents.db" {
		t.Fatalf("LoadDatabase() = %q, %q, %v", environment, path, err)
	}
	env["DATABASE_PATH"] = " /data/agents.db "
	if _, path, _ := LoadDatabase(func(key string) string { return env[key] }); path != "/data/agents.db" {
		t.Fatalf("DATABASE_PATH override = %q", path)
	}
}

func TestLoadIntegrationsDefaultsAndValidation(t *testing.T) {
	integrations, err := LoadIntegrations(func(string) string { return "" })
	if err != nil || integrations.KrogerMCPURL != defaultKrogerMCPURL || integrations.TRVLMCPURL != defaultTRVLMCPURL {
		t.Fatalf("defaults = %#v, %v", integrations, err)
	}
	env := map[string]string{"GOOGLE_APPLICATION_CREDENTIALS_JSON": `{"project_id":"billing-project"}`}
	integrations, err = LoadIntegrations(func(key string) string { return env[key] })
	if err != nil || integrations.GoogleProjectID != "billing-project" {
		t.Fatalf("service account = %#v, %v", integrations, err)
	}
	for name, bad := range map[string][2]string{
		"credentials without project": {"GOOGLE_APPLICATION_CREDENTIALS_JSON", `{}`},
		"credentials not JSON":        {"GOOGLE_APPLICATION_CREDENTIALS_JSON", `nope`},
		"plain HTTP MCP":              {"KROGER_MCP_URL", "http://example.com/mcp"},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := LoadIntegrations(func(key string) string { return map[string]string{bad[0]: bad[1]}[key] }); err == nil {
				t.Fatal("LoadIntegrations() succeeded")
			}
		})
	}
}

func mapsClone(source map[string]string) map[string]string {
	clone := make(map[string]string, len(source))
	maps.Copy(clone, source)
	return clone
}

func requiredEnv() map[string]string {
	return map[string]string{
		"APP_ENV":                             "test",
		"GEMINI_API_KEY":                      "gemini",
		"GOOGLE_APPLICATION_CREDENTIALS_JSON": `{"project_id":"project"}`,
	}
}
