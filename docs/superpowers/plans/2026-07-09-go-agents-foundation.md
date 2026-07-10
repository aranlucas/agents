# Go Agents Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Go-only gateway foundation that can run a streamed ADK-Go resume agent through AG-UI, Cloudflare D1/R2, Clerk, and an OpenAI-compatible provider without any database fallback.

**Architecture:** `agents/` becomes a Go module. The gateway parses AG-UI requests, authenticates the identity, overlays request-only state on a D1-backed ADK session, runs an ADK-Go agent through a custom OpenAI-compatible `model.LLM`, and converts emitted events into SSE. This plan deliberately delivers a vertical `/resume` slice first; later plans add the remaining agent packages and Telegram runtime to the same registry.

**Tech Stack:** Go 1.26, ADK-Go v2.0.0 (`google.golang.org/adk/v2`), AG-UI Go SDK, standard `net/http`, Cloudflare D1 SQL API, AWS SDK v2 S3 client for R2, Clerk JWKS/JWT validation, OpenTelemetry, and Go test/race/vet.

## Global Constraints

- Production requires `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `CF_D1_DATABASE_ID`, `CF_R2_BUCKET_NAME`, `CF_R2_ACCESS_KEY_ID`, and `CF_R2_SECRET_ACCESS_KEY`; startup fails if any is absent.
- `DATABASE_URL`, `TURSO_DATABASE_URL`, SQLAlchemy, SQLite persistence, in-memory persistence, Python, LiteLLM, FastAPI, `uv`, Node, and a Brave MCP subprocess must not be runtime dependencies.
- Pin ADK-Go to `google.golang.org/adk/v2 v2.0.0` (per 2026-07-10 directive: use the v2 module, do not rely on v1); invoke agents with `agent.RunConfig{StreamingMode: agent.StreamingModeSSE}`.
- Preserve current active AG-UI paths: `POST /resume/agui`, `POST /resume/agents/state`, `GET /resume/agui/capabilities`, `GET /resume/health`, and `GET /health`.
- `/resume` is public; all other stateful agent routes become Clerk-protected, including `/agents/state`.
- Sessions use `(app_name, user_id, thread_id)` with a one-hour expiry. Old Python sessions are not read or migrated.
- Persist only non-temporary state; Kroger/Strava access tokens and raw Clerk/provider credentials never enter D1, R2, logs, traces, or AG-UI events.
- All new Go code must pass `go test -race ./...`, `go vet ./...`, `gofmt -w`, and the agent package's static checker before it is committed.

---

## Target File Structure

```text
agents/
  go.mod
  go.sum
  cmd/gateway/main.go
  internal/
    agui/{handler.go,inbound.go,converter.go,state.go,client_tools.go}
    agentruntime/{registry.go,state.go,tool.go}
    agents/resume/{agent.go,assets.go,agent_test.go}
    auth/{clerk.go,middleware.go,middleware_test.go}
    cloudflare/{d1.go,d1_test.go,r2.go,r2_test.go,migrations.go}
    config/{config.go,config_test.go}
    providers/openai/{model.go,model_test.go,transport.go}
    rate/{limiter.go,limiter_test.go}
    observability/otel.go
  migrations/d1/001_initial.sql
  testdata/agui/{resume-request.json,resume-events.jsonl}
```

`cmd/gateway` is the only production process introduced by this plan. It is
allowed to coexist with the Python gateway while tests are built, but it must
not proxy to Python or start any Python process.

### Task 1: Establish the Go module and fail-fast runtime configuration

**Files:**

- Create: `agents/go.mod`
- Create: `agents/internal/config/config.go`
- Create: `agents/internal/config/config_test.go`
- Modify: `agents/package.json`
- Modify: `package.json`
- Modify: `turbo.json`

**Interfaces:**

- Produces `config.Load(getenv func(string) string) (config.Config, error)`.
- Produces `Config.Cloudflare`, `Config.Clerk`, `Config.Providers`, and `Config.HTTP` for every later gateway constructor.
- Rejects legacy database environment variables before opening listeners.

- [ ] **Step 1: Write the failing configuration tests**

```go
// agents/internal/config/config_test.go
func TestLoadRequiresCloudflarePersistence(t *testing.T) {
	_, err := Load(func(key string) string {
		return map[string]string{"PORT": "8000"}[key]
	})
	if err == nil || !strings.Contains(err.Error(), "CF_D1_DATABASE_ID") {
		t.Fatalf("Load() error = %v, want missing D1 configuration", err)
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
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `cd agents && go test ./internal/config -run TestLoad -count=1`

Expected: FAIL because the Go module and `Load` do not exist.

- [ ] **Step 3: Create the module and implement immutable configuration**

```go
// agents/internal/config/config.go
package config

type Cloudflare struct {
	AccountID, APIToken, D1DatabaseID string
	R2Bucket, R2AccessKeyID, R2SecretAccessKey string
}

type Config struct {
	Port       string
	Cloudflare Cloudflare
	ClerkJWKS  string
	Origins    []string
	Providers  map[string]Provider
}

func Load(getenv func(string) string) (Config, error) {
	if getenv("DATABASE_URL") != "" || getenv("TURSO_DATABASE_URL") != "" {
		return Config{}, errors.New("DATABASE_URL is unsupported; configure Cloudflare D1")
	}
	// require each named Cloudflare variable, normalize PORT and ALLOWED_ORIGINS,
	// then parse the explicit provider configuration into Config.Providers.
}
```

Create `agents/go.mod` with module path `github.com/aranlucas/agents/agents`,
`go 1.25.0`, `google.golang.org/adk v1.3.0`,
`google.golang.org/genai v1.57.0`,
`github.com/modelcontextprotocol/go-sdk v1.4.1`, and
`github.com/ag-ui-protocol/ag-ui/sdks/community/go
v0.0.0-20260709155601-61b713253dfe`, plus direct requirements for AWS SDK v2,
`github.com/golang-jwt/jwt/v5`, OpenTelemetry, and the Google Cloud clients
used by later agent packages. Add agent package
scripts:

```json
{
  "scripts": {
    "lint": "golangci-lint run ./...",
    "fmt": "gofmt -w $(find . -name '*.go' -not -path './vendor/*')",
    "fmt:check": "test -z \"$(gofmt -l $(find . -name '*.go' -not -path './vendor/*'))\"",
    "typecheck": "go vet ./...",
    "test": "go test -race ./..."
  }
}
```

Update root scripts so `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm
fmt:check` include the Go `agents` workspace via Turbo; remove only the Python
agent command from those script paths once Go replaces it.

- [ ] **Step 4: Run configuration tests and format checks**

Run: `cd agents && go test ./internal/config -run TestLoad -count=1 && gofmt -w internal/config/*.go && go vet ./internal/config`

Expected: PASS.

- [ ] **Step 5: Commit the configuration boundary**

```bash
git add agents/go.mod agents/go.sum agents/internal/config agents/package.json package.json turbo.json
git commit -m "feat(agents): add Go runtime configuration"
```

### Task 2: Implement mandatory D1 migrations and a D1-backed ADK session service

**Files:**

- Create: `agents/migrations/d1/001_initial.sql`
- Create: `agents/internal/cloudflare/d1.go`
- Create: `agents/internal/cloudflare/d1_test.go`
- Create: `agents/internal/cloudflare/migrations.go`

**Interfaces:**

- Consumes `config.Cloudflare` from Task 1.
- Produces `cloudflare.NewD1(cfg config.Cloudflare, client *http.Client) (*D1, error)`.
- Produces `cloudflare.NewSessionService(d1 *D1, now func() time.Time) session.Service`.
- Implements ADK-Go `session.Service`: `Create`, `Get`, `List`, `Delete`, and `AppendEvent`.
- Produces `D1.RunMigrations(ctx context.Context) error` and `D1.Health(ctx context.Context) error`.

- [ ] **Step 1: Write failing D1 service tests against an HTTP test server**

```go
func TestSessionServicePersistsOnlyNonTemporaryState(t *testing.T) {
	d1 := newFakeD1(t)
	svc := NewSessionService(d1, fixedClock)
	created, err := svc.Create(context.Background(), &session.CreateRequest{
		AppName: "resume_agent", UserID: "user-1", SessionID: "thread-1",
		State: map[string]any{"user_id": "user-1", "temp:kroger_token": "secret"},
	})
	if err != nil { t.Fatal(err) }
	if got, err := created.Session.State().Get("temp:kroger_token"); err == nil || got != nil {
		t.Fatalf("temporary state persisted: %#v, %v", got, err)
	}
	assertD1NeverReceived(t, d1, "secret")
}

func TestSessionServiceScopesStateByAppUserAndThread(t *testing.T) {
	// Create identical thread ids for distinct users, then assert Get returns
	// only the caller's JSON state and emitted SQL binds all three key values.
}

func TestSessionServiceMergesAppAndUserStateScopes(t *testing.T) {
	// Append one event with app:banner and user:theme deltas, create a second
	// session for the same user, then assert both sessions see the scoped values
	// while a different user sees only app:banner.
}
```

- [ ] **Step 2: Run the D1 tests to verify they fail**

Run: `cd agents && go test ./internal/cloudflare -run 'TestSessionService' -count=1`

Expected: FAIL because `NewSessionService` is undefined.

- [ ] **Step 3: Add idempotent schema and batched D1 implementation**

```sql
-- agents/migrations/d1/001_initial.sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_sessions (
  app_name TEXT NOT NULL, user_id TEXT NOT NULL, thread_id TEXT NOT NULL,
  state_json TEXT NOT NULL, messages_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL, version INTEGER NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY (app_name, user_id, thread_id)
);
CREATE TABLE IF NOT EXISTS agent_events (
  id TEXT PRIMARY KEY, app_name TEXT NOT NULL, user_id TEXT NOT NULL,
  thread_id TEXT NOT NULL, run_id TEXT NOT NULL, event_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_app_state (
  app_name TEXT PRIMARY KEY, state_json TEXT NOT NULL, version INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_user_state (
  app_name TEXT NOT NULL, user_id TEXT NOT NULL, state_json TEXT NOT NULL,
  version INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (app_name, user_id)
);
CREATE TABLE IF NOT EXISTS pending_client_tools (
  call_id TEXT PRIMARY KEY, app_name TEXT NOT NULL, user_id TEXT NOT NULL,
  thread_id TEXT NOT NULL, tool_name TEXT NOT NULL, arguments_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS provider_limits (
  provider TEXT NOT NULL, window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  PRIMARY KEY (provider, window_start)
);
```

```go
// agents/internal/cloudflare/d1.go
type Statement struct { SQL string `json:"sql"`; Params []any `json:"params"` }
type D1 struct { endpoint, token string; client *http.Client }

func (d *D1) Batch(ctx context.Context, statements []Statement) ([]Result, error) {
	// POST {"batch": statements} to /accounts/{account}/d1/database/{id}/query.
	// Reject non-2xx and malformed result sets without including token/SQL values in errors.
}

func persistentState(state map[string]any) map[string]any {
	out := make(map[string]any, len(state))
	for key, value := range state {
		if !strings.HasPrefix(key, "temp:") { out[key] = value }
	}
	return out
}
```

Use a migration table with a unique migration ID and execute a schema migration
in one D1 batch. `AppendEvent` writes the event plus the merged non-temporary
state in one D1 batch after checking and incrementing a monotonic `version`; it extracts `app:` and
`user:` deltas into their own D1 rows and keeps ordinary keys in the session
row, exactly matching ADK-Go state scopes. On conflict it retries a bounded
three times. Session reads merge app, user, and session state, then purge
expired sessions before returning `nil`.

- [ ] **Step 4: Run D1 unit tests and the ADK session contract tests**

Run: `cd agents && go test ./internal/cloudflare -run 'Test(SessionService|D1)' -count=1 && go vet ./internal/cloudflare`

Expected: PASS.

- [ ] **Step 5: Commit D1 persistence**

```bash
git add agents/migrations/d1 agents/internal/cloudflare/d1.go agents/internal/cloudflare/d1_test.go agents/internal/cloudflare/migrations.go
git commit -m "feat(agents): persist Go sessions in Cloudflare D1"
```

### Task 3: Add R2 artifacts and D1-backed provider rate limits

**Files:**

- Create: `agents/internal/cloudflare/r2.go`
- Create: `agents/internal/cloudflare/r2_test.go`
- Create: `agents/internal/rate/limiter.go`
- Create: `agents/internal/rate/limiter_test.go`

**Interfaces:**

- Consumes `config.Cloudflare` and D1 from Tasks 1-2.
- Produces `cloudflare.NewR2(cfg config.Cloudflare) (*R2, error)` and `R2.Put/Get/Delete` scoped by app/user/thread/key.
- Produces `cloudflare.NewArtifactService(r2 *R2) artifact.Service` implementing ADK-Go artifact `Save`, `Load`, `Delete`, `List`, `Versions`, and `GetArtifactVersion`.
- Produces `rate.NewProviderLimiter(d1 *cloudflare.D1, clock Clock) *ProviderLimiter`.

- [ ] **Step 1: Write failing authorization and rate-window tests**

```go
func TestR2ObjectKeyCannotCrossUserBoundary(t *testing.T) {
	r2 := newFakeR2(t)
	key, err := r2.ObjectKey("travel", "user-a", "thread-a", "plan.md")
	if err != nil || key != "travel/user-a/thread-a/plan.md" { t.Fatalf("key = %q, %v", key, err) }
	if _, err := r2.ObjectKey("travel", "user-a", "thread-a", "../user-b/secret"); err == nil {
		t.Fatal("path traversal accepted")
	}
}

func TestArtifactServiceSavesAndLoadsVersionedPart(t *testing.T) {
	service := NewArtifactService(newFakeR2(t))
	saved, err := service.Save(context.Background(), &artifact.SaveRequest{AppName: "travel", UserID: "user-a", SessionID: "thread-a", FileName: "plan.md", Part: &genai.Part{Text: "day one"}})
	if err != nil || saved.Version != 1 { t.Fatalf("Save() = %#v, %v", saved, err) }
	loaded, err := service.Load(context.Background(), &artifact.LoadRequest{AppName: "travel", UserID: "user-a", SessionID: "thread-a", FileName: "plan.md", Version: saved.Version})
	if err != nil || loaded.Part.Text != "day one" { t.Fatalf("Load() = %#v, %v", loaded, err) }
}

func TestProviderLimiterRejectsWindowOverflow(t *testing.T) {
	limiter := NewProviderLimiter(newFakeD1(t), fixedClock)
	for range 2 { if err := limiter.Acquire(context.Background(), "groq", 2); err != nil { t.Fatal(err) } }
	if err := limiter.Acquire(context.Background(), "groq", 2); !errors.Is(err, ErrLimitReached) {
		t.Fatalf("Acquire() error = %v, want ErrLimitReached", err)
	}
}
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `cd agents && go test ./internal/cloudflare ./internal/rate -run 'Test(R2|ProviderLimiter)' -count=1`

Expected: FAIL because R2 and provider limiter constructors do not exist.

- [ ] **Step 3: Implement bounded artifact access and D1 rate accounting**

```go
func (r *R2) ObjectKey(app, user, thread, name string) (string, error) {
	if app == "" || user == "" || thread == "" || name == "" || strings.Contains(name, "..") || strings.ContainsRune(name, '/') {
		return "", ErrInvalidArtifactKey
	}
	return path.Join(app, user, thread, name), nil
}

func (l *ProviderLimiter) Acquire(ctx context.Context, provider string, maximum int) error {
	// Atomically increment provider_limits(provider, minute_window) through a D1 batch.
	// Return ErrLimitReached rather than waiting unboundedly.
}

func (s *ArtifactService) Save(ctx context.Context, req *artifact.SaveRequest) (*artifact.SaveResponse, error) {
	if err := req.Validate(); err != nil { return nil, err }
	// Resolve the next version, write the encoded genai.Part plus SHA-256 metadata to R2,
	// then return the monotonic artifact version.
}
```

Use AWS SDK v2 with an R2 endpoint resolver, static credential provider, a
maximum object size, SHA-256 metadata, and caller-provided content type. Never
return a bucket-wide list or presigned URL without the scoped object check.
Implement all six ADK-Go artifact methods and pass this service to every
`runner.New(runner.Config{ArtifactService: artifacts})` call in the gateway.

- [ ] **Step 4: Run R2/rate tests and static analysis**

Run: `cd agents && go test ./internal/cloudflare ./internal/rate -count=1 && go vet ./internal/cloudflare ./internal/rate`

Expected: PASS.

- [ ] **Step 5: Commit artifact and limiter services**

```bash
git add agents/internal/cloudflare/r2.go agents/internal/cloudflare/r2_test.go agents/internal/rate
git commit -m "feat(agents): add R2 artifacts and provider limits"
```

### Task 4: Implement Clerk identity and CORS middleware

**Files:**

- Create: `agents/internal/auth/clerk.go`
- Create: `agents/internal/auth/middleware.go`
- Create: `agents/internal/auth/middleware_test.go`

**Interfaces:**

- Consumes `config.Config.ClerkJWKS` and allowed origins.
- Produces `auth.Identity{UserID string, Public bool}` in request context.
- Produces `auth.RequireIdentity(publicRoutes map[string]bool, next http.Handler) http.Handler`.
- Produces `auth.CORS(origins []string, next http.Handler) http.Handler`.

- [ ] **Step 1: Write failing auth tests**

```go
func TestAgentsStateRejectsUnauthenticatedRequest(t *testing.T) {
	h := RequireIdentity(map[string]bool{"/resume/agui": true}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest(http.MethodPost, "/travel/agents/state", nil)
	if got := httptest.NewRecorder(); true { h.ServeHTTP(got, req); if got.Code != http.StatusUnauthorized { t.Fatalf("status = %d", got.Code) } }
}

func TestVerifiedSubjectOverridesSpoofedHeader(t *testing.T) {
	// JWKS test server signs a token for clerk-user; request sends x-clerk-user-id: attacker.
	// The downstream context must contain clerk-user.
}
```

- [ ] **Step 2: Run the auth tests to verify failure**

Run: `cd agents && go test ./internal/auth -run Test -count=1`

Expected: FAIL because middleware is missing.

- [ ] **Step 3: Implement JWKS caching, identity policy, and CORS**

```go
func RequireIdentity(public map[string]bool, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if public[r.URL.Path] { next.ServeHTTP(w, r.WithContext(withIdentity(r.Context(), anonymousIdentity(r)))); return }
		identity, err := verifier.Verify(r.Context(), bearerToken(r.Header))
		if err != nil { http.Error(w, "unauthorized", http.StatusUnauthorized); return }
		next.ServeHTTP(w, r.WithContext(withIdentity(r.Context(), identity)))
	})
}
```

Cache keys by `kid` with expiry from JWKS response headers, use `jwt/v5` issuer,
audience, and expiry validation, and reject unknown algorithms. CORS must
respond only with configured origins and never set credential support for `*`.

- [ ] **Step 4: Run auth tests and race detector**

Run: `cd agents && go test -race ./internal/auth -count=1 && go vet ./internal/auth`

Expected: PASS.

- [ ] **Step 5: Commit the security boundary**

```bash
git add agents/internal/auth
git commit -m "feat(agents): secure Go gateway identity routes"
```

### Task 5: Implement the OpenAI-compatible ADK-Go model adapter

**Files:**

- Create: `agents/internal/providers/openai/model.go`
- Create: `agents/internal/providers/openai/transport.go`
- Create: `agents/internal/providers/openai/model_test.go`

**Interfaces:**

- Consumes `config.Provider` and `rate.ProviderLimiter`.
- Produces `openai.New(provider config.Provider, client *http.Client, limiter *rate.ProviderLimiter) *Model`.
- Implements `model.LLM`: `Name() string` and `GenerateContent(context.Context, *model.LLMRequest, bool) iter.Seq2[*model.LLMResponse, error]`.

- [ ] **Step 1: Write failing streaming/tool-call tests**

```go
func TestGenerateContentStreamsTextAndFunctionArguments(t *testing.T) {
	server := newOpenAIStreamServer(t, []string{
		`data: {"choices":[{"delta":{"content":"hello "}}]}`,
		`data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"set_trip_meta","arguments":"{\\\"destination\\\":\\\"Paris"}}]}}]}`,
		`data: [DONE]`,
	})
	responses := collect(New(testProvider(server.URL), server.Client(), allowAll).GenerateContent(context.Background(), request(), true))
	if got := text(responses); got != "hello " { t.Fatalf("text = %q", got) }
	if got := functionArgs(responses); got != `{"destination":"Paris` { t.Fatalf("args = %q", got) }
}

func TestGenerateContentFallsBackOnlyForRetryableProviderError(t *testing.T) {
	// 429 triggers configured fallback; 401 returns terminal error without fallback.
}
```

- [ ] **Step 2: Run provider tests to verify failure**

Run: `cd agents && go test ./internal/providers/openai -run TestGenerateContent -count=1`

Expected: FAIL because `Model` is undefined.

- [ ] **Step 3: Implement an ADK-Go `model.LLM` adapter**

```go
type Model struct {
	provider config.Provider
	client *http.Client
	limiter Limiter
}

func (m *Model) Name() string { return m.provider.Name + "/" + m.provider.Model }

func (m *Model) GenerateContent(ctx context.Context, req *model.LLMRequest, stream bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		if err := m.limiter.Acquire(ctx, m.provider.Name, m.provider.RequestsPerMinute); err != nil { yield(nil, err); return }
		// Encode req into OpenAI chat messages/tools, execute a bounded request,
		// decode SSE deltas into genai.Content and yield typed LLM responses.
	}
}
```

Map content, function declarations, function calls, and function responses in
both directions. Classify 408/429/5xx/network failures as retryable; classify
400/401/403/schema errors as terminal. Apply the configured fallback chain in
a constructor wrapper, with a per-provider circuit breaker, not inside an
unbounded retry loop. Redact authorization and prompt body from errors/logs.

- [ ] **Step 4: Run provider tests, race detector, and format**

Run: `cd agents && go test -race ./internal/providers/openai -count=1 && gofmt -w internal/providers/openai/*.go && go vet ./internal/providers/openai`

Expected: PASS.

- [ ] **Step 5: Commit the provider adapter**

```bash
git add agents/internal/providers/openai
git commit -m "feat(agents): add OpenAI-compatible ADK model adapter"
```

### Task 6: Build typed state transactions and dynamic client tools

**Files:**

- Create: `agents/internal/agentruntime/state.go`
- Create: `agents/internal/agentruntime/tool.go`
- Create: `agents/internal/agentruntime/state_test.go`
- Create: `agents/internal/agui/client_tools.go`
- Create: `agents/internal/agui/client_tools_test.go`

**Interfaces:**

- Produces `agentruntime.Transaction` with `Get`, `Set`, `Delete`, `Snapshot`, and `Patch`.
- Produces `agui.NewClientToolset(input []ClientTool, pending PendingTools) tool.Toolset`.
- Client tool outcomes persist/retrieve by `call_id`, app, user, and thread.

- [ ] **Step 1: Write failing transaction and client-tool isolation tests**

```go
func TestTransactionEscapesPatchPathsAndOmitsTemporaryKeys(t *testing.T) {
	tx := NewTransaction(map[string]any{"profile/name": "old", "temp:token": "secret"})
	tx.Set("profile/name", "new")
	patch := tx.Patch()
	if patch[0].Path != "/profile~1name" || patch[0].Op != "replace" { t.Fatalf("patch = %#v", patch) }
	if bytes.Contains(mustJSON(tx.PersistentSnapshot()), []byte("secret")) { t.Fatal("secret persisted") }
}

func TestClientToolResultCannotResumeAnotherUsersCall(t *testing.T) {
	// Store a pending approval for user-a; resolve it as user-b and require ErrPendingToolNotFound.
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd agents && go test ./internal/agentruntime ./internal/agui -run 'Test(Transaction|ClientTool)' -count=1`

Expected: FAIL because the state transaction and client toolset do not exist.

- [ ] **Step 3: Implement state mutation and client tool persistence**

```go
func (t *Transaction) Set(key string, value any) {
	_, exists := t.values[key]
	t.values[key] = value
	op := "add"; if exists { op = "replace" }
	t.patches = append(t.patches, Patch{Op: op, Path: "/" + escapeJSONPointer(key), Value: value})
}

func (p *PendingStore) Resolve(ctx context.Context, identity auth.Identity, app, thread, callID string, result any) error {
	// UPDATE/DELETE only where call_id, app_name, user_id, thread_id match and expiry is still valid.
}
```

Use `functiontool.New` to expose dynamic tools whose argument schemas come
from the AG-UI request. Write the pending record before emitting a tool call;
convert a later client function response into a `genai.FunctionResponse` for
the next ADK invocation.

- [ ] **Step 4: Run transaction/client-tool tests**

Run: `cd agents && go test -race ./internal/agentruntime ./internal/agui -run 'Test(Transaction|ClientTool)' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit state/client tool plumbing**

```bash
git add agents/internal/agentruntime agents/internal/agui/client_tools.go agents/internal/agui/client_tools_test.go
git commit -m "feat(agents): add Go state and client tool transactions"
```

### Task 7: Implement AG-UI input conversion, event conversion, and SSE handling

**Files:**

- Create: `agents/internal/agui/inbound.go`
- Create: `agents/internal/agui/converter.go`
- Create: `agents/internal/agui/handler.go`
- Create: `agents/internal/agui/state.go`
- Create: `agents/internal/agui/handler_test.go`
- Create: `agents/testdata/agui/resume-request.json`
- Create: `agents/testdata/agui/resume-events.jsonl`

**Interfaces:**

- Consumes `agentruntime.Registry`, authenticated identity, and D1 session service.
- Produces `agui.Handler(registry *Registry, sessions session.Service) http.Handler`.
- Converts AG-UI request messages/tools/context/state to `*genai.Content` plus `runner.RunOption` values.
- Converts `*session.Event` to official AG-UI Go SDK events and writes `data: <json>\n\n` frames.

- [ ] **Step 1: Create a complete failing resume SSE golden test**

```go
func TestHandlerStreamsResumeGoldenEvents(t *testing.T) {
	h := newGatewayWithFakeResumeModel(t)
	req := httptest.NewRequest(http.MethodPost, "/resume/agui", bytes.NewReader(readFixture(t, "resume-request.json")))
	req.Header.Set("Accept", "text/event-stream")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK { t.Fatalf("status = %d: %s", rr.Code, rr.Body.String()) }
	assertSSEEqual(t, rr.Body.Bytes(), readFixture(t, "resume-events.jsonl"))
}
```

The fixture must include a `RUN_STARTED`, initial `STATE_SNAPSHOT`, text
message start/content/end, state delta, and `RUN_FINISHED` sequence. Add
separate tests for malformed input, tool-result resume, reasoning text, and an
upstream model error ending with `RUN_ERROR`.

- [ ] **Step 2: Run handler tests to verify failure**

Run: `cd agents && go test ./internal/agui -run TestHandler -count=1`

Expected: FAIL because `newGatewayWithFakeResumeModel` and handler code are absent.

- [ ] **Step 3: Implement the complete request-to-SSE path**

```go
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	input, err := decodeRunInput(r.Body)
	if err != nil { writeJSONError(w, http.StatusBadRequest, "invalid_agui_input"); return }
	entry, err := h.registry.Lookup(routeAgent(r.URL.Path))
	if err != nil { writeJSONError(w, http.StatusNotFound, "unknown_agent"); return }
	identity := auth.IdentityFromContext(r.Context())
	ctx, cancel := context.WithTimeout(r.Context(), entry.Timeout); defer cancel()
	// Restore session, merge allowed ingress state, send RUN_STARTED + snapshot,
	// invoke runner.Run(..., agent.RunConfig{StreamingMode: agent.StreamingModeSSE}, runner.WithStateDelta(delta)),
	// convert each yielded event, persist non-partial effects, flush frames.
}
```

Use the AG-UI SDK's typed event constructors and SSE encoder. Do not copy the
reference converter's `default-user`, last-message-only, or `replace`-only
behavior. `Runner.Run` yields agent events, not the persisted ingress event;
therefore emit ingress snapshot/state behavior from the handler and convert
`event.Actions.StateDelta`, `event.Partial`, `event.IsFinalResponse()`, and
`event.LLMResponse.Content` from yielded events.

- [ ] **Step 4: Run golden, malformed-input, and race tests**

Run: `cd agents && go test -race ./internal/agui -count=1 && go vet ./internal/agui`

Expected: PASS.

- [ ] **Step 5: Commit the AG-UI protocol layer**

```bash
git add agents/internal/agui agents/testdata/agui
git commit -m "feat(agents): implement Go AG-UI streaming handler"
```

### Task 8: Add registry, embedded resume agent, gateway routes, and health checks

**Files:**

- Create: `agents/internal/agentruntime/registry.go`
- Create: `agents/internal/agents/resume/agent.go`
- Create: `agents/internal/agents/resume/assets.go`
- Create: `agents/internal/agents/resume/agent_test.go`
- Create: `agents/internal/agents/resume/instructions.md`
- Create: `agents/internal/agents/resume/resume.md`
- Create: `agents/cmd/gateway/main.go`
- Create: `agents/internal/observability/otel.go`

**Interfaces:**

- Produces `agentruntime.Entry{Route, AppName, Agent, StateDefaults, Public, Timeout, Health}`.
- Produces `resume.New(model model.LLM) (agent.Agent, error)` with app name `resume_agent`.
- Produces `gateway.New(cfg config.Config, deps Dependencies) (http.Handler, error)`.

- [ ] **Step 1: Write failing resume/route tests**

```go
func TestResumeAgentEmbedsGroundingAndDefaults(t *testing.T) {
	ag, err := resume.New(fakeModel{})
	if err != nil { t.Fatal(err) }
	if ag.Name() != "resume_agent" { t.Fatalf("name = %q", ag.Name()) }
	if !strings.Contains(resume.Instruction, "DoorDash") { t.Fatal("resume grounding was not embedded") }
}

func TestGatewayRegistersOnlyScopedStateRoutes(t *testing.T) {
	h := newGateway(t)
	assertRoute(t, h, http.MethodGet, "/resume/health", http.StatusOK)
	assertRoute(t, h, http.MethodGet, "/resume/agui/capabilities", http.StatusOK)
	assertRoute(t, h, http.MethodPost, "/resume/agents/state", http.StatusOK)
	assertRoute(t, h, http.MethodPost, "/agents/state", http.StatusNotFound)
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd agents && go test ./internal/agents/resume ./cmd/gateway -run Test -count=1`

Expected: FAIL because registry, gateway, and resume package do not exist.

- [ ] **Step 3: Implement the vertical gateway slice**

```go
// agents/internal/agents/resume/assets.go
package resume

import _ "embed"

//go:embed instructions.md
var instructionTemplate string
//go:embed resume.md
var resumeText string

var Instruction = strings.ReplaceAll(instructionTemplate, "{{RESUME}}", resumeText)
```

```go
func New(model model.LLM) (agent.Agent, error) {
	return llmagent.New(llmagent.Config{
		Name: "resume_agent", Description: "Public resume Q&A.",
		Instruction: Instruction, Model: model,
	})
}
```

Copy the approved resume source assets into the Go package. Register all
resume routes beneath `/resume`; expose a D1/R2 health check without a model
call. Root health checks D1/R2 once through short timeouts. Set secure server
timeouts and OTEL HTTP tracing in `cmd/gateway/main.go`.

- [ ] **Step 4: Run the resume gateway integration suite**

Run: `cd agents && go test -race ./internal/agents/resume ./cmd/gateway ./internal/agui -count=1`

Expected: PASS.

- [ ] **Step 5: Commit the usable Go gateway slice**

```bash
git add agents/internal/agentruntime/registry.go agents/internal/agents/resume agents/cmd/gateway agents/internal/observability
git commit -m "feat(agents): serve resume through Go ADK and AG-UI"
```

### Task 9: Add foundation CI checks and a local no-Python image smoke test

**Files:**

- Create: `agents/Dockerfile.go-foundation`
- Create: `agents/scripts/smoke-image.sh`
- Modify: `.github/workflows/ci.yml`
- Modify: `docker-compose.yml`
- Modify: `README.md`

**Interfaces:**

- Produces a repeatable `docker build -f agents/Dockerfile.go-foundation .` foundation image.
- Produces `agents/scripts/smoke-image.sh` exit status 0 only when the image lacks Python/Node binaries and serves `/health` using D1/R2 fakes.

- [ ] **Step 1: Write failing image assertions**

```bash
#!/usr/bin/env bash
set -euo pipefail
image="$1"
container="$(docker create "$image")"
trap 'docker rm -f "$container" >/dev/null' EXIT
files="$(docker export "$container" | tar -tf -)"
grep -qx './app/gateway' <<<"$files"
! grep -Eq '(^|/)python3?$|(^|/)node$|(^|/)uv$' <<<"$files"
```

- [ ] **Step 2: Run the smoke script to verify failure**

Run: `bash agents/scripts/smoke-image.sh agents-go-foundation:local`

Expected: FAIL because the image and script do not exist.

- [ ] **Step 3: Create a multi-stage Go image and CI jobs**

```dockerfile
FROM golang:1.26-bookworm AS build
WORKDIR /src/agents
COPY agents/go.mod agents/go.sum ./
RUN go mod download
COPY agents/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/gateway ./cmd/gateway

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/gateway /app/gateway
USER nonroot:nonroot
ENTRYPOINT ["/app/gateway"]
```

Add a CI job that runs `go test -race ./...`, `go vet ./...`, Go formatting
check, and the foundation image smoke test. Docker Compose adds a clearly named
`agents-go` development service with mandatory fake Cloudflare environment; it
does not replace the production Python service until the cutover plan.

- [ ] **Step 4: Run all foundation verification**

Run: `cd agents && go test -race ./... && go vet ./... && cd .. && docker build -f agents/Dockerfile.go-foundation -t agents-go-foundation:local . && bash agents/scripts/smoke-image.sh agents-go-foundation:local`

Expected: PASS.

- [ ] **Step 5: Commit foundation CI and image work**

```bash
git add agents/Dockerfile.go-foundation agents/scripts/smoke-image.sh .github/workflows/ci.yml docker-compose.yml README.md
git commit -m "ci(agents): verify Go gateway foundation"
```

## Foundation Completion Check

Before starting the port plan, demonstrate all of the following with current
evidence:

1. A Go-only image serves streamed `/resume/agui` and `/resume/agents/state`.
2. The provider adapter streams text and tool calls from an OpenAI-compatible
   fake server and distinguishes retryable from terminal failures.
3. D1 persistence scopes identity and excludes every `temp:` key.
4. R2 keys cannot cross app/user/thread boundaries.
5. AG-UI golden tests cover lifecycle, text, reasoning, state, tool result,
   and errors.
6. Clerk protects state routes while the resume route remains public.
7. CI runs the Go race, vet, format, and image checks.
