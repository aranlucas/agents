# Dockerfile + uv Workspace Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `Dockerfile.agents` into a cached, per-agent, multi-stage uv build, and clean up the uv-workspace/pnpm seam (dependency groups, dead config, bootstrap scripts).

**Architecture:** The Docker image becomes a two-stage build: a `builder` stage runs `uv sync --locked` in two phases (third-party deps from manifests only, then workspace packages from source) so dependency layers cache across code changes; the runtime stage copies only the venv + source and runs as a non-root user. Each image installs a single agent via an `AGENT_PACKAGE` build arg wired through docker-compose and Railway. Workspace cleanup happens *first* so `uv.lock` is final before the Docker work depends on it.

**Tech Stack:** Docker BuildKit, uv 0.11.x workspaces, pnpm scripts, Ruff.

**Repo facts the engineer needs:**
- Root `pyproject.toml` defines a uv workspace with members `agents/{a2ui,fitness,grocery,travel,wellness}` and `packages/agent-common`. Single `uv.lock` at the root.
- Python package names are `<dir>-agent` (e.g. `travel-agent`); import modules are `<dir>_agent` (e.g. `travel_agent.main`).
- All 5 agent pyprojects have an identical unused `[project.optional-dependencies] dev` block and a broken `[project.scripts] app` entry (points at an ASGI object, not a callable — entry points must be callables).
- Root `[dependency-groups] dev` already provides pytest/pytest-asyncio/httpx/ruff for the whole workspace.
- CI (`.github/workflows/ci.yml`) already runs `uv sync --frozen --all-packages` — no CI changes needed (`--frozen` ≡ `--locked`).
- `docker-compose.yml` builds the same image 5× with different runtime env (`AGENT_DIR`, `AGENT_MODULE`, `PORT`).
- Agents write SQLite session data to `/data` (named volume `adk-session-data`).
- `.dockerignore` already excludes `apps/`, `node_modules`, `.venv`, `**/tests`, `packages/types`.

---

### Task 1: Remove dead dev extras and broken script entries from agent pyprojects

**Files:**
- Modify: `agents/travel/pyproject.toml:26-30`
- Modify: `agents/grocery/pyproject.toml:26-30`
- Modify: `agents/fitness/pyproject.toml:27-31`
- Modify: `agents/wellness/pyproject.toml:27-31`
- Modify: `agents/a2ui/pyproject.toml:26-30`
- Modify: `uv.lock` (regenerated)

- [ ] **Step 1: Delete the two blocks from each of the 5 agent pyprojects**

In each file, delete these two blocks (line numbers vary by ±1 per file; match on content):

```toml
[project.optional-dependencies]
dev = ["pytest", "pytest-asyncio", "httpx"]

[project.scripts]
app = "<name>_agent.main:app"
```

Rationale (put in commit message, not code comments): the `dev` extras are unused — the root `[dependency-groups] dev` covers test tooling workspace-wide; the `app` script entry is invalid because `project.scripts` requires a callable, and an ASGI `FastAPI` instance is not one. Everything launches via `uvicorn <module>:app`.

- [ ] **Step 2: Regenerate the lockfile**

Run: `uv lock`
Expected: exits 0, `uv.lock` diff removes the per-agent `dev` extras entries. No third-party versions should change.

- [ ] **Step 3: Verify the workspace still resolves and tests pass**

Run: `uv sync --locked --all-packages && uv run pytest`
Expected: sync succeeds; pytest passes (same pass count as on `main`).

- [ ] **Step 4: Commit**

```bash
git add agents/*/pyproject.toml uv.lock
git commit -m "chore(py): drop unused dev extras and invalid project.scripts from agents"
```

---

### Task 2: Remove the redundant Ruff per-file-ignores block

**Files:**
- Modify: `pyproject.toml:44-58`

- [ ] **Step 1: Delete the duplicate block**

In the root `pyproject.toml`, the `[tool.ruff.lint.per-file-ignores]` table has a `"**/*.py"` entry that duplicates the global `ignore` list verbatim. Delete only the `"**/*.py"` entry; keep the table and the `"**/tests/**/*.py"` entry:

```toml
[tool.ruff.lint.per-file-ignores]
"**/tests/**/*.py" = [
  "S101", # Pytest assertion rewriting is the preferred test style.
]
```

(Do NOT touch the global `[tool.ruff.lint] ignore` list — codes like ANN/D/PLR are no-ops under the current `select`, but removing them is out of scope and they document intent if `ALL` is ever enabled.)

- [ ] **Step 2: Verify lint output is unchanged**

Run: `uv run ruff check agents packages/agent-common`
Expected: exits 0 with no new violations (identical to running it before the change).

- [ ] **Step 3: Commit**

```bash
git add pyproject.toml
git commit -m "chore(ruff): remove per-file-ignores block that duplicated the global ignore list"
```

---

### Task 3: Bootstrap Python env from pnpm and include Python tests in `pnpm test`

**Files:**
- Modify: `package.json:4-20`

- [ ] **Step 1: Edit the scripts block**

In root `package.json`, add a `postinstall` script and chain `test:py` into `test`:

```json
"scripts": {
  "postinstall": "uv sync",
  "dev": "concurrently \"pnpm --filter web dev\" \"docker compose up --build\" --names web,agents --prefix-colors blue,green --kill-others",
  "dev:web": "pnpm --filter web dev",
  "dev:mobile": "pnpm --filter mobile start",
  "dev:agents": "docker compose up --build",
  "lint": "oxlint",
  "lint:py": "uv run ruff check agents packages/agent-common",
  "check": "pnpm lint && pnpm lint:py && pnpm fmt",
  "test": "pnpm --filter web test && pnpm --filter mobile test && pnpm test:py",
  "test:py": "uv run pytest",
  "coverage": "pnpm coverage:ts && pnpm coverage:py",
  "coverage:ts": "pnpm --filter web exec vitest run --coverage && pnpm --filter mobile exec vitest run --coverage",
  "coverage:py": "uv run pytest --cov",
  "fmt": "oxfmt",
  "fmt:check": "oxfmt --check",
  "build": "pnpm --filter web build"
}
```

Note: `postinstall` runs plain `uv sync` (not `--locked`) so local installs self-heal after a member pyproject edit; CI keeps `--frozen` as the strict gate.

- [ ] **Step 2: Verify both hooks work**

Run: `pnpm install`
Expected: JS install completes, then `uv sync` output appears (`Resolved … Audited … packages`).

Run: `pnpm test:py`
Expected: pytest passes.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(pnpm): bootstrap uv sync on install, run Python tests in pnpm test"
```

---

### Task 4: Restructure Dockerfile.agents (multi-stage, two-phase locked sync, per-agent package)

**Files:**
- Modify: `Dockerfile.agents` (full rewrite)

**Design notes for the engineer:**
- Two-phase sync is the standard uv Docker pattern: phase 1 copies only `uv.lock` + every workspace `pyproject.toml` and installs third-party deps (`--no-install-workspace`); phase 2 copies source and installs the workspace packages. Result: editing agent source no longer invalidates the dependency layer.
- `COPY agents/*/pyproject.toml agents/` would flatten paths (BuildKit globs don't preserve directories without labs-only `--parents`), so phase 1 uses one explicit `COPY` per member. Adding a new agent means adding one line here — Task 6 documents that.
- `AGENT_PACKAGE` has **no default** and is validated with `${AGENT_PACKAGE:?…}` so a build without it fails immediately and loudly, rather than silently producing a travel-only image for a grocery service.
- `gcc`/`python3-dev` live only in the builder stage; `nodejs`/`npm` stay in runtime (agents launch MCP servers via `npx`); `curl` stays in runtime for the HEALTHCHECK.
- `/data` is created and chowned in the image so the named volume inherits `app` ownership on first use (otherwise SQLite writes fail for the non-root user).

- [ ] **Step 1: Replace Dockerfile.agents with the new build**

```dockerfile
# syntax=docker/dockerfile:1.7
FROM python:3.14.5-slim AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates gcc python3-dev && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.11.19 /uv /usr/local/bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app
ARG AGENT_PACKAGE

# Phase 1: third-party deps only — cached until a manifest or the lock changes
COPY pyproject.toml uv.lock ./
COPY agents/a2ui/pyproject.toml agents/a2ui/
COPY agents/fitness/pyproject.toml agents/fitness/
COPY agents/grocery/pyproject.toml agents/grocery/
COPY agents/travel/pyproject.toml agents/travel/
COPY agents/wellness/pyproject.toml agents/wellness/
COPY packages/agent-common/pyproject.toml packages/agent-common/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-workspace --package "${AGENT_PACKAGE:?AGENT_PACKAGE build arg is required, e.g. travel-agent}"

# Phase 2: workspace source
COPY agents/ agents/
COPY packages/agent-common/ packages/agent-common/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --package "${AGENT_PACKAGE}"


FROM python:3.14.5-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl nodejs npm && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home app && mkdir /data && chown app /data

COPY --from=builder --chown=app:app /app /app

WORKDIR /app
USER app
ENV PATH="/app/.venv/bin:$PATH" \
    AGENT_DIR="agents/travel"

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
    CMD curl -fsS "http://localhost:${PORT:-8000}/health" || exit 1

CMD ["sh", "-c", "agent_name=$(basename ${AGENT_DIR}) && module=${AGENT_MODULE:-${agent_name}_agent.main} && uvicorn ${module}:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

- [ ] **Step 2: Verify a missing build arg fails fast**

Run: `docker build -f Dockerfile.agents .`
Expected: FAILS during phase 1 with `AGENT_PACKAGE build arg is required, e.g. travel-agent`.

- [ ] **Step 3: Verify a per-agent build succeeds**

Run: `docker build -f Dockerfile.agents --build-arg AGENT_PACKAGE=travel-agent -t travel-agent:test .`
Expected: builds to completion; the phase-1 `uv sync` output should NOT list grocery/fitness/wellness/a2ui-only packages (e.g. only `travel-agent` and `agent-common` from the workspace).

- [ ] **Step 4: Verify layer caching works**

Run:
```bash
touch agents/travel/src/travel_agent/main.py
docker build -f Dockerfile.agents --build-arg AGENT_PACKAGE=travel-agent -t travel-agent:test .
```
Expected: the phase-1 `RUN uv sync` step shows `CACHED`; only phase 2 re-runs. Build finishes in seconds.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile.agents
git commit -m "feat(docker): multi-stage per-agent uv build with locked two-phase sync"
```

---

### Task 5: Wire AGENT_PACKAGE through docker-compose and verify end-to-end

**Files:**
- Modify: `docker-compose.yml` (each of the 5 services' `build` block)

- [ ] **Step 1: Add build args to every service**

For each service in `docker-compose.yml`, extend the `build` block. The five mappings:

| service  | AGENT_PACKAGE  |
| -------- | -------------- |
| travel   | travel-agent   |
| grocery  | grocery-agent  |
| fitness  | fitness-agent  |
| wellness | wellness-agent |
| a2ui     | a2ui-agent     |

Pattern (shown for `travel`; repeat for all 5 with the table values):

```yaml
  travel:
    build:
      context: .
      dockerfile: Dockerfile.agents
      args:
        AGENT_PACKAGE: travel-agent
```

Leave every service's `ports`, `env_file`, `environment`, and `volumes` blocks untouched.

- [ ] **Step 2: Build all services**

Run: `docker compose build`
Expected: all 5 images build. Phase-1 layers are per-agent (different `--package`), so the first full build is slower than before; later builds hit the uv cache mount.

- [ ] **Step 3: Boot and health-check every agent**

Run:
```bash
docker compose up -d
sleep 20
for p in 8000 8001 8002 8003 8004; do curl -fsS "http://localhost:$p/health" && echo " :$p ok"; done
docker compose ps
```
Expected: all 5 curls return the health payload; `docker compose ps` shows every service `healthy` (the new HEALTHCHECK). This also exercises the non-root `/data` SQLite write — check logs for permission errors:

Run: `docker compose logs --tail 50 travel | grep -i "permission\|error" || echo "no errors"`
Expected: `no errors` (or only unrelated startup noise).

Run: `docker compose down`

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(docker): pass AGENT_PACKAGE build arg per compose service"
```

---

### Task 6: Update AGENTS.md for the new build flow and Railway requirement

**Files:**
- Modify: `AGENTS.md` ("Adding a new agent" list and "Deployment" table)

**Railway context:** Railway injects service variables as Docker build args when the Dockerfile declares a matching `ARG`. Because `AGENT_PACKAGE` is now required, **each Railway agent service must define an `AGENT_PACKAGE` variable (e.g. `grocery-agent`) before this branch deploys** — otherwise the build fails with the explicit `:?` error. That is a deliberate loud failure, but it must be called out in the PR description.

- [ ] **Step 1: Update the "Adding a new agent" checklist**

In `AGENTS.md`, after the existing step 5 ("Add a service to `docker-compose.yml`…"), amend the list so it covers the two new requirements (renumber as needed):

```markdown
5. Add a service to `docker-compose.yml` at the repo root, with `build.args.AGENT_PACKAGE: <name>-agent`
6. Add a `COPY agents/<name>/pyproject.toml agents/<name>/` line to the phase-1 block in `Dockerfile.agents`
```

- [ ] **Step 2: Update the Deployment table row for Python agents**

Change the Railway row's config cell to:

```markdown
| Python agents  | Railway        | `Dockerfile.agents` + `agents/<name>/railway.json` — set Root Dir to repo root, set `AGENT_DIR=agents/<name>` and `AGENT_PACKAGE=<name>-agent` |
```

- [ ] **Step 3: Verify formatting passes**

Run: `pnpm fmt:check`
Expected: exits 0 (run `pnpm fmt` first if it rewrites the table).

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: document AGENT_PACKAGE build arg for compose and Railway"
```

---

## Rollout note (include in PR description)

- Before merging: set the `AGENT_PACKAGE` variable on each of the 5 Railway services (`travel-agent`, `grocery-agent`, `fitness-agent`, `wellness-agent`, `a2ui-agent`).
- Railway volume + non-root caveat: compose volumes inherit `/data` ownership from the image, but Railway-mounted volumes can be root-owned. If an agent fails on Railway with a SQLite permission error after this change, the fallback is to drop the `USER app` line (root in-container) — keep the rest of the build.
