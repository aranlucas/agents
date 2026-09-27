// Package config defines the immutable process configuration boundary. It is
// the only package that reads the environment; every variable the service
// understands is listed in Keys.
package config

import (
	json "encoding/json/v2"
	"errors"
	"fmt"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"
)

const (
	defaultGatewayPort    = "8000"
	defaultTelegramPort   = "8080"
	defaultDatabasePath   = ".data/agents.db"
	defaultKrogerMCPURL   = "https://ai-meal-planner-mcp.aranlucas.workers.dev/mcp"
	defaultTRVLMCPURL     = "https://trvl-production.up.railway.app/mcp"
	defaultCorpusPath     = "assets/oralboards/search.sqlite"
	defaultTelegramAPIURL = "https://api.telegram.org"
	developmentJWKS       = "https://logical-viper-33.clerk.accounts.dev/.well-known/jwks.json"
	developmentIssuer     = "https://logical-viper-33.clerk.accounts.dev"
)

// Key describes one environment variable the service reads.
type Key struct {
	Name string
	// Railway marks variables that must be declared in .railway/railway.go
	// because production reads a value that Railway, not a default, supplies.
	Railway bool
}

// Keys is the complete inventory of environment variables read by config.
// A test keeps .railway/railway.go consistent with it.
var Keys = []Key{
	{Name: "APP_ENV", Railway: true},
	{Name: "PORT"},
	{Name: "DATABASE_PATH"},
	{Name: "ALLOWED_ORIGINS", Railway: true},
	{Name: "CLERK_ISSUER", Railway: true},
	{Name: "CLERK_JWKS_URL", Railway: true},
	{Name: "CLERK_SECRET_KEY", Railway: true},
	{Name: "GEMINI_API_KEY", Railway: true},
	{Name: "GROQ_API_KEY", Railway: true},
	{Name: "MISTRAL_API_KEY", Railway: true},
	{Name: "NVIDIA_NIM_API_KEY", Railway: true},
	{Name: "OPENROUTER_API_KEY", Railway: true},
	{Name: "BRAVE_API_KEY", Railway: true},
	{Name: "GOOGLE_APPLICATION_CREDENTIALS_JSON", Railway: true},
	{Name: "KROGER_MCP_URL"},
	{Name: "TRVL_MCP_URL"},
	{Name: "ORALBOARDS_CORPUS_PATH"},
	{Name: "TELEGRAM_BOT_TOKEN", Railway: true},
	{Name: "TELEGRAM_BOT_USERNAME", Railway: true},
	{Name: "TELEGRAM_LINK_SECRET", Railway: true},
	{Name: "TELEGRAM_LINK_BASE_URL"},
	{Name: "TELEGRAM_CONNECT_URL"},
	{Name: "TELEGRAM_ALLOWED_CHAT_IDS"},
	{Name: "TELEGRAM_API_BASE_URL"},
	{Name: "SENTRY_DSN", Railway: true},
	{Name: "AGUI_STREAM_SMOOTHING"},
	{Name: "AGUI_STREAM_CHUNKING"},
	{Name: "AGUI_STREAM_CHUNK_SIZE"},
	{Name: "AGUI_STREAM_CHUNK_DELAY_MS"},
	{Name: "STARTUP_TRACE"},
	// Provided by Railway at runtime.
	{Name: "RAILWAY_GIT_COMMIT_SHA"},
	{Name: "RAILWAY_ENVIRONMENT_ID"},
	{Name: "RAILWAY_ENVIRONMENT_NAME"},
	{Name: "RAILWAY_PROJECT_ID"},
	{Name: "RAILWAY_SERVICE_ID"},
}

// Provider describes one OpenAI-compatible inference endpoint.
type Provider struct {
	Name              string
	BaseURL           string
	APIKey            string
	Model             string
	ReasoningEffort   string
	RequestsPerMinute int
	Fallbacks         []string
	// FirstContentTimeout bounds the wait for text or a tool call, not reasoning.
	// Zero preserves the normal request deadline.
	FirstContentTimeout time.Duration
}

// HTTP contains listener and browser-origin policy.
type HTTP struct {
	Port    string
	Origins []string
}

// Integrations holds third-party endpoints and credentials used by agents.
type Integrations struct {
	GeminiAPIKey string
	BraveAPIKey  string
	// GoogleCredentialsJSON is a service-account key; GoogleProjectID is its
	// project_id, which bills the trends agent's BigQuery queries.
	GoogleCredentialsJSON string
	GoogleProjectID       string
	KrogerMCPURL          string
	TRVLMCPURL            string
	OralBoardsCorpusPath  string
}

// Telegram holds the long-poll worker's bot settings.
type Telegram struct {
	BotToken       string
	BotUsername    string
	APIBaseURL     string
	LinkBaseURL    string
	ConnectURL     string
	AllowedChatIDs []int64
}

// Environment identifies the runtime safety profile. It is intentionally
// explicit: silently treating an unlabelled Railway deployment as local
// development would re-enable wildcard-origin defaults.
type Environment string

const (
	EnvironmentDevelopment Environment = "development"
	EnvironmentTest        Environment = "test"
	EnvironmentProduction  Environment = "production"
)

// IsProduction reports whether deployed, fail-closed validation applies.
func (e Environment) IsProduction() bool { return e == EnvironmentProduction }

// Config is fully validated before a process opens a listener.
type Config struct {
	Environment        Environment
	DatabasePath       string
	ClerkJWKS          string
	ClerkIssuer        string
	ClerkSecret        string
	TelegramLinkSecret string
	HTTP               HTTP
	Providers          map[string]Provider
	Integrations       Integrations
	Telegram           Telegram
	SentryDSN          string
	// Version is the deployed commit, used as the telemetry release.
	Version      string
	StartupTrace bool
}

type providerEnv struct {
	name, key, baseURL string
}

var providerEnvs = []providerEnv{
	{name: "groq", key: "GROQ_API_KEY", baseURL: "https://api.groq.com/openai/v1"},
	{name: "nvidia", key: "NVIDIA_NIM_API_KEY", baseURL: "https://integrate.api.nvidia.com/v1"},
	{name: "mistral", key: "MISTRAL_API_KEY", baseURL: "https://api.mistral.ai/v1"},
	{name: "openrouter", key: "OPENROUTER_API_KEY", baseURL: "https://openrouter.ai/api/v1"},
}

// Load reads and validates the gateway's configuration. Production requires
// every credential the full agent surface is built with, so a missing value
// fails the deploy instead of the first request that needs it.
func Load(getenv func(string) string) (Config, error) {
	cfg, err := loadCommon(getenv, defaultGatewayPort)
	if err != nil {
		return Config{}, err
	}
	if cfg.HTTP.Origins, err = loadOrigins(env(getenv, "ALLOWED_ORIGINS"), cfg.Environment); err != nil {
		return Config{}, err
	}
	if cfg.ClerkJWKS, cfg.ClerkIssuer, err = loadClerk(getenv, cfg.Environment); err != nil {
		return Config{}, err
	}
	cfg.TelegramLinkSecret = env(getenv, "TELEGRAM_LINK_SECRET")
	if cfg.Environment.IsProduction() {
		for _, required := range []struct{ name, value string }{
			{"GEMINI_API_KEY", cfg.Integrations.GeminiAPIKey},
			{"GOOGLE_APPLICATION_CREDENTIALS_JSON", cfg.Integrations.GoogleCredentialsJSON},
		} {
			if required.value == "" {
				return Config{}, fmt.Errorf("%s is required in production", required.name)
			}
		}
	}
	return cfg, nil
}

// LoadTelegram validates the long-poll worker's process boundary. Browser
// origins and Clerk-JWT verification stay gateway concerns; the worker may
// still use CLERK_SECRET_KEY for invocation-scoped OAuth lookup.
func LoadTelegram(getenv func(string) string) (Config, error) {
	cfg, err := loadCommon(getenv, defaultTelegramPort)
	if err != nil {
		return Config{}, err
	}
	if cfg.Telegram.BotToken == "" {
		return Config{}, errors.New("TELEGRAM_BOT_TOKEN is required")
	}
	return cfg, nil
}

// LoadDatabase validates the minimal configuration needed by the migration
// command.
func LoadDatabase(getenv func(string) string) (Environment, string, error) {
	if getenv == nil {
		return "", "", errors.New("environment reader is required")
	}
	environment, err := loadEnvironment(getenv)
	if err != nil {
		return "", "", err
	}
	return environment, envDefault(getenv, "DATABASE_PATH", defaultDatabasePath), nil
}

func loadCommon(getenv func(string) string, defaultPort string) (Config, error) {
	environment, databasePath, err := LoadDatabase(getenv)
	if err != nil {
		return Config{}, err
	}
	port, err := loadPort(getenv, defaultPort)
	if err != nil {
		return Config{}, err
	}
	integrations, err := loadIntegrations(getenv)
	if err != nil {
		return Config{}, err
	}
	telegram, err := loadTelegramSettings(getenv)
	if err != nil {
		return Config{}, err
	}
	startupTrace, _ := strconv.ParseBool(env(getenv, "STARTUP_TRACE"))
	return Config{
		Environment:  environment,
		DatabasePath: databasePath,
		ClerkSecret:  env(getenv, "CLERK_SECRET_KEY"),
		HTTP:         HTTP{Port: port},
		Providers:    LoadProviders(getenv),
		Integrations: integrations,
		Telegram:     telegram,
		SentryDSN:    env(getenv, "SENTRY_DSN"),
		Version:      env(getenv, "RAILWAY_GIT_COMMIT_SHA"),
		StartupTrace: startupTrace,
	}, nil
}

// LoadIntegrations reads agent endpoints and credentials without requiring
// persistence, so local evaluation shares production defaults.
func LoadIntegrations(getenv func(string) string) (Integrations, error) {
	if getenv == nil {
		return Integrations{}, errors.New("environment reader is required")
	}
	return loadIntegrations(getenv)
}

func loadIntegrations(getenv func(string) string) (Integrations, error) {
	result := Integrations{
		GeminiAPIKey:          env(getenv, "GEMINI_API_KEY"),
		BraveAPIKey:           env(getenv, "BRAVE_API_KEY"),
		GoogleCredentialsJSON: env(getenv, "GOOGLE_APPLICATION_CREDENTIALS_JSON"),
		KrogerMCPURL:          envDefault(getenv, "KROGER_MCP_URL", defaultKrogerMCPURL),
		TRVLMCPURL:            envDefault(getenv, "TRVL_MCP_URL", defaultTRVLMCPURL),
		OralBoardsCorpusPath:  envDefault(getenv, "ORALBOARDS_CORPUS_PATH", defaultCorpusPath),
	}
	if result.GoogleCredentialsJSON != "" {
		var account struct {
			ProjectID string `json:"project_id"`
		}
		if json.Unmarshal([]byte(result.GoogleCredentialsJSON), &account) != nil || account.ProjectID == "" {
			return Integrations{}, errors.New("GOOGLE_APPLICATION_CREDENTIALS_JSON must contain a valid service account with project_id")
		}
		result.GoogleProjectID = account.ProjectID
	}
	for name, raw := range map[string]string{"KROGER_MCP_URL": result.KrogerMCPURL, "TRVL_MCP_URL": result.TRVLMCPURL} {
		if err := validateHTTPSURL(name, raw); err != nil {
			return Integrations{}, err
		}
	}
	return result, nil
}

func loadTelegramSettings(getenv func(string) string) (Telegram, error) {
	chatIDs, err := parseChatIDs(env(getenv, "TELEGRAM_ALLOWED_CHAT_IDS"))
	if err != nil {
		return Telegram{}, err
	}
	return Telegram{
		BotToken:       env(getenv, "TELEGRAM_BOT_TOKEN"),
		BotUsername:    env(getenv, "TELEGRAM_BOT_USERNAME"),
		APIBaseURL:     envDefault(getenv, "TELEGRAM_API_BASE_URL", defaultTelegramAPIURL),
		LinkBaseURL:    env(getenv, "TELEGRAM_LINK_BASE_URL"),
		ConnectURL:     env(getenv, "TELEGRAM_CONNECT_URL"),
		AllowedChatIDs: chatIDs,
	}, nil
}

func parseChatIDs(raw string) ([]int64, error) {
	if raw == "" {
		return nil, nil
	}
	var result []int64
	for value := range strings.SplitSeq(raw, ",") {
		value = strings.TrimSpace(value)
		parsed, err := strconv.ParseInt(value, 10, 64)
		if err != nil || parsed == 0 {
			return nil, fmt.Errorf("TELEGRAM_ALLOWED_CHAT_IDS contains invalid chat ID %q", value)
		}
		result = append(result, parsed)
	}
	return result, nil
}

func loadPort(getenv func(string) string, fallback string) (string, error) {
	port := envDefault(getenv, "PORT", fallback)
	parsedPort, err := strconv.Atoi(port)
	if err != nil || parsedPort < 1 || parsedPort > 65535 {
		return "", errors.New("PORT must be an integer between 1 and 65535")
	}
	return port, nil
}

// LoadProviders reads the shared OpenAI-compatible endpoint inventory without
// loading runtime persistence. This keeps local eval independent from the
// database while using the same provider names, keys, and base URLs as
// production.
func LoadProviders(getenv func(string) string) map[string]Provider {
	providers := make(map[string]Provider)
	if getenv == nil {
		return providers
	}
	for _, item := range providerEnvs {
		if key := env(getenv, item.key); key != "" {
			providers[item.name] = Provider{Name: item.name, BaseURL: item.baseURL, APIKey: key}
		}
	}
	return providers
}

func env(getenv func(string) string, key string) string {
	return strings.TrimSpace(getenv(key))
}

func envDefault(getenv func(string) string, key, fallback string) string {
	if value := env(getenv, key); value != "" {
		return value
	}
	return fallback
}

func loadEnvironment(getenv func(string) string) (Environment, error) {
	raw := strings.ToLower(env(getenv, "APP_ENV"))
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
		if env(getenv, key) != "" {
			return true
		}
	}
	return false
}

func loadClerk(getenv func(string) string, environment Environment) (string, string, error) {
	jwks := env(getenv, "CLERK_JWKS_URL")
	issuer := env(getenv, "CLERK_ISSUER")
	if !environment.IsProduction() {
		jwks = envDefault(getenv, "CLERK_JWKS_URL", developmentJWKS)
		issuer = envDefault(getenv, "CLERK_ISSUER", developmentIssuer)
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
	if raw == "" {
		if environment.IsProduction() {
			return nil, errors.New("ALLOWED_ORIGINS is required in production")
		}
		return []string{"*"}, nil
	}
	var origins []string
	for value := range strings.SplitSeq(raw, ",") {
		origin := strings.TrimSpace(value)
		if origin == "*" {
			return []string{"*"}, nil
		}
		parsed, err := url.Parse(origin)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.User != nil {
			return nil, fmt.Errorf("invalid allowed origin %q", origin)
		}
		if environment.IsProduction() && parsed.Scheme == "http" && !isLocalHTTPOrigin(parsed) {
			return nil, fmt.Errorf("production allowed origin %q must use HTTPS", origin)
		}
		if !slices.Contains(origins, origin) {
			origins = append(origins, origin)
		}
	}
	return origins, nil
}

func isLocalHTTPOrigin(parsed *url.URL) bool {
	host := parsed.Hostname()
	return parsed.Scheme == "http" && (host == "localhost" || host == "127.0.0.1" || host == "::1")
}
