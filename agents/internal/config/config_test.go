package config

import (
	"strings"
	"testing"
)

func TestLoadRequiresCloudflarePersistence(t *testing.T) {
	_, err := Load(func(key string) string {
		return map[string]string{"APP_ENV": "test", "PORT": "8000"}[key]
	})
	if err == nil || !strings.Contains(err.Error(), "CF_ACCOUNT_ID") {
		t.Fatalf("Load() error = %v, want missing Cloudflare configuration", err)
	}
}

func TestLoadNormalizesHTTPAndProviderConfiguration(t *testing.T) {
	env := requiredEnv()
	env["PORT"] = " 9000 "
	env["ALLOWED_ORIGINS"] = " https://app.example.com,https://mobile.example.com, https://app.example.com "
	env["GROQ_API_KEY"] = "secret"
	env["SHOPPING_SERVICE_SECRET"] = "  worker-secret  "

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
	if cfg.ShoppingServiceSecret != "worker-secret" {
		t.Fatalf("shopping service secret = %q", cfg.ShoppingServiceSecret)
	}
	if got := strings.Join(cfg.HTTP.Origins, ","); got != "https://app.example.com,https://mobile.example.com" {
		t.Fatalf("origins = %q", got)
	}
	provider, ok := cfg.Providers["groq"]
	if !ok || provider.APIKey != "secret" || provider.BaseURL != "https://api.groq.com/openai/v1" {
		t.Fatalf("provider = %#v, present = %v", provider, ok)
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
		"missing D1 database": func(env map[string]string) { delete(env, "CF_D1_DATABASE_ID") },
		"missing R2 bucket":   func(env map[string]string) { delete(env, "CF_R2_BUCKET_NAME") },
		"missing origins":     func(env map[string]string) { delete(env, "ALLOWED_ORIGINS") },
		"HTTP origin":         func(env map[string]string) { env["ALLOWED_ORIGINS"] = "http://agents.example.com" },
		"missing Clerk JWKS":  func(env map[string]string) { delete(env, "CLERK_JWKS_URL") },
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

func TestLoadTelegramRequiresWorkerDependenciesOnly(t *testing.T) {
	env := requiredEnv()
	env["APP_ENV"] = "production"
	env["RAILWAY_SERVICE_ID"] = "telegram-service"
	env["MISTRAL_API_KEY"] = "mistral-key"

	cfg, err := LoadTelegram(func(key string) string { return env[key] })
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.Environment.IsProduction() || cfg.HTTP.Port != "8080" || cfg.Cloudflare.R2Bucket != "artifacts" || cfg.Providers["mistral"].APIKey != "mistral-key" {
		t.Fatalf("Telegram config = %#v", cfg)
	}
	if cfg.ClerkJWKS != "" || cfg.ClerkIssuer != "" || len(cfg.HTTP.Origins) != 0 {
		t.Fatalf("Telegram loaded gateway-only config = %#v", cfg)
	}

	delete(env, "CF_R2_BUCKET_NAME")
	if _, err := LoadTelegram(func(key string) string { return env[key] }); err == nil || !strings.Contains(err.Error(), "CF_R2_BUCKET_NAME") {
		t.Fatalf("LoadTelegram() error = %v", err)
	}
}

func TestLoadD1RequiresOnlyMigrationDependencies(t *testing.T) {
	env := map[string]string{
		"APP_ENV":                 "production",
		"RAILWAY_SERVICE_ID":      "gateway-service",
		"CF_ACCOUNT_ID":           "account",
		"CF_API_TOKEN":            "token",
		"CF_D1_DATABASE_ID":       "database",
		"CF_R2_BUCKET_NAME":       "",
		"CLERK_JWKS_URL":          "",
		"CLERK_ISSUER":            "",
		"ALLOWED_ORIGINS":         "",
		"CF_R2_ACCESS_KEY_ID":     "",
		"CF_R2_SECRET_ACCESS_KEY": "",
	}
	environment, cloudflare, err := LoadD1(func(key string) string { return env[key] })
	if err != nil {
		t.Fatal(err)
	}
	if !environment.IsProduction() || cloudflare.D1DatabaseID != "database" || cloudflare.R2Bucket != "" {
		t.Fatalf("migration config = environment:%q cloudflare:%#v", environment, cloudflare)
	}
	delete(env, "CF_D1_DATABASE_ID")
	if _, _, err := LoadD1(func(key string) string { return env[key] }); err == nil || !strings.Contains(err.Error(), "CF_D1_DATABASE_ID") {
		t.Fatalf("LoadD1() error = %v", err)
	}
}

func mapsClone(source map[string]string) map[string]string {
	clone := make(map[string]string, len(source))
	for key, value := range source {
		clone[key] = value
	}
	return clone
}

func requiredEnv() map[string]string {
	return map[string]string{
		"APP_ENV":                 "test",
		"CF_ACCOUNT_ID":           "account",
		"CF_API_TOKEN":            "token",
		"CF_D1_DATABASE_ID":       "database",
		"CF_R2_BUCKET_NAME":       "artifacts",
		"CF_R2_ACCESS_KEY_ID":     "access",
		"CF_R2_SECRET_ACCESS_KEY": "secret",
	}
}
