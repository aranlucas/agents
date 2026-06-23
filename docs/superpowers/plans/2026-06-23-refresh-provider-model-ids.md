# Refresh Provider Model IDs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stale Cerebras and Groq model IDs with production-verified IDs and preserve the pending ADK `app_name` wiring change.

**Architecture:** Keep the existing shared `build_model()` boundary and fallback order. Update only the first two provider model IDs, and cover both the model chain and `ADKAgent.app_name` wiring in the existing shared regression test module.

**Tech Stack:** Python, Google ADK, LiteLLM, pytest, Ruff

## Global Constraints

- Use `cerebras/gpt-oss-120b` as the primary model.
- Use `groq/openai/gpt-oss-120b` as the first fallback.
- Keep the remaining fallback order unchanged.
- Pass `agent.name` to `ADKAgent` as `app_name`.
- Preserve unrelated workspace changes.

---

### Task 1: Add regression expectations

**Files:**

- Modify: `agents/shared/tests/test_app_factory.py`

**Interfaces:**

- Consumes: `build_model()` and `build_adk_agent()`
- Produces: regression coverage for current provider IDs and ADK app naming

- [ ] **Step 1: Update the model-chain expectations**

Expect `cerebras/gpt-oss-120b` and `groq/openai/gpt-oss-120b`.

- [ ] **Step 2: Add an app-name assertion**

Assert the constructed ADK agent stores `dummy_agent` as its application name.

- [ ] **Step 3: Run the focused test and verify it fails**

Run: `uv run pytest agents/shared/tests/test_app_factory.py -q`

Expected: model-chain assertions fail against the stale IDs.

### Task 2: Update shared model configuration

**Files:**

- Modify: `agents/shared/src/agents_shared/tools.py`
- Preserve: `agents/shared/src/agents_shared/app_factory.py`

**Interfaces:**

- Consumes: production-verified Cerebras and Groq model IDs
- Produces: updated `LiteLlm` primary/fallback configuration

- [ ] **Step 1: Replace the stale provider IDs**

Set the primary to `cerebras/gpt-oss-120b` and first fallback to `groq/openai/gpt-oss-120b`.

- [ ] **Step 2: Run focused tests**

Run: `uv run pytest agents/shared/tests/test_app_factory.py -q`

Expected: all tests pass.

- [ ] **Step 3: Run focused lint and repository checks**

Run: `uv run ruff check agents/shared/src/agents_shared/tools.py agents/shared/src/agents_shared/app_factory.py agents/shared/tests/test_app_factory.py`

Run: `pnpm check`

Expected: both commands exit successfully.

- [ ] **Step 4: Review, commit, and push**

Review `git diff --check` and the staged diff, commit the plan, model update, tests, and `app_factory.py`, then push the current branch.
