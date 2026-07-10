package config

import (
	"strings"
	"testing"
)

func TestLoadRequiresCloudflarePersistence(t *testing.T) {
	_, err := Load(func(key string) string {
		return map[string]string{"PORT": "8000"}[key]
	})
	if err == nil || !strings.Contains(err.Error(), "CF_ACCOUNT_ID") {
		t.Fatalf("Load() error = %v, want missing Cloudflare configuration", err)
	}
}

func TestLoadRejectsLegacyDatabaseURL(t *testing.T) {
	env := requiredEnv()
	env["DATABASE_URL"] = "postgres://obsolete"
	_, err := Load(func(key string) string { return env[key] })
	if err == nil || !strings.Contains(err.Error(), "DATABASE_URL is unsupported") {
		t.Fatalf("Load() error = %v, want legacy database rejection", err)
	}
}

func TestLoadRejectsLegacyTursoDatabaseURL(t *testing.T) {
	env := requiredEnv()
	env["TURSO_DATABASE_URL"] = "libsql://obsolete"
	_, err := Load(func(key string) string { return env[key] })
	if err == nil || !strings.Contains(err.Error(), "TURSO_DATABASE_URL is unsupported") {
		t.Fatalf("Load() error = %v, want legacy database rejection", err)
	}
}

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
	if got := strings.Join(cfg.HTTP.Origins, ","); got != "https://app.example.com,https://mobile.example.com" {
		t.Fatalf("origins = %q", got)
	}
	provider, ok := cfg.Providers["groq"]
	if !ok || provider.APIKey != "secret" || provider.BaseURL != "https://api.groq.com/openai/v1" {
		t.Fatalf("provider = %#v, present = %v", provider, ok)
	}
}

func TestLoadRejectsWildcardOrigin(t *testing.T) {
	env := requiredEnv()
	env["ALLOWED_ORIGINS"] = "*"
	_, err := Load(func(key string) string { return env[key] })
	if err == nil || !strings.Contains(err.Error(), "wildcard") {
		t.Fatalf("Load() error = %v, want wildcard rejection", err)
	}
}

func requiredEnv() map[string]string {
	return map[string]string{
		"CF_ACCOUNT_ID":           "account",
		"CF_API_TOKEN":            "token",
		"CF_D1_DATABASE_ID":       "database",
		"CF_R2_BUCKET_NAME":       "bucket",
		"CF_R2_ACCESS_KEY_ID":     "access",
		"CF_R2_SECRET_ACCESS_KEY": "secret",
	}
}
