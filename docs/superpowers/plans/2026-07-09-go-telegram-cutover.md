# Go Telegram and Production Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Python Telegram polling service and all remaining Python deployment/runtime wiring with Go, preserve active linking/mini-app and AG-UI behavior, then prove the Go Railway gateway remains below 400 MB RSS.

**Architecture:** `cmd/telegram` is a Go long-poll worker plus a lightweight health server. It uses the common Go registry, provider router, D1 store, and Clerk adapter but no AG-UI web code. The gateway owns the Go Telegram link-consume endpoint. Once both Go binaries pass full contract and production checks, Docker/Compose/CI/Railway configuration switches to Go-only images and Python runtime source/dependencies are deleted.

**Tech Stack:** Go 1.26, ADK-Go v2.0.0 (`google.golang.org/adk/v2`), direct Telegram Bot API HTTP client, Cloudflare D1/R2, Clerk Backend API HTTP client, Go AG-UI gateway, Docker multi-stage builds, Railway CLI/metrics, and GitHub Actions.

## Global Constraints

- Complete `2026-07-09-go-agents-foundation.md` and `2026-07-09-go-agent-ports.md` before this plan.
- The Go Telegram service has no Python, Node, `uv`, SQLAlchemy, local SQLite persistence, or `DATABASE_URL` fallback.
- Cloudflare D1 owns Go Telegram session, link token, account link, provider rate, and cleanup state. R2 remains the sole artifact store.
- Do not run two pollers with the same `TELEGRAM_BOT_TOKEN`. Use a test token for tests/canary or stop the Python poller before Go polling starts.
- Preserve Telegram commands, access controls, group mention/reply policy, topic/session identities, MarkdownV2 escaping/chunking, account link behavior, and credential gating.
- Preserve web-owned `/tma`, `/api/telegram/auth`, and `/telegram/link` flows; they are frontend identity surfaces and are not deleted.
- Gateway and Telegram images must contain no Python or Node executable. `GOMEMLIMIT` is not configured.
- Deployment success requires end-to-end production checks and Railway gateway RSS below 400 MB during representative use; local container memory is supplemental evidence only.

---

## Target Files

```text
agents/
  cmd/
    gateway/main.go
    telegram/main.go
  internal/
    telegram/
      api.go
      runner.go
      router.go
      markdown.go
      sessions.go
      link.go
      runner_test.go
      link_test.go
    clerk/backend.go
    cloudflare/migrations.go
  migrations/d1/002_telegram_links.sql
  Dockerfile
  Dockerfile.telegram
  scripts/{smoke-image.sh,smoke-telegram.sh,measure-rss.sh}
```

The final repository removes Python runtime directories under `agents/` after
the Go implementations and their tests are complete.

### Task 1: Add D1 link-token/account-link tables and the Go gateway consume route

**Files:**

- Create: `agents/migrations/d1/002_telegram_links.sql`
- Create: `agents/internal/telegram/link.go`
- Create: `agents/internal/telegram/link_test.go`
- Create: `agents/internal/clerk/backend.go`
- Modify: `agents/internal/cloudflare/migrations.go`
- Modify: `agents/cmd/gateway/main.go`

**Interfaces:**

- Produces `telegram.LinkStore.Create(ctx, telegramUserID int64, ttl time.Duration) (rawToken string, err error)`.
- Produces `telegram.LinkStore.Consume(ctx, rawToken, clerkUserID string) (telegram.AccountLink, error)`.
- Produces `POST /telegram/link/consume`, guarded by `x-telegram-link-secret` and returning no raw token.
- Produces a minimal `clerk.Backend` interface for lookup, OAuth connection checks, and best-effort metadata mirroring.

- [ ] **Step 1: Write failing one-time token and consume-route tests**

```go
func TestLinkTokenIsHashedOneTimeAndExpires(t *testing.T) {
	store := newLinkStore(t, fixedClock)
	raw, err := store.Create(context.Background(), 42, 10*time.Minute)
	if err != nil { t.Fatal(err) }
	if store.ContainsRawToken(raw) { t.Fatal("raw token persisted") }
	if _, err := store.Consume(context.Background(), raw, "user-a"); err != nil { t.Fatal(err) }
	if _, err := store.Consume(context.Background(), raw, "user-a"); !errors.Is(err, ErrLinkTokenUsed) { t.Fatalf("error = %v", err) }
}

func TestLinkConsumeRejectsWrongSharedSecret(t *testing.T) {
	h := newGatewayWithLinkStore(t)
	req := httptest.NewRequest(http.MethodPost, "/telegram/link/consume", strings.NewReader(`{"token":"raw"}`))
	req.Header.Set("x-telegram-link-secret", "wrong")
	rr := httptest.NewRecorder(); h.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized { t.Fatalf("status = %d", rr.Code) }
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd agents && go test ./internal/telegram ./cmd/gateway -run 'Test(Link|LinkConsume)' -count=1`

Expected: FAIL because Telegram link types and route are absent.

- [ ] **Step 3: Implement D1-backed link flow**

```sql
-- agents/migrations/d1/002_telegram_links.sql
CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  token_hash TEXT PRIMARY KEY, telegram_user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL, consumed_at INTEGER
);
CREATE TABLE IF NOT EXISTS telegram_account_links (
  telegram_user_id INTEGER PRIMARY KEY, clerk_user_id TEXT NOT NULL,
  linked_at INTEGER NOT NULL, unlinked_at INTEGER
);
CREATE INDEX IF NOT EXISTS telegram_link_tokens_expiry ON telegram_link_tokens(expires_at);
```

```go
func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func (s *LinkStore) Consume(ctx context.Context, raw, clerkUserID string) (AccountLink, error) {
	// D1 batch: select unconsumed/unexpired hash, mark consumed, upsert link.
	// Return a stable error for unknown/used/expired tokens without distinguishing raw values to clients.
}
```

Generate 32 random bytes using `crypto/rand`, encode URL-safe text, store only
the SHA-256 hash, and set ten-minute expiry. The gateway endpoint authenticates
the web user with Clerk, separately validates the shared link secret, consumes
the token, and then asks `clerk.Backend` to mirror metadata. Clerk mirroring is
best-effort and cannot rollback a valid D1 link.

- [ ] **Step 4: Run link, auth, and gateway tests**

Run: `cd agents && go test -race ./internal/telegram ./internal/clerk ./cmd/gateway -run 'Test(Link|Clerk|Gateway)' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit Go account linking**

```bash
git add agents/migrations/d1/002_telegram_links.sql agents/internal/telegram/link.go agents/internal/telegram/link_test.go agents/internal/clerk agents/internal/cloudflare/migrations.go agents/cmd/gateway/main.go
git commit -m "feat(agents): port Telegram account linking to Go"
```

### Task 2: Implement a typed, bounded Telegram Bot API client and message formatter

**Files:**

- Create: `agents/internal/telegram/api.go`
- Create: `agents/internal/telegram/markdown.go`
- Create: `agents/internal/telegram/api_test.go`
- Create: `agents/internal/telegram/markdown_test.go`

**Interfaces:**

- Produces `telegram.Client` with `GetUpdates`, `SendMessage`, `SendChatAction`, and context-aware error classification.
- Produces `telegram.EscapeMarkdownV2(text string) string` and `telegram.ChunkMarkdownV2(text string, maximum int) []string`.
- Defines `Update`, `Message`, `Chat`, `User`, and `ForumTopic` types needed by the runner.

- [ ] **Step 1: Write failing Markdown/chunking and HTTP tests**

```go
func TestChunkMarkdownV2EscapesAndNeverExceedsTelegramLimit(t *testing.T) {
	chunks := ChunkMarkdownV2("value_(x) " + strings.Repeat("a", 5000), 4096)
	if len(chunks) < 2 { t.Fatal("expected split") }
	for _, chunk := range chunks {
		if len([]rune(chunk)) > 4096 { t.Fatalf("chunk too long: %d", len([]rune(chunk))) }
		if strings.Contains(chunk, "_") && !strings.Contains(chunk, "\\_") { t.Fatalf("unescaped markdown: %q", chunk) }
	}
}

func TestGetUpdatesUsesLongPollTimeoutAndOffset(t *testing.T) {
	// Test server validates getUpdates?timeout=50&offset=101 and returns one message update.
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd agents && go test ./internal/telegram -run 'Test(Chunk|GetUpdates)' -count=1`

Expected: FAIL because Telegram client and formatter are absent.

- [ ] **Step 3: Implement direct Bot API transport**

```go
func (c *HTTPClient) GetUpdates(ctx context.Context, offset int64, timeout int) ([]Update, error) {
	if timeout < 1 || timeout > 50 { timeout = 50 }
	endpoint := c.baseURL + "/bot" + c.token + "/getUpdates"
	body := strings.NewReader(url.Values{"offset": {strconv.FormatInt(offset, 10)}, "timeout": {strconv.Itoa(timeout)}, "allowed_updates": {`["message"]`}}.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, body)
	if err != nil { return nil, err }
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	return decodeUpdates(c.client.Do(req))
}
```

Escape all Telegram MarkdownV2 punctuation, split at rune boundaries preferably
on whitespace, and never split immediately after a backslash. Cap response
bodies and redact bot token from all errors/logs. The client must ignore
non-message, media-only, callback, and edited update payloads by design.

- [ ] **Step 4: Run Telegram API/formatter tests**

Run: `cd agents && go test -race ./internal/telegram -run 'Test(Chunk|GetUpdates|SendMessage)' -count=1 && go vet ./internal/telegram`

Expected: PASS.

- [ ] **Step 5: Commit Telegram API client**

```bash
git add agents/internal/telegram/api.go agents/internal/telegram/markdown.go agents/internal/telegram/api_test.go agents/internal/telegram/markdown_test.go
git commit -m "feat(agents): add Go Telegram API client"
```

### Task 3: Port command policy, identity/session keys, and credential gates

**Files:**

- Create: `agents/internal/telegram/sessions.go`
- Create: `agents/internal/telegram/router.go`
- Create: `agents/internal/telegram/router_test.go`
- Modify: `agents/internal/clerk/backend.go`

**Interfaces:**

- Produces `telegram.SessionIdentity(update Update, link AccountLink) SessionIdentity`.
- Produces `telegram.AllowMessage(cfg Config, message Message) bool`.
- Produces `telegram.Router.Route(ctx context.Context, message Message, identity SessionIdentity) (Route, error)`.
- Produces `/start`, `/help`, `/login`, `/logout`, `/unlink`, `/new`, `/reset`, `/stop`, and `/chat_id` command outcomes.

- [ ] **Step 1: Write failing topic/mention/credential tests**

```go
func TestTopicSessionUsesSharedGroupPartition(t *testing.T) {
	msg := Message{Chat: Chat{ID: -100, Type: "supergroup"}, MessageThreadID: 7, From: User{ID: 9}}
	id := SessionIdentityFor(msg, AccountLink{})
	if id.SessionID != "telegram:-100:topic:7:orchestrator" || id.UserID != "telegram:group:-100:topic:7" { t.Fatalf("identity = %#v", id) }
}

func TestGroupMessageRequiresMentionOrReply(t *testing.T) {
	cfg := Config{BotUsername: "agents_bot"}
	if AllowMessage(cfg, Message{Chat: Chat{Type: "group"}, Text: "plan meals"}) { t.Fatal("unmentioned group message accepted") }
	if !AllowMessage(cfg, Message{Chat: Chat{Type: "group"}, Text: "@agents_bot plan meals"}) { t.Fatal("mention rejected") }
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd agents && go test ./internal/telegram -run 'Test(TopicSession|GroupMessage)' -count=1`

Expected: FAIL because session/route policy is absent.

- [ ] **Step 3: Implement deterministic command and routing policy**

```go
func SessionIdentityFor(m Message, link AccountLink) SessionIdentity {
	if m.MessageThreadID != 0 {
		return SessionIdentity{SessionID: fmt.Sprintf("telegram:%d:topic:%d:orchestrator", m.Chat.ID, m.MessageThreadID), UserID: fmt.Sprintf("telegram:group:%d:topic:%d", m.Chat.ID, m.MessageThreadID)}
	}
	user := link.ClerkUserID
	if user == "" { user = fmt.Sprintf("telegram:anon:%d", m.From.ID) }
	return SessionIdentity{SessionID: fmt.Sprintf("telegram:%d:orchestrator", m.Chat.ID), UserID: user}
}
```

Parse commands before LLM routing. Enforce `TELEGRAM_ALLOWED_CHAT_IDS` when
nonempty. Private chats may use text; group/supergroup text needs configured
bot mention or reply. `/login` creates a D1 link token and sends
`TELEGRAM_LINK_BASE_URL + "/telegram/link?token=" + raw`; `/logout` removes
the D1 link and clears user metadata best-effort; `/reset` deletes/recreates
only the exact computed session. Credential gates inspect the linked Clerk user
and refuse Grocery/Wellness without Kroger or Fitness/Wellness without Strava.

- [ ] **Step 4: Run session/command/credential tests**

Run: `cd agents && go test -race ./internal/telegram ./internal/clerk -run 'Test(Topic|Group|Command|Credential)' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit Telegram policy**

```bash
git add agents/internal/telegram/sessions.go agents/internal/telegram/router.go agents/internal/telegram/router_test.go agents/internal/clerk/backend.go
git commit -m "feat(agents): port Telegram routing and credentials"
```

### Task 4: Port long-poll runner, agent orchestration, timeout/cancellation, and health server

**Files:**

- Create: `agents/internal/telegram/runner.go`
- Create: `agents/internal/telegram/runner_test.go`
- Create: `agents/cmd/telegram/main.go`

**Interfaces:**

- Produces `telegram.Runner.Run(ctx context.Context) error` and `HandleMessage(ctx context.Context, message Message) error`.
- Produces one cancellation function per exact session ID with automatic deletion after completion.
- Produces `GET /health` from `cmd/telegram` while long polling runs.

- [ ] **Step 1: Write failing runner behavior tests**

```go
func TestStopCancelsOnlyCurrentSessionTask(t *testing.T) {
	r := newRunner(t)
	started := r.startBlockingTask("telegram:1:orchestrator")
	if err := r.HandleMessage(context.Background(), commandMessage(1, "/stop")); err != nil { t.Fatal(err) }
	select { case <-started.Done(): default: t.Fatal("task was not cancelled") }
	if r.HasTask("telegram:1:orchestrator") { t.Fatal("cancelled task retained") }
}

func TestRunnerSendsProgressThenDeduplicatedFinalText(t *testing.T) {
	// Fake router emits subagent progress twice plus final text; assert labeled progress and one final response.
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd agents && go test ./internal/telegram -run 'Test(Stop|RunnerSends)' -count=1`

Expected: FAIL because runner is absent.

- [ ] **Step 3: Implement bounded Go polling/orchestration**

```go
func (r *Runner) HandleMessage(parent context.Context, message Message) error {
	identity := SessionIdentityFor(message, r.links.Lookup(parent, message.From.ID))
	ctx, cancel := context.WithTimeout(parent, r.runTimeout)
	if !r.tasks.Start(identity.SessionID, cancel) { return r.sendBusy(ctx, message.Chat.ID) }
	defer r.tasks.Finish(identity.SessionID)
	defer cancel()
	result, err := r.orchestrator.Run(ctx, identity, message.Text, r.progressSender(message.Chat.ID))
	if err != nil { return r.sendError(message.Chat.ID, sanitizeTelegramError(err)) }
	return r.sendResult(ctx, message.Chat.ID, result)
}
```

The outer orchestrator uses Mistral Medium and chooses exactly one registered
specialist. Do not route Telegram Trends through A2UI; use a chat-only Trends
variant and direct Brave HTTP tools. For shared-state specialists, invoke a
purpose-built Telegram agent configuration rather than relying on ADK
`AgentTool` child-session state propagation. Cap per-session lock/task maps by
removing entries at completion and periodically pruning expired idle entries.
Use the configured 180-second timeout; send generic safe error text rather
than raw exception content. Summarize state only when no model text was
produced, then send `Done.` only when neither text nor state summary exists.

- [ ] **Step 4: Run runner integration/race tests**

Run: `cd agents && go test -race ./internal/telegram ./cmd/telegram -count=1 && go vet ./internal/telegram ./cmd/telegram`

Expected: PASS.

- [ ] **Step 5: Commit Telegram runtime**

```bash
git add agents/internal/telegram agents/cmd/telegram
git commit -m "feat(agents): port Telegram polling runtime to Go"
```

### Task 5: Replace images, development scripts, and CI with Go-only variants

**Files:**

- Modify: `agents/Dockerfile`
- Modify: `agents/Dockerfile.telegram`
- Modify: `docker-compose.yml`
- Modify: `agents/package.json`
- Modify: `package.json`
- Modify: `turbo.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `railway.toml`
- Create: `agents/railway.telegram.toml`
- Create: `agents/scripts/smoke-telegram.sh`
- Create: `agents/scripts/measure-rss.sh`

**Interfaces:**

- Produces Go-only `gateway` and `telegram` container images.
- Produces compose services `agents` and `telegram` that use required Cloudflare variables and no `/data` SQLite volume.
- Produces CI jobs that test/build/smoke both images.

- [ ] **Step 1: Write failing image-content and command smoke tests**

```bash
#!/usr/bin/env bash
set -euo pipefail
image="$1"
container="$(docker create "$image")"
trap 'docker rm -f "$container" >/dev/null' EXIT
files="$(docker export "$container" | tar -tf -)"
grep -qx './app/telegram' <<<"$files"
! grep -Eq '(^|/)python3?$|(^|/)node$|(^|/)uv$' <<<"$files"
```

- [ ] **Step 2: Run smoke test to verify failure**

Run: `bash agents/scripts/smoke-telegram.sh agents-telegram-go:local`

Expected: FAIL because the Go Telegram image and script do not yet exist.

- [ ] **Step 3: Replace runtime build and orchestration configuration**

```dockerfile
FROM golang:1.26-bookworm AS build
WORKDIR /src/agents
COPY agents/go.mod agents/go.sum ./
RUN go mod download
COPY agents/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/telegram ./cmd/telegram

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/telegram /app/telegram
USER nonroot:nonroot
ENTRYPOINT ["/app/telegram"]
```

Use analogous Go-only build stages for gateway, copying the oralboards asset
and using a pure-Go SQLite driver so the final image remains static. Compose
removes `ADK_SESSION_DB_PATH` and `.data` volume, has a separately named
Telegram service, and reads only Cloudflare/provider/Clerk/Telegram env files.
Update CI to install Go 1.26, run `go test -race ./...`, `go vet ./...`, Go
format check, and Docker smoke tests for both images. `railway.toml` points to
gateway Go Dockerfile; `agents/railway.telegram.toml` declares the separate
worker image and `/health` check for the Telegram service.

- [ ] **Step 4: Run local build/smoke verification**

Run: `docker build -f agents/Dockerfile -t agents-gateway-go:local . && docker build -f agents/Dockerfile.telegram -t agents-telegram-go:local . && bash agents/scripts/smoke-image.sh agents-gateway-go:local && bash agents/scripts/smoke-telegram.sh agents-telegram-go:local`

Expected: PASS.

- [ ] **Step 5: Commit Go-only deployment wiring**

```bash
git add agents/Dockerfile agents/Dockerfile.telegram docker-compose.yml agents/package.json package.json turbo.json .github/workflows/ci.yml railway.toml agents/railway.telegram.toml agents/scripts
git commit -m "build(agents): deploy Go gateway and Telegram images"
```

### Task 6: Remove Python runtime and legacy persistence wiring after Go parity passes

**Files:**

- Delete: `agents/gateway/`
- Delete: `agents/shared/`
- Delete: `agents/excalidraw/`
- Delete: `agents/expense/`
- Delete: `agents/fitness/`
- Delete: `agents/grocery/`
- Delete: `agents/oralboards/`
- Delete: `agents/presentation/`
- Delete: `agents/research/`
- Delete: `agents/resume/`
- Delete: `agents/spreadsheet/`
- Delete: `agents/telegram/`
- Delete: `agents/travel/`
- Delete: `agents/trends/`
- Delete: `agents/wellness/`
- Delete: `agents/a2ui/`
- Delete: `agents/Dockerfile.go-foundation`
- Delete: `pyproject.toml`
- Delete: `uv.lock`
- Delete: `pyrightconfig.json`
- Delete: `stubs/`
- Delete: `cloudflare/verify-r2.py`
- Delete: `agents-cli-manifest.yaml`
- Create: `agents/scripts/assert-go-only.sh`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `.env.example`
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`

**Interfaces:**

- Produces a repository where no production path under `agents/` imports or executes Python.
- Produces documentation that lists Go/Cloudflare prerequisites and no longer mentions `DATABASE_URL` or `uv` for agents.

- [ ] **Step 1: Write failing repository-removal guard**

```bash
#!/usr/bin/env bash
set -euo pipefail
if rg -n --glob '!docs/superpowers/**' 'FastAPI|google\.adk|LiteLlm|DATABASE_URL|ADK_SESSION_DB_PATH|uv run|python-telegram-bot' agents package.json .github README.md AGENTS.md; then
  echo "legacy runtime reference remains" >&2
  exit 1
fi
if find agents -type f -name '*.py' | grep -q .; then
  echo "Python runtime file remains under agents" >&2
  exit 1
fi
```

- [ ] **Step 2: Run guard to verify failure before deletion**

Run: `bash agents/scripts/assert-go-only.sh`

Expected: FAIL while legacy Python source/configuration remains.

- [ ] **Step 3: Delete replaced runtime and rewrite operational docs**

```markdown
## Agents runtime

The agents gateway and Telegram worker are Go binaries under `agents/cmd`.
They require Cloudflare D1/R2 credentials and provider API keys; no local or
Postgres database fallback exists. Run `pnpm dev:agents` for the gateway and
`pnpm dev:telegram` for the worker after setting the mandatory environment.
```

Only delete the listed files after Go tests demonstrate equivalent behavior.
Keep web/mobile TypeScript and Telegram Mini App files because they remain
active clients. Replace `cloudflare/verify-r2.py` with the R2 smoke assertion
in `agents/scripts/smoke-image.sh` before removing Python project tooling. Remove the obsolete Python
coverage gate, Ruff/Pyright setup, uv postinstall hook, and legacy `DATABASE_URL`
documentation. Rewrite the `AGENTS.md` runtime, filesystem, test, eval, and
deployment sections for Go/ADK-Go; remove the Python `adk optimize` manifest
and GEPA instructions along with `agents-cli-manifest.yaml`. Update
`.env.example` with every Telegram variable omitted today:
`TELEGRAM_MINI_APP_URL`, `TELEGRAM_BOT_USERNAME`, and
`TELEGRAM_RUN_TIMEOUT_SECONDS`.

- [ ] **Step 4: Run the Go-only guard and full repository verification**

Run: `bash agents/scripts/assert-go-only.sh && cd agents && go test -race ./... && go vet ./... && cd .. && pnpm check && pnpm test`

Expected: PASS.

- [ ] **Step 5: Commit the Python runtime removal**

```bash
git add -A agents pyproject.toml uv.lock pyrightconfig.json stubs cloudflare/verify-r2.py agents-cli-manifest.yaml README.md AGENTS.md .env.example .github/workflows/ci.yml package.json
git commit -m "refactor(agents): remove Python runtime"
```

### Task 7: Deploy, run end-to-end checks, and measure Railway RSS

**Files:**

- Create: `agents/scripts/production-smoke.sh`
- Create: `agents/scripts/measure-rss.sh`
- Modify: `README.md`

**Interfaces:**

- Produces `production-smoke.sh` that checks health, all AG-UI routes, protected state, public resume, client-tool resume, A2UI, OAuth header injection, and Telegram bot health without real booking/cart mutations.
- Produces `measure-rss.sh SERVICE ENVIRONMENT WINDOW` that calls Railway CLI metrics, records timestamped raw memory data, and fails when maximum `MEMORY_USAGE_GB` reaches 0.4 GB.

- [ ] **Step 1: Write a failing deployment evidence parser test**

```bash
#!/usr/bin/env bash
set -euo pipefail
service="${1:?service required}"
environment="${2:?environment required}"
window="${3:-15m}"
raw="$(railway metrics --service "$service" --environment "$environment" --memory --raw --json --since "$window")"
peak_gb="$(jq -er '[.measurements.MEMORY_USAGE_GB[]?.value] | max' <<<"$raw")"
awk -v peak="$peak_gb" 'BEGIN { exit !(peak < 0.4) }' || { echo "peak memory ${peak_gb}GB reaches 400MB" >&2; exit 1; }
printf '%s\n' "$raw"
```

- [ ] **Step 2: Run the threshold parser to verify failure**

Run: `bash agents/scripts/measure-rss.sh agents-gateway production 15m`

Expected: FAIL against a fixture or production service whose peak metric is at least `0.4`.

- [ ] **Step 3: Implement production smoke and measurement scripts**

```bash
curl --fail --silent --show-error "$AGENTS_BASE_URL/health"
for route in excalidraw travel trends grocery fitness wellness expense oralboards presentation research spreadsheet resume; do
  curl --fail --silent --show-error "$AGENTS_BASE_URL/$route/health"
done
```

Add deterministic authenticated AG-UI fixture requests using non-mutating fake
provider/MCP endpoints. After warm-up and during a fixed concurrent smoke run,
call `railway metrics --service agents-gateway --environment production
--memory --raw --json --since 15m`; parse
`.measurements.MEMORY_USAGE_GB[].value`, write the raw JSON plus the maximum to
the deployment artifact, and accept only a maximum below `0.4`. Railway's
metric is service memory, so production runs use one gateway replica for this
per-process acceptance check.

- [ ] **Step 4: Deploy and run acceptance evidence**

Run: `railway up --service agents-gateway && bash agents/scripts/production-smoke.sh && bash agents/scripts/measure-rss.sh agents-gateway production 15m`

Expected: all route and interaction checks PASS; every recorded gateway RSS
sample is less than `0.4` GB.

- [ ] **Step 5: Deploy Telegram independently and commit release evidence**

```bash
railway up --service agents-telegram --config agents/railway.telegram.toml
git add agents/scripts README.md
git commit -m "chore(agents): verify Go Railway migration"
```

Do not mark the migration complete until the Railway evidence includes a
successful Go gateway deployment, separate Go Telegram deployment, end-to-end
interactive smoke checks, and the sub-400 MB gateway RSS maximum.

## Cutover Completion Check

Before declaring completion, verify from current repository and deployment
state:

1. Every runtime under `agents/` is Go and the Go-only guard passes.
2. D1/R2 configuration is mandatory and no `DATABASE_URL` fallback remains.
3. Web/mobile AG-UI paths, state routes, client approvals, Oralboards, Trends
   A2UI, and OAuth request headers work in the deployed gateway.
4. Telegram command, allowlist, group, topic, account-link, cancellation,
   chunking, and credential-gate tests pass against the Go worker.
5. Both final images contain no Python/Node runtime.
6. Railway gateway RSS evidence stays below 400 MB under the defined workload.
