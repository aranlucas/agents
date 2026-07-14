// Package config defines the immutable process configuration boundary.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"slices"
	"strconv"
	"strings"
)

const (
	defaultGatewayPort  = "8000"
	defaultTelegramPort = "8080"
	developmentJWKS     = "https://logical-viper-33.clerk.accounts.dev/.well-known/jwks.json"
	developmentIssuer   = "https://logical-viper-33.clerk.accounts.dev"
)

func orDefault(val, fallback string) string {
	if val == "" {
		return fallback
	}
	return val
}

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
	Fallbacks         []string
}

// HTTP contains listener and browser-origin policy.
type HTTP struct {
	Port    string
	Origins []string
}

// Environment identifies the runtime safety profile. It is intentionally
// explicit: silently treating an unlabelled Railway deployment as local
// development would re-enable shared resource and wildcard-origin defaults.
type Environment string

const (
	EnvironmentDevelopment Environment = "development"
	EnvironmentTest        Environment = "test"
	EnvironmentProduction  Environment = "production"
)

// IsProduction reports whether deployed, fail-closed validation applies.
func (e Environment) IsProduction() bool { return e == EnvironmentProduction }

// Config is fully validated before the gateway opens a listener.
type Config struct {
	Environment        Environment
	Cloudflare         Cloudflare
	ClerkJWKS          string
	ClerkIssuer        string
	ClerkSecret        string
	TelegramLinkSecret string
	HTTP               HTTP
	Providers          map[string]Provider
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

// Load reads and validates environment-backed configuration.
// Legacy DATABASE_URL / TURSO_DATABASE_URL are silently ignored.
func Load(getenv func(string) string) (Config, error) {
	if getenv == nil {
		return Config{}, errors.New("environment reader is required")
	}
	environment, err := loadEnvironment(getenv)
	if err != nil {
		return Config{}, err
	}

	cloudflare, err := loadCloudflare(getenv)
	if err != nil {
		return Config{}, err
	}
	origins, err := loadOrigins(getenv("ALLOWED_ORIGINS"), environment)
	if err != nil {
		return Config{}, err
	}
	clerkJWKS, clerkIssuer, err := loadClerk(getenv, environment)
	if err != nil {
		return Config{}, err
	}
	port, err := loadPort(getenv, defaultGatewayPort)
	if err != nil {
		return Config{}, err
	}

	return Config{
		Environment:        environment,
		Cloudflare:         cloudflare,
		ClerkJWKS:          clerkJWKS,
		ClerkIssuer:        clerkIssuer,
		ClerkSecret:        strings.TrimSpace(getenv("CLERK_SECRET_KEY")),
		TelegramLinkSecret: strings.TrimSpace(getenv("TELEGRAM_LINK_SECRET")),
		HTTP:               HTTP{Port: port, Origins: origins},
		Providers:          LoadProviders(getenv),
	}, nil
}

// LoadTelegram validates only the worker's process boundary. D1 and R2 remain
// mandatory, while browser-origin and Clerk-JWT verification settings stay a
// gateway concern. The worker may still use CLERK_SECRET_KEY for invocation-
// scoped OAuth lookup when it is configured.
func LoadTelegram(getenv func(string) string) (Config, error) {
	if getenv == nil {
		return Config{}, errors.New("environment reader is required")
	}
	environment, err := loadEnvironment(getenv)
	if err != nil {
		return Config{}, err
	}
	cloudflare, err := loadCloudflare(getenv)
	if err != nil {
		return Config{}, err
	}
	port, err := loadPort(getenv, defaultTelegramPort)
	if err != nil {
		return Config{}, err
	}
	return Config{
		Environment: environment,
		Cloudflare:  cloudflare,
		ClerkSecret: strings.TrimSpace(getenv("CLERK_SECRET_KEY")),
		HTTP:        HTTP{Port: port},
		Providers:   LoadProviders(getenv),
	}, nil
}

// LoadD1 validates the minimal configuration needed by the migration command.
// Runtime processes continue to use Load or LoadTelegram so mandatory R2
// configuration is checked before they start.
func LoadD1(getenv func(string) string) (Environment, Cloudflare, error) {
	if getenv == nil {
		return "", Cloudflare{}, errors.New("environment reader is required")
	}
	environment, err := loadEnvironment(getenv)
	if err != nil {
		return "", Cloudflare{}, err
	}
	cloudflare, err := loadD1(getenv)
	if err != nil {
		return "", Cloudflare{}, err
	}
	return environment, cloudflare, nil
}

func loadPort(getenv func(string) string, fallback string) (string, error) {
	port := strings.TrimSpace(getenv("PORT"))
	if port == "" {
		port = fallback
	}
	parsedPort, err := strconv.Atoi(port)
	if err != nil || parsedPort < 1 || parsedPort > 65535 {
		return "", errors.New("PORT must be an integer between 1 and 65535")
	}
	return port, nil
}

// LoadProviders reads the shared OpenAI-compatible endpoint inventory without
// loading runtime persistence. This keeps local eval independent from D1/R2
// while using the same provider names, keys, and base URLs as production.
func LoadProviders(getenv func(string) string) map[string]Provider {
	providers := make(map[string]Provider)
	if getenv == nil {
		return providers
	}
	for _, item := range providerEnvs {
		key := strings.TrimSpace(getenv(item.key))
		if key != "" {
			providers[item.name] = Provider{Name: item.name, BaseURL: item.baseURL, APIKey: key}
		}
	}
	return providers
}

func loadCloudflare(getenv func(string) string) (Cloudflare, error) {
	cloudflare, err := loadD1(getenv)
	if err != nil {
		return Cloudflare{}, err
	}
	values := map[string]string{
		"CF_R2_BUCKET_NAME":       strings.TrimSpace(getenv("CF_R2_BUCKET_NAME")),
		"CF_R2_ACCESS_KEY_ID":     strings.TrimSpace(getenv("CF_R2_ACCESS_KEY_ID")),
		"CF_R2_SECRET_ACCESS_KEY": strings.TrimSpace(getenv("CF_R2_SECRET_ACCESS_KEY")),
	}
	for _, key := range []string{"CF_R2_BUCKET_NAME", "CF_R2_ACCESS_KEY_ID", "CF_R2_SECRET_ACCESS_KEY"} {
		if values[key] == "" {
			return Cloudflare{}, fmt.Errorf("%s is required", key)
		}
	}
	cloudflare.R2Bucket = values["CF_R2_BUCKET_NAME"]
	cloudflare.R2AccessKeyID = values["CF_R2_ACCESS_KEY_ID"]
	cloudflare.R2SecretAccessKey = values["CF_R2_SECRET_ACCESS_KEY"]
	return cloudflare, nil
}

func loadD1(getenv func(string) string) (Cloudflare, error) {
	values := map[string]string{
		"CF_ACCOUNT_ID":     strings.TrimSpace(getenv("CF_ACCOUNT_ID")),
		"CF_API_TOKEN":      strings.TrimSpace(getenv("CF_API_TOKEN")),
		"CF_D1_DATABASE_ID": strings.TrimSpace(getenv("CF_D1_DATABASE_ID")),
	}
	for _, key := range []string{"CF_ACCOUNT_ID", "CF_API_TOKEN", "CF_D1_DATABASE_ID"} {
		if values[key] == "" {
			return Cloudflare{}, fmt.Errorf("%s is required", key)
		}
	}
	return Cloudflare{AccountID: values["CF_ACCOUNT_ID"], APIToken: values["CF_API_TOKEN"], D1DatabaseID: values["CF_D1_DATABASE_ID"]}, nil
}

func loadEnvironment(getenv func(string) string) (Environment, error) {
	raw := strings.ToLower(strings.TrimSpace(getenv("APP_ENV")))
	if raw == "" {
		if onRailway(getenv) {
			return "", errors.New("APP_ENV is required on Railway and must be production")
		}
		return "", errors.New("APP_ENV is required (development, test, or production)")
	}
	environment := Environment(raw)
	switch environment {
	case EnvironmentDevelopment, EnvironmentTest, EnvironmentProduction:
	default:
		return "", fmt.Errorf("invalid APP_ENV %q (want development, test, or production)", raw)
	}
	if onRailway(getenv) && !environment.IsProduction() {
		return "", errors.New("APP_ENV must be production on Railway")
	}
	return environment, nil
}

func onRailway(getenv func(string) string) bool {
	for _, key := range []string{"RAILWAY_ENVIRONMENT_ID", "RAILWAY_ENVIRONMENT_NAME", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID"} {
		if strings.TrimSpace(getenv(key)) != "" {
			return true
		}
	}
	return false
}

func loadClerk(getenv func(string) string, environment Environment) (string, string, error) {
	jwks := strings.TrimSpace(getenv("CLERK_JWKS_URL"))
	issuer := strings.TrimSpace(getenv("CLERK_ISSUER"))
	if !environment.IsProduction() {
		jwks = orDefault(jwks, developmentJWKS)
		issuer = orDefault(issuer, developmentIssuer)
	}
	if jwks == "" {
		return "", "", errors.New("CLERK_JWKS_URL is required in production")
	}
	if issuer == "" {
		return "", "", errors.New("CLERK_ISSUER is required in production")
	}
	if err := validateHTTPSURL("CLERK_JWKS_URL", jwks); err != nil {
		return "", "", err
	}
	if err := validateHTTPSURL("CLERK_ISSUER", issuer); err != nil {
		return "", "", err
	}
	return jwks, issuer, nil
}

func validateHTTPSURL(name, raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || parsed.Fragment != "" {
		return fmt.Errorf("%s must be an absolute HTTPS URL", name)
	}
	return nil
}

func loadOrigins(raw string, environment Environment) ([]string, error) {
	if strings.TrimSpace(raw) == "" {
		if environment.IsProduction() {
			return nil, errors.New("ALLOWED_ORIGINS is required in production")
		}
		return []string{"*"}, nil
	}
	var origins []string
	for value := range strings.SplitSeq(raw, ",") {
		origin := strings.TrimSpace(value)
		if origin == "*" {
			if environment.IsProduction() {
				return nil, errors.New("ALLOWED_ORIGINS cannot contain a wildcard in production")
			}
			return []string{"*"}, nil
		}
		parsed, err := url.Parse(origin)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.User != nil {
			return nil, fmt.Errorf("invalid allowed origin %q", origin)
		}
		if environment.IsProduction() && parsed.Scheme != "https" {
			return nil, fmt.Errorf("production allowed origin %q must use HTTPS", origin)
		}
		if !slices.Contains(origins, origin) {
			origins = append(origins, origin)
		}
	}
	return origins, nil
}
