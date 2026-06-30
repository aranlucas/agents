# Cloudflare D1 + R2 Migration Design

**Date:** 2026-06-29  
**Status:** Draft  
**Scope:** Migrate ADK session storage (Railway Postgres) → Cloudflare D1; migrate ADK artifact storage (in-memory) → Cloudflare R2. Railway Python gateway stays as compute.

---

## Motivation

All current LLM providers are free-tier (Cerebras, Groq, NVIDIA NIM, OpenRouter, Mistral, Gemini). Railway Postgres is the last paid infrastructure dependency. Migrating sessions to CF D1 and artifacts to CF R2 eliminates it while gaining CF's ecosystem (analytics, global distribution, no egress fees on R2).

---

## Architecture Overview

```
Railway gateway (Python ADK, unchanged)
    │
    ├── session reads/writes ──► CF D1  (httpx REST API)
    ├── artifact reads/writes ──► CF R2  (aioboto3, S3-compatible endpoint)
    └── rate-limit store ──────► SQLite  (in-container, ephemeral — acceptable)
```

The `AgentServices` dataclass in `dependencies.py` already abstracts both services. Implementations are swapped based on env vars at startup. Zero changes to any agent code.

---

## 1. D1 Session Service

### File

`agents/shared/src/agents_shared/d1_session_service.py`

### How it works

D1 exposes a REST API (`POST /accounts/{id}/d1/database/{id}/query`) and a batch variant (`/batch`) that accepts an array of `{sql, params}` objects and returns all results in one HTTP call. The batch endpoint is used for all multi-statement operations to keep round-trips to 1–2 per method.

### Schema (SQLite DDL, created on first use)

```sql
CREATE TABLE IF NOT EXISTS sessions (
    app_name   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    id         TEXT NOT NULL,
    state      TEXT NOT NULL DEFAULT '{}',
    create_time REAL NOT NULL,
    update_time REAL NOT NULL,
    PRIMARY KEY (app_name, user_id, id)
);

CREATE TABLE IF NOT EXISTS events (
    id         TEXT PRIMARY KEY,
    app_name   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    session_id TEXT NOT NULL,
    timestamp  REAL NOT NULL,
    author     TEXT,
    content    TEXT,
    actions    TEXT
);

CREATE TABLE IF NOT EXISTS app_state (
    app_name TEXT PRIMARY KEY,
    state    TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS user_state (
    app_name TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    state    TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (app_name, user_id)
);
```

### Key design decisions

- **`_batch(stmts)`** — internal helper; posts `[{sql, params}, ...]` to `/batch`; every mutating method uses it to stay at 1–2 HTTP calls.
- **`_prepare_tables()`** — lazy, one-time DDL via batch; guarded by an `asyncio.Lock` so concurrent startup doesn't double-create.
- **Stale detection** — no SQLAlchemy `update_marker` available. Uses `update_time` float comparison (same as `DatabaseSessionService`'s marker-less fallback path), plus a process-level `asyncio.Lock` per `(app_name, user_id, session_id)` to serialize concurrent `append_event` calls within the same process.
- **State storage** — app/user/session state stored as JSON TEXT; Python `json.loads`/`json.dumps` on read/write. Same three-way `_merge_state` logic as `DatabaseSessionService`.
- **`append_event` batch** — one `/batch` call containing: SELECT session + SELECT app_state + SELECT user_state → UPDATE session + UPSERT app_state + UPSERT user_state + INSERT event.
- **`get_user_state`** — implemented (single SELECT on `user_state` table).

### Methods implemented

All abstract methods from `BaseSessionService`:

- `create_session`
- `get_session`
- `list_sessions`
- `delete_session`
- `append_event` (overrides base; handles stale detection + batch write)
- `get_user_state` (overrides base; single D1 query)

### Health check

`D1SessionService.health_check()` → single `SELECT 1` via D1 REST API, used by `GET /health`.

### Env vars

| Var                 | Description                       |
| ------------------- | --------------------------------- |
| `CF_ACCOUNT_ID`     | Cloudflare account ID             |
| `CF_API_TOKEN`      | API token with D1:Edit permission |
| `CF_D1_DATABASE_ID` | Target D1 database ID             |

---

## 2. R2 Artifact Service

### No custom code needed

`S3ArtifactService` from `google/adk-python-community` works directly with R2 via its S3-compatible API.

```python
from google.adk_community.artifacts.s3_artifact_service import S3ArtifactService

S3ArtifactService(
    bucket_name=os.environ["CF_R2_BUCKET_NAME"],
    aws_configs={
        "endpoint_url": f"https://{os.environ['CF_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        "region_name": "auto",
        "aws_access_key_id": os.environ["CF_R2_ACCESS_KEY_ID"],
        "aws_secret_access_key": os.environ["CF_R2_SECRET_ACCESS_KEY"],
    },
)
```

### Env vars

| Var                       | Description                           |
| ------------------------- | ------------------------------------- |
| `CF_ACCOUNT_ID`           | Shared with D1                        |
| `CF_R2_BUCKET_NAME`       | R2 bucket name (e.g. `adk-artifacts`) |
| `CF_R2_ACCESS_KEY_ID`     | R2 API token key                      |
| `CF_R2_SECRET_ACCESS_KEY` | R2 API token secret                   |

---

## 3. Wiring Changes

### `agents/shared/src/agents_shared/session_service.py`

Add `create_d1_session_service()` factory; detects `CF_D1_DATABASE_ID` env var.

### `agents/shared/src/agents_shared/dependencies.py`

Update `create_agent_services()`:

```python
def create_agent_services() -> AgentServices:
    session_service = (
        create_d1_session_service()
        if os.getenv("CF_D1_DATABASE_ID")
        else create_session_service()          # existing SQLite/Postgres fallback
    )
    artifact_service = (
        create_r2_artifact_service()
        if os.getenv("CF_R2_BUCKET_NAME")
        else InMemoryArtifactService()
    )
    return AgentServices(
        session_service=session_service,
        artifact_service=artifact_service,
        memory_service=InMemoryMemoryService(),
        credential_service=InMemoryCredentialService(),
        engine=_build_engine(),                # SQLite fallback once DATABASE_URL removed
    )
```

### `agents/gateway/src/gateway/main.py`

Update `/health` to call `D1SessionService.health_check()` when D1 is active, instead of the SQLAlchemy `check_database_connection(engine)`.

---

## 4. Dependencies

Add to root `pyproject.toml`:

```toml
"aioboto3>=13.0",
"google-adk-community[s3]>=0.1",
```

`httpx` is already present.

---

## 5. Provisioning (Wrangler CLI — no IaC needed)

```bash
# one-time setup
wrangler d1 create adk-sessions
wrangler r2 bucket create adk-artifacts
```

Note the D1 database ID from the output; add it to Railway env vars.

For R2, create an API token in the CF dashboard with **R2:Edit** scope on the `adk-artifacts` bucket. Note the access key ID and secret.

---

## 6. Migration Path

1. Provision D1 + R2 via Wrangler (above).
2. Add CF env vars to Railway.
3. Deploy gateway — on startup, `create_agent_services()` detects CF vars and uses D1 + R2.
4. Verify via `/health` — should report D1 connected.
5. Remove `DATABASE_URL` from Railway to drop the Postgres instance.

No data migration is needed: sessions are ephemeral (agents recover from a fresh session gracefully) and current artifacts are in-memory (already lost on redeploy).

---

## 7. Free Tier Limits

| Product    | Free allowance                                  | Fit for this workload                                         |
| ---------- | ----------------------------------------------- | ------------------------------------------------------------- |
| D1         | 5M reads/day, 100K writes/day, 5 GB storage     | ✅ well within for 13 agents                                  |
| R2         | 10 GB/month storage, 1M writes, 10M reads/month | ✅ artifacts are small blobs                                  |
| Workers AI | 10K Neurons/day                                 | Out of scope for this migration; all providers stay free-tier |

---

## 8. Known Trade-offs

- **D1 REST latency**: Each `/batch` call from Railway → `api.cloudflare.com` adds ~50–150ms per agent turn on top of LLM inference. Acceptable since LLM calls dominate at 1–5s.
- **No row-level locking on D1**: Process-level `asyncio.Lock` prevents races within one Railway instance. Cross-instance races (if Railway scales to >1 replica) are not prevented — same limitation as SQLite today.
- **Rate-limit store stays SQLite**: The `RateLimitStore` (RPD counters) continues using the in-container SQLite engine. State resets on redeploy, which is acceptable for rate limiting.
- **`google-adk-community` is not an official ADK package**: Pin to a specific commit/version and monitor for upstream changes.
