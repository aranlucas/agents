// Package config defines the immutable process configuration boundary.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"slices"
	"strings"
)

const defaultPort = "8000"

// Cloudflare contains the mandatory D1 and R2 credentials.
type Cloudflare struct {
	AccountID         string
	APIToken          string
	D1DatabaseID      string
	R2Bucket          string
	R2AccessKeyID     string
	R2SecretAccessKey string
}

// Provider describes one OpenAI-compatible inference endpoint.
type Provider struct {
	Name              string
	BaseURL           string
	APIKey            string
	Model             string
	RequestsPerMinute int
	RequestsPerDay    int
	Fallbacks         []string
}

// HTTP contains listener and browser-origin policy.
type HTTP struct {
	Port    string
	Origins []string
}

// Config is fully validated before the gateway opens a listener.
type Config struct {
	Cloudflare  Cloudflare
	ClerkJWKS   string
	ClerkIssuer string
	HTTP        HTTP
	Providers   map[string]Provider
}

type providerEnv struct {
	name, key, baseURL string
}

var providerEnvs = []providerEnv{
	{name: "cerebras", key: "CEREBRAS_API_KEY", baseURL: "https://api.cerebras.ai/v1"},
	{name: "groq", key: "GROQ_API_KEY", baseURL: "https://api.groq.com/openai/v1"},
	{name: "nvidia", key: "NVIDIA_NIM_API_KEY", baseURL: "https://integrate.api.nvidia.com/v1"},
	{name: "mistral", key: "MISTRAL_API_KEY", baseURL: "https://api.mistral.ai/v1"},
	{name: "openrouter", key: "OPENROUTER_API_KEY", baseURL: "https://openrouter.ai/api/v1"},
}

// Load reads and validates environment-backed configuration. It deliberately
// has no database fallback: D1 and R2 are required in every runtime mode.
func Load(getenv func(string) string) (Config, error) {
	if getenv == nil {
		return Config{}, errors.New("environment reader is required")
	}
	if strings.TrimSpace(getenv("DATABASE_URL")) != "" {
		return Config{}, errors.New("DATABASE_URL is unsupported; configure Cloudflare D1")
	}
	if strings.TrimSpace(getenv("TURSO_DATABASE_URL")) != "" {
		return Config{}, errors.New("TURSO_DATABASE_URL is unsupported; configure Cloudflare D1")
	}

	cloudflare, err := loadCloudflare(getenv)
	if err != nil {
		return Config{}, err
	}
	origins, err := loadOrigins(getenv("ALLOWED_ORIGINS"))
	if err != nil {
		return Config{}, err
	}
	port := strings.TrimSpace(getenv("PORT"))
	if port == "" {
		port = defaultPort
	}

	providers := make(map[string]Provider)
	for _, item := range providerEnvs {
		key := strings.TrimSpace(getenv(item.key))
		if key == "" {
			continue
		}
		providers[item.name] = Provider{Name: item.name, BaseURL: item.baseURL, APIKey: key}
	}

	return Config{
		Cloudflare:  cloudflare,
		ClerkJWKS:   strings.TrimSpace(getenv("CLERK_JWKS_URL")),
		ClerkIssuer: strings.TrimSpace(getenv("CLERK_ISSUER")),
		HTTP:        HTTP{Port: port, Origins: origins},
		Providers:   providers,
	}, nil
}

func loadCloudflare(getenv func(string) string) (Cloudflare, error) {
	values := map[string]string{
		"CF_ACCOUNT_ID":           strings.TrimSpace(getenv("CF_ACCOUNT_ID")),
		"CF_API_TOKEN":            strings.TrimSpace(getenv("CF_API_TOKEN")),
		"CF_D1_DATABASE_ID":       strings.TrimSpace(getenv("CF_D1_DATABASE_ID")),
		"CF_R2_BUCKET_NAME":       strings.TrimSpace(getenv("CF_R2_BUCKET_NAME")),
		"CF_R2_ACCESS_KEY_ID":     strings.TrimSpace(getenv("CF_R2_ACCESS_KEY_ID")),
		"CF_R2_SECRET_ACCESS_KEY": strings.TrimSpace(getenv("CF_R2_SECRET_ACCESS_KEY")),
	}
	for _, key := range []string{"CF_ACCOUNT_ID", "CF_API_TOKEN", "CF_D1_DATABASE_ID", "CF_R2_BUCKET_NAME", "CF_R2_ACCESS_KEY_ID", "CF_R2_SECRET_ACCESS_KEY"} {
		if values[key] == "" {
			return Cloudflare{}, fmt.Errorf("%s is required", key)
		}
	}
	return Cloudflare{
		AccountID: values["CF_ACCOUNT_ID"], APIToken: values["CF_API_TOKEN"],
		D1DatabaseID: values["CF_D1_DATABASE_ID"], R2Bucket: values["CF_R2_BUCKET_NAME"],
		R2AccessKeyID: values["CF_R2_ACCESS_KEY_ID"], R2SecretAccessKey: values["CF_R2_SECRET_ACCESS_KEY"],
	}, nil
}

func loadOrigins(raw string) ([]string, error) {
	if strings.TrimSpace(raw) == "" {
		return []string{"http://localhost:3000", "http://localhost:8081"}, nil
	}
	var origins []string
	for value := range strings.SplitSeq(raw, ",") {
		origin := strings.TrimSpace(value)
		if origin == "*" {
			return nil, errors.New("wildcard ALLOWED_ORIGINS is unsupported")
		}
		parsed, err := url.Parse(origin)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.Path != "" {
			return nil, fmt.Errorf("invalid allowed origin %q", origin)
		}
		if !slices.Contains(origins, origin) {
			origins = append(origins, origin)
		}
	}
	return origins, nil
}
