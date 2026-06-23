# Google Trends Agent — Design Spec

**Date:** 2026-06-23  
**Status:** Approved

---

## Overview

Port the [google/adk-samples Google Trends agent](https://github.com/google/adk-samples/tree/main/python/agents/google-trends-agent) into this monorepo and wire it into the multi-agent console UI.

The agent translates natural-language questions about search trends into BigQuery SQL, executes them against the `bigquery-public-data.google_trends.*` public dataset, and streams the formatted results into a markdown artifact panel.

---

## Architecture

### Agent pattern

A `SequentialAgent` wrapping two `LlmAgent` sub-agents (preserves the original ADK sample design):

1. **`TrendsQueryGeneratorAgent`** — converts the user's question into a BigQuery SQL query using Jinja2-templated prompts (table schema rules + 8 few-shot examples). Writes the SQL to `state["generated_sql"]` via `output_key`.
2. **`TrendsQueryExecutorAgent`** — reads `{generated_sql}` from state, calls `execute_bigquery_sql`, then calls `write_trends_result` to format and persist the output as a markdown artifact.

Both sub-agents use `build_model()` (the repo's shared free LiteLLM pool) instead of the sample's Vertex AI Gemini.

### GCP credentials

The agent requires BigQuery access. In Railway (and any non-local environment), credentials are supplied via the `GOOGLE_APPLICATION_CREDENTIALS_JSON` env var (full service account JSON content). The agent's `__init__.py` detects this var at import time, writes it to a temp file, and sets `GOOGLE_APPLICATION_CREDENTIALS` before any `google.auth` calls. Local ADC (`gcloud auth application-default login`) continues to work when the env var is absent.

The service account needs: **BigQuery User** + **BigQuery Data Viewer** roles. The queried dataset (`bigquery-public-data.google_trends.*`) is public; only job execution requires a billing-enabled project (`GOOGLE_CLOUD_PROJECT`).

---

## File layout

```
agents/trends/
  src/
    trends_agent/
      __init__.py                          ← credential bootstrap
      agent.py                             ← SequentialAgent + TrendsState
      main.py                              ← register() for gateway
      prompt.py                            ← Jinja2 template loader
      tools.py                             ← execute_bigquery_sql, write_trends_result
      prompt-template/
        google_trends_table_structure.j2   ← copied from ADK sample
        google_trends_few_shots.j2         ← copied from ADK sample
```

---

## State schema

```python
class TrendsState(BaseModel):
    query: str = ""
    generated_sql: str = ""
    result: str = ""      # markdown artifact rendered in the artifact panel
    status: str = "idle"
    user_id: str = ""
```

---

## Tools

| Tool                                 | Description                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `execute_bigquery_sql(sql)`          | Runs a BigQuery query via `google.cloud.bigquery.Client`; returns JSON string of rows    |
| `write_trends_result(sql, insights)` | Formats SQL + insights as markdown, writes to `state["result"]`, sets `status = "ready"` |

`write_trends_result` is the bridge between the SequentialAgent pattern (which produces chat output) and the repo's state-first UI pattern (which reads from `state["result"]` for the artifact panel).

---

## Root `pyproject.toml` changes

Add to dependencies (only if not already present):

- `google-cloud-bigquery>=3.35.0,<4.0.0`
- `jinja2>=3.1.6,<4.0.0`

Add `trends_agent` to `[tool.hatch.build.targets.wheel].packages`.

---

## Gateway changes

`agents/gateway/src/gateway/main.py`:

- Import `register as register_trends` from `trends_agent.main`
- Add `register_trends` to the `register_agents` loop

---

## Types (`packages/types/src/index.ts`)

- Append `"trends"` to `AGENT_ORDER`
- Add `"trends": "trends"` to `AGENT_BACKEND_PATHS`
- Add `TrendsState` type export

---

## Web UI changes

### Design tokens (`packages/ui/src/styles/globals.css`)

```css
/* light */
--trends: #1a5fcb;
--trends-soft: #dce8f9;
--trends-contrast: #ffffff;

/* dark */
--trends: #7eb8f7;
--trends-soft: #0f2a4d;
--trends-contrast: #040f1f;
```

### `apps/web/src/components/agent-theme.ts`

Add `"trends"` to the `AgentTheme` union and `AGENT_THEMES` record.

### `apps/web/src/components/chat/agents/registry.ts`

```ts
trends: {
  id: "trends",
  label: "Trends",
  glyph: "📈",
  colorVar: "--trends",
  placeholder: "What's trending on Google right now?",
  welcome: "Ask me about Google search trends — top terms, rising topics, or regional breakdowns.",
  artifact: {
    stateField: "result",
    kind: "markdown",
    title: "Trends report",
    name: "trends_report.md",
  },
  suggestions: [
    { title: "Top searches today", message: "What are the top Google searches in the US today?" },
    { title: "Rising terms", message: "What search terms are rising fastest right now?" },
    { title: "AI trends", message: "What AI-related terms are trending this week?" },
    { title: "Region breakdown", message: "Which search terms are trending in California?" },
  ],
}
```

### Console routes

Two files following the `research` pattern:

- `apps/web/src/app/console/trends/page.tsx` — redirects to a new UUID thread
- `apps/web/src/app/console/trends/[thread]/page.tsx` — renders `<AgentWorkspace agentId="trends" threadId={thread} />`

### Homepage (`apps/web/src/app/page.tsx`)

Add a card for the Trends agent to the `AGENTS` array.

---

## Environment variables (Railway)

| Variable                              | Required | Description                                           |
| ------------------------------------- | -------- | ----------------------------------------------------- |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Yes      | Full service account JSON content                     |
| `GOOGLE_CLOUD_PROJECT`                | Yes      | GCP project ID (needs BigQuery API + billing enabled) |

---

## Out of scope

- Custom trends visualization (charts, tables) — the markdown artifact with SQL + insights is sufficient for v1
- Mobile (`apps/mobile`) screen — not added in this iteration
- Agent-specific health check beyond the default DB probe
