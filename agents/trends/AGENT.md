# Google Trends Agent

Generates BigQuery SQL for the Google Trends public dataset, executes it, verifies findings against live web search, and renders structured A2UI surfaces in the CopilotKit chat.

## Architecture

```
GoogleTrendsAgent (LlmAgent, root)
├── tools/
│   ├── TrendsQueryGeneratorAgent  ← AgentTool wrapping sub_agents/generator.py
│   ├── validate_trends_sql
│   ├── begin_trends_query
│   ├── execute_bigquery_sql
│   ├── write_trends_result
│   ├── set_trends_verification
│   ├── generate_a2ui             ← A2UISubAgentTool (directly on root)
│   └── brave_web_search (toolset)
```

### Why the generator is an AgentTool

SQL generation is a focused subtask that benefits from a dedicated model call and its own instruction context (BigQuery table schema + few-shot examples). Keeping it separate prevents the executor instruction from growing unbounded and lets us swap or tune the generator independently.

`AgentTool` runs the generator in an isolated session and forwards any state deltas back to the parent. `output_key="generated_sql"` on the generator writes the SQL to session state, which the root agent reads as the tool return value.

### Why A2UI lives on the root agent

`ag_ui_adk` wires the `A2UISubAgentTool`'s per-run event queue in `_update_agent_tools_recursive`, which traverses via `agent.sub_agents`. Because `AgentTool` wraps the generator in an isolated sub-runner (not a `sub_agents` entry on the root), the A2UI tool must be in `root.tools` directly so the traversal finds it immediately — no deep recursion required.

Previous architecture used `Workflow` (SQL generator → executor). `Workflow.sub_agents` is `None`, so `_update_agent_tools_recursive` never reached the A2UI tool inside the executor, leaving `event_queue=None` and crashing on the first `generate_a2ui` call.

## Fallback chain

```
agents/shared/src/agents_shared/tools.py
```

Two model builders are exported:

| Function             | Use                    | Fallbacks                                                           |
| -------------------- | ---------------------- | ------------------------------------------------------------------- |
| `build_model()`      | Root agent + generator | Cerebras → Groq → Mistral → DeepSeek-NIM → openrouter/free → Gemini |
| `build_a2ui_model()` | A2UI subagent          | Cerebras → Groq → Mistral → Gemini                                  |

`build_a2ui_model()` excludes DeepSeek and `openrouter/free` because both may produce `thought=True` (reasoning) parts in their output. ADK's `LiteLlm` serialises those as `reasoning_content` inside the OpenAI-format message body. Cerebras, Groq, and Mistral reject such messages with HTTP 400 — not 422 — so LiteLLM's `drop_params=True` retry does not help. Gemini stays in the A2UI fallback chain because it can consume `reasoning_content` from its own prior turns.

## Sub-agents

```
sub_agents/
  __init__.py          re-exports build_generator
  generator.py         TrendsQueryGeneratorAgent — SQL generation only
```

The generator receives the user's analytical question as a tool `request` string and returns a bounded BigQuery SQL query. It has no access to execution or rendering tools.

## CopilotKit wiring

### Runtime (`apps/web/src/app/api/copilotkit/route.ts`)

```ts
const TRENDS_CATALOG_ID = "copilotkit://trends/v1";
const A2UI_RUNTIME_CONFIG = {
  agents: ["trends"],
  defaultCatalogId: TRENDS_CATALOG_ID,
};
```

Restricts A2UI middleware to the trends agent. The `/info` endpoint advertises A2UI only for this agent.

### Client (`apps/web/src/components/chat/agents/extensions.tsx`)

```ts
trends: {
  copilotKitProps: {
    a2ui: {
      catalog: trendsCatalog,
      includeSchema: true,
      recovery: { showAfterMs: 2000, showAfterAttempts: 2, debugExposure: "collapsed" },
    },
  },
}
```

`includeSchema: true` sends the full catalog JSON schema as a context entry so the A2UI subagent knows which components it may render.

### Catalog (`apps/web/src/components/chat/agents/trends/catalog.tsx`)

Five component types registered under `TRENDS_CATALOG_ID`:

| Component        | Purpose           |
| ---------------- | ----------------- |
| `TrendMetric`    | Single KPI value  |
| `TrendBarChart`  | Ranked categories |
| `TrendLineChart` | Time-series data  |
| `TrendTable`     | Raw result rows   |
| `SqlDisclosure`  | Collapsible SQL   |
