# uv Workspace Docker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Python agents to a uv workspace so Docker builds can install reusable local libraries.

**Architecture:** The repository root becomes the uv workspace root with one lockfile. Shared Python code moves into `packages/agent-common`, while each agent keeps its own app entrypoint and agent-specific MCP tools. Docker builds from the repo root using one reusable Dockerfile and `ARG` values for the target agent.

**Tech Stack:** uv workspaces, Python 3.14, FastAPI, Google ADK, Docker Compose.

---

### Task 1: Workspace and Shared Library

**Files:**

- Create: `pyproject.toml`
- Create: `packages/agent-common/pyproject.toml`
- Create: `packages/agent-common/src/agent_common/session_service.py`
- Create: `packages/agent-common/src/agent_common/a2a.py`
- Create: `packages/agent-common/src/agent_common/tools.py`
- Modify: `agents/*/pyproject.toml`

- [ ] Add a root uv workspace with members for all agents and `packages/agent-common`.
- [ ] Create the `agent-common` package with dependencies required by the moved code.
- [ ] Add `agent-common` as a workspace dependency to each agent.
- [ ] Run focused tests that import `agent_common` and verify the old behavior still fails before import updates.

### Task 2: Import Migration

**Files:**

- Modify: `agents/*/main.py`
- Modify: `agents/*/utils.py`
- Modify: `agents/*/tests/*.py`
- Delete: `agents/*/session_service.py`

- [ ] Replace duplicated `session_service` imports with `agent_common.session_service`.
- [ ] Replace duplicated A2A executor and callback helpers with `agent_common` imports.
- [ ] Keep agent-specific functions like `trvl_toolset`, `meal_planner_toolset`, `web_search_toolset`, and wellness A2A orchestration helpers local.
- [ ] Run the Python agent test suites.

### Task 3: Docker Workspace Build

**Files:**

- Create: `Dockerfile.agents`
- Create: `.dockerignore`
- Modify: `docker-compose.yml`
- Modify: `agents/*/railway.json`
- Delete: `agents/*/uv.lock`

- [ ] Add one root Dockerfile that installs dependencies with uv using the root workspace lockfile.
- [ ] Change Compose build contexts to the repo root and pass `AGENT_DIR`, `AGENT_PACKAGE`, and `PORT`.
- [ ] Keep Railway services compatible by pointing builds at the shared Dockerfile from the repo root.
- [ ] Generate the root `uv.lock`.
- [ ] Build at least one lightweight agent image and one Node-backed agent image.

### Task 4: Verification

**Files:**

- Modify only if verification exposes a real issue.

- [ ] Run `uv lock --check`.
- [ ] Run agent tests through uv.
- [ ] Run Docker Compose builds for representative services.
- [ ] Summarize any remaining deployment setting changes required outside the repo.
