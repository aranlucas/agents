# Google Trends Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Google Trends ADK sample agent into the monorepo and wire it into the multi-agent console with a markdown artifact panel.

**Architecture:** A `SequentialAgent` wraps two `LlmAgent` sub-agents — the first generates BigQuery SQL from natural language (using Jinja2-templated prompts), the second executes the SQL against `bigquery-public-data.google_trends.*` and writes a formatted markdown result to shared state. The web UI reuses the standard `AgentWorkspace` with a markdown artifact panel.

**Tech Stack:** Python (google-adk, google-cloud-bigquery, jinja2, pydantic), TypeScript (Next.js, CopilotKit AG-UI), pytest, uv

## Global Constraints

- Python ≥ 3.14 (repo requires-python)
- google-adk[mcp] ≥ 2.2.0
- google-cloud-bigquery ≥ 3.35.0, < 4.0.0
- jinja2 ≥ 3.1.6, < 4.0.0
- All agents use `build_model()` from `agents_shared.tools` — never hardcode a model string
- Agent output must go to state via tools, never pasted into chat
- Tests live in `agents/trends/tests/`, run with `uv run pytest agents/trends/`
- TypeScript: `AgentId` is a `const` tuple — always append, never insert mid-array
- All new CSS color vars go in both `:root` (light) and `.dark` (dark) blocks in `packages/ui/src/styles/globals.css`

---

### Task 1: Prompt templates and tools

**Files:**

- Create: `agents/trends/src/trends_agent/prompt-template/google_trends_table_structure.j2`
- Create: `agents/trends/src/trends_agent/prompt-template/google_trends_few_shots.j2`
- Create: `agents/trends/src/trends_agent/tools.py`
- Create: `agents/trends/tests/__init__.py`
- Create: `agents/trends/tests/test_trends_tools.py`

**Interfaces:**

- Produces:
  - `clean_sql_query(text: str) -> str`
  - `execute_bigquery_sql(sql: str) -> str` (BigQuery tool — used by executor agent)
  - `write_trends_result(tool_context: ToolContext, sql: str, insights: str) -> dict`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p agents/trends/src/trends_agent/prompt-template
mkdir -p agents/trends/tests
touch agents/trends/tests/__init__.py
```

- [ ] **Step 2: Write `google_trends_table_structure.j2`**

Create `agents/trends/src/trends_agent/prompt-template/google_trends_table_structure.j2` with this exact content:

```
You are an expert BigQuery SQL developer. Your task is to write high-quality, efficient BigQuery SQL queries against Google Trends public datasets based on user questions in natural language.

You must follow all the rules and use the context provided below to construct your answer.

Always put LIMIT 100 at the end of your queries to avoid excessive data processing costs.

### **1. Table Schemas and Purpose**

You will query one of the following tables. Choose the correct table based on the user's question and the country of interest.

**A. Top Terms Tables**
*   **Purpose:** Contains the most popular search terms overall (top 25). Use this for questions about "top," "most popular," or "most searched" terms.
*   **Table Name Logic:**
    *   For the **United States (USA)**, use `bigquery-public-data.google_trends.top_terms`.
    *   For **any other country**, use `bigquery-public-data.google_trends.international_top_terms`.
*   **Schema:** The schemas are nearly identical. The `international_top_terms` table includes country and region fields, which are absent in the US-specific `top_terms` table.
    *   `term`: STRING (The search term)
    *   `rank`: INTEGER (The popularity rank, 1-25)
    *   `score`: INTEGER (Relative search interest for that term over time, 0-100)
    *   `week`: DATE (The first day of the week for the data)
    *   `refresh_date`: DATE (The date the data was loaded; **this is the partition key**)
    *   `country_name`: STRING (e.g., "Turkey") - **Only in `international_top_terms`**
    *   `country_code`: STRING (e.g., "TR") - **Only in `international_top_terms`**
    *   `region_name`: STRING (e.g., "Adana") - **Only in `international_top_terms`**
    *   `region_code`: STRING (e.g., "TR-01") - **Only in `international_top_terms`**

**B. Top Rising Terms Tables**
*   **Purpose:** Contains terms with the biggest *increase* in search interest ("breakout" terms). Use this for questions about "rising," "trending up," "gaining popularity," or "breakout" terms.
*   **Table Name Logic:**
    *   For the **United States (USA)**, use `bigquery-public-data.google_trends.top_rising_terms`.
    *   For **any other country**, use `bigquery-public-data.google_trends.international_top_rising_terms`.
*   **Schema:** The schemas are nearly identical. The `international_top_rising_terms` table includes country and region fields, which are absent in the US-specific `top_rising_terms` table.
    *   `term`: STRING (The search term)
    *   `percent_gain`: INTEGER (The percentage increase in search volume)
    *   `rank`: INTEGER (The rank of the rising term, 1-25)
    *   `score`: INTEGER (Relative search interest for that term over time, 0-100)
    *   `week`: DATE (The first day of the week for the data)
    *   `refresh_date`: DATE (The date the data was loaded; **this is the partition key**)
    *   `country_name`: STRING (e.g., "Turkey") - **Only in `international_top_rising_terms`**
    *   `country_code`: STRING (e.g., "TR") - **Only in `international_top_rising_terms`**
    *   `region_name`: STRING (e.g., "Adana") - **Only in `international_top_rising_terms`**
    *   `region_code`: STRING (e.g., "TR-01") - **Only in `international_top_rising_terms`**

### 2. Rules and Best Practices (MANDATORY)

1.  **ALWAYS Filter by `refresh_date` for the Latest Data:** This is the most important rule. To query the most recent data and avoid costly full table scans, your query **MUST** include a `WHERE` clause that filters `refresh_date` to the previous day.
    *   **Correct Pattern:** `WHERE refresh_date = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)`

2.  **Table Selection Logic:**
    *   If the user asks for "top terms," "most popular," or "highest rank," use the appropriate Top Terms table based on the country.
    *   If the user asks for "rising terms," "breakout terms," "trending up," or "percent gain," use the appropriate Top Rising Terms table based on the country.
    *   **Crucially:** For the **USA**, use the `top_terms` or `top_rising_terms` tables. For **all other countries**, use the `international_top_terms` or `international_top_rising_terms` tables and add a `WHERE` clause to filter by `country_name`.

3.  **Handling Complex "Top N per Group" Questions:** For questions that ask for something like "the region with the highest score for each term," use the `ARRAY_AGG` analytic function to find the top result within a group.
    *   **Pattern:** `ARRAY_AGG(STRUCT(field1, field2) ORDER BY metric_to_sort_by DESC LIMIT 1)`

4.  **Use of `LIMIT`:** Always end your queries with `LIMIT 100` to prevent excessive data processing costs.

5. **Don't add comments in the generated SQL code.** The comments in the examples are for your understanding only and should not be included in the final SQL.
```

- [ ] **Step 3: Write `google_trends_few_shots.j2`**

Create `agents/trends/src/trends_agent/prompt-template/google_trends_few_shots.j2` with this exact content:

```
Few-Shot Examples

To guide your response, you will be provided with a set of few-shot examples in a separate file. Study these examples to understand the expected format and logic for translating questions into BigQuery SQL queries. The examples will illustrate how to handle various types of user questions, including those that require filtering by date, country, and specific metrics.

### Example 1: Top terms in the USA
*   **User Question:** "What are the top 10 search terms in the United States for the most recent week available?"
*   **Correct SQL:**

    SELECT
      term,
      ARRAY_AGG(STRUCT(rank, week) ORDER BY week DESC LIMIT 1) AS latest_week_data
    FROM
      `bigquery-public-data.google_trends.top_terms`
    WHERE
      refresh_date = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
    GROUP BY
      term
    ORDER BY
      (SELECT rank FROM UNNEST(latest_week_data))
    LIMIT 10;


### Example 2: Rising terms from a past date
*   **User Question:** "For the latest set of rising terms in Canada, find out which region had the highest score for each term exactly 52 weeks prior."
*   **Correct SQL:**

    SELECT
      term,
      week,
      ARRAY_AGG(STRUCT(region_name, score) ORDER BY score DESC LIMIT 1) AS top_region
    FROM
      `bigquery-public-data.google_trends.international_top_rising_terms`
    WHERE
      week = (
        SELECT DATE_SUB(MAX(week), INTERVAL 52 WEEK)
        FROM `bigquery-public-data.google_trends.international_top_rising_terms`
        WHERE refresh_date = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
      )
      AND refresh_date = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
      AND country_name = 'Canada'
    GROUP BY
      term, week
    ORDER BY
      (SELECT score FROM UNNEST(top_region)) DESC;


### Example 3: Filter by specific rank
*   **User Question:** "I need a template to find only the #1 top ranked term in Germany."

    SELECT
      term,
      week,
      rank
    FROM
      `bigquery-public-data.google_trends.international_top_terms`
    WHERE
      refresh_date = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
      AND country_name = 'Germany'
      AND rank = 1
    ORDER BY
      week DESC;


### Example 4: Filter by high percent gain
*   **User Question:** "Give me a template for all rising terms in Australia that had a breakout gain of more than 1000 percent."
*   **Correct SQL:**

    SELECT
      term,
      percent_gain,
      week
    FROM
      `bigquery-public-data.google_trends.international_top_rising_terms`
    WHERE
      refresh_date = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
      AND country_name = 'Australia'
      AND percent_gain > 1000
    ORDER BY
      percent_gain DESC;


### Example 5: Region-specific rising terms
*   **User Question:** "What were the top 5 rising terms just for the 'Ile-de-France' region in France? Create a template for this."

    SELECT
      term,
      rank,
      percent_gain
    FROM
      `bigquery-public-data.google_trends.international_top_rising_terms`
    WHERE
      refresh_date = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
      AND country_name = 'France'
      AND region_name = 'Ile-de-France'
    ORDER BY
      rank
    LIMIT 5;


### Example 6: Time-based query with a date range
*   **User Question:** "Generate a template to find all rising terms in Brazil that appeared in the first quarter of 2023."

    SELECT
      DISTINCT term,
      week,
      rank
    FROM
      `bigquery-public-data.google_trends.international_top_rising_terms`
    WHERE
      refresh_date = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
      AND country_name = 'Brazil'
      AND week BETWEEN '2023-01-01' AND '2023-03-31'
    ORDER BY
      week, rank;


### Example 7: Advanced query using a subquery filter
*   **User Question:** "For the top 5 overall most popular terms in Japan, I want a template to see their rising term data (percent gain and rank)."

    SELECT
      term,
      percent_gain,
      rank,
      score,
      week
    FROM
      `bigquery-public-data.google_trends.international_top_rising_terms`
    WHERE
      refresh_date = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
      AND country_name = 'Japan'
      AND term IN (
        SELECT
          term
        FROM
          `bigquery-public-data.google_trends.international_top_terms`
        WHERE
          refresh_date = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
          AND country_name = 'Japan'
          AND rank <= 5
      )
    ORDER BY
      term, week;

### Example 8: Rising terms in the USA
*   **User Question:** "Show me rising terms in the USA with a percent gain over 5000."
*   **Correct SQL:**

    SELECT
      term,
      percent_gain,
      week
    FROM
      `bigquery-public-data.google_trends.top_rising_terms`
    WHERE
      refresh_date = DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
      AND percent_gain > 5000
    ORDER BY
      percent_gain DESC
```

- [ ] **Step 4: Write failing tests**

Create `agents/trends/tests/test_trends_tools.py`:

````python
from types import SimpleNamespace

from trends_agent.tools import clean_sql_query, write_trends_result


def test_clean_sql_query_strips_newlines_and_fences() -> None:
    assert clean_sql_query("SELECT *\nFROM foo\\n") == "SELECT * FROM foo"
    assert clean_sql_query("```sql\nSELECT 1\n```") == "SELECT 1"
    assert clean_sql_query("  SELECT 1  ") == "SELECT 1"


def test_clean_sql_query_removes_backslashes() -> None:
    assert clean_sql_query("SELECT\\n*\\nFROM foo") == "SELECT* FROM foo"


def test_write_trends_result_writes_markdown_to_state() -> None:
    ctx = SimpleNamespace(state={})
    result = write_trends_result(ctx, "SELECT * FROM foo LIMIT 10", "Top term: python")
    assert result == {"ok": True}
    assert "```sql" in ctx.state["result"]
    assert "SELECT * FROM foo LIMIT 10" in ctx.state["result"]
    assert "Top term: python" in ctx.state["result"]
    assert ctx.state["status"] == "ready"


def test_write_trends_result_overwrites_previous_result() -> None:
    ctx = SimpleNamespace(state={"result": "old", "status": "idle"})
    write_trends_result(ctx, "SELECT 1", "new insights")
    assert "new insights" in ctx.state["result"]
    assert ctx.state["status"] == "ready"
````

- [ ] **Step 5: Run tests — expect ImportError (module doesn't exist yet)**

```bash
uv run pytest agents/trends/tests/test_trends_tools.py -v
```

Expected: `ModuleNotFoundError: No module named 'trends_agent'`

- [ ] **Step 6: Write `agents/trends/src/trends_agent/tools.py`**

````python
import json
import os

from google.adk.tools import ToolContext


def clean_sql_query(text: str) -> str:
    return (
        text.replace("\\n", " ")
        .replace("\n", " ")
        .replace("\\", "")
        .replace("```sql", "")
        .replace("```", "")
        .strip()
    )


def execute_bigquery_sql(sql: str) -> str:
    """Execute a BigQuery SQL query and return results as a JSON string."""
    from google.cloud import bigquery

    project = os.getenv("GOOGLE_CLOUD_PROJECT")
    cleaned = clean_sql_query(sql)
    try:
        client = bigquery.Client(project=project)
        results = [dict(row) for row in client.query(cleaned).result()]
        if not results:
            return "Query returned no results."
        return (
            json.dumps(results, default=str)
            .replace("```sql", "")
            .replace("```", "")
        )
    except Exception as e:  # noqa: BLE001
        return f"Error executing BigQuery query: {e!s}"


def write_trends_result(tool_context: ToolContext, sql: str, insights: str) -> dict:
    """Format SQL + insights as markdown and persist to shared state."""
    md = f"## SQL Query\n\n```sql\n{sql}\n```\n\n---\n\n## Insights\n\n{insights}"
    tool_context.state["result"] = md
    tool_context.state["status"] = "ready"
    return {"ok": True}
````

- [ ] **Step 7: Register `trends_agent` in `pyproject.toml` wheel packages so the import resolves**

Open `pyproject.toml`. In `[tool.hatch.build.targets.wheel]`, add `"agents/trends/src/trends_agent"` to the `packages` list. Also add to `dependencies`:

```toml
"google-cloud-bigquery>=3.35.0,<4.0.0",
"jinja2>=3.1.6,<4.0.0",
```

Run `uv sync` so the new package is importable:

```bash
uv sync
```

- [ ] **Step 8: Run tests — expect PASS**

```bash
uv run pytest agents/trends/tests/test_trends_tools.py -v
```

Expected output:

```
PASSED test_clean_sql_query_strips_newlines_and_fences
PASSED test_clean_sql_query_removes_backslashes
PASSED test_write_trends_result_writes_markdown_to_state
PASSED test_write_trends_result_overwrites_previous_result
4 passed
```

- [ ] **Step 9: Commit**

```bash
git add agents/trends/ pyproject.toml uv.lock
git commit -m "feat(trends): add Jinja2 templates and tools"
```

---

### Task 2: Credential bootstrap, prompt loader, agent, and main

**Files:**

- Create: `agents/trends/src/trends_agent/__init__.py`
- Create: `agents/trends/src/trends_agent/prompt.py`
- Create: `agents/trends/src/trends_agent/agent.py`
- Create: `agents/trends/src/trends_agent/main.py`
- Create: `agents/trends/tests/test_trends_agent.py`

**Interfaces:**

- Consumes: `write_trends_result`, `execute_bigquery_sql` from `trends_agent.tools`
- Produces:
  - `build_agent() -> SequentialAgent` (name=`"GoogleTrendsAgent"`, two sub-agents)
  - `register(app: FastAPI, services: AgentServices) -> None` (mounts at `/trends`)

- [ ] **Step 1: Write failing tests**

Create `agents/trends/tests/test_trends_agent.py`:

```python
from fastapi import FastAPI
from google.adk.agents import SequentialAgent

from agents_shared.dependencies import create_agent_services
from trends_agent import agent, main


def test_build_agent_returns_sequential_agent() -> None:
    a = agent.build_agent()
    assert isinstance(a, SequentialAgent)
    assert a.name == "GoogleTrendsAgent"
    assert len(a.sub_agents) == 2


def test_build_agent_sub_agent_names() -> None:
    a = agent.build_agent()
    names = [s.name for s in a.sub_agents]
    assert "TrendsQueryGeneratorAgent" in names
    assert "TrendsQueryExecutorAgent" in names


def test_build_agent_executor_has_bigquery_tool() -> None:
    a = agent.build_agent()
    executor = next(s for s in a.sub_agents if s.name == "TrendsQueryExecutorAgent")
    tool_names = [t.__name__ if callable(t) else str(t) for t in executor.tools]
    assert any("execute_bigquery_sql" in name for name in tool_names)


def _route_paths(app: FastAPI) -> set[str]:
    paths = set()
    for route in app.routes:
        if hasattr(route, "path"):
            paths.add(route.path)
        if hasattr(route, "original_router") and hasattr(route, "include_context"):
            prefix = getattr(route.include_context, "prefix", "") or ""
            for sub in route.original_router.routes:
                if hasattr(sub, "path"):
                    paths.add(prefix + sub.path)
    return paths


def test_register_exposes_health_and_agui_routes() -> None:
    app = FastAPI()
    main.register(app, create_agent_services())
    paths = _route_paths(app)
    assert "/trends/health" in paths
    assert any(p.startswith("/trends/agui") for p in paths)
```

- [ ] **Step 2: Run tests — expect ImportError**

```bash
uv run pytest agents/trends/tests/test_trends_agent.py -v
```

Expected: `ImportError` or `ModuleNotFoundError` (files don't exist yet)

- [ ] **Step 3: Write `agents/trends/src/trends_agent/__init__.py`**

```python
import json
import os
import tempfile


def _bootstrap_gcp_credentials() -> None:
    creds_json = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    if not creds_json:
        return
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".json", mode="w")
    tmp.write(creds_json)
    tmp.flush()
    tmp.close()
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = tmp.name
    project = json.loads(creds_json).get("project_id", "")
    os.environ.setdefault("GOOGLE_CLOUD_PROJECT", project)


_bootstrap_gcp_credentials()
```

- [ ] **Step 4: Write `agents/trends/src/trends_agent/prompt.py`**

```python
import os

from jinja2 import Environment, FileSystemLoader


def load_agent_instructions() -> str:
    template_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "prompt-template")
    env = Environment(loader=FileSystemLoader(template_dir))
    try:
        table_structure = env.get_template("google_trends_table_structure.j2").render()
        few_shots = env.get_template("google_trends_few_shots.j2").render()
        return f"{table_structure}\n\n{few_shots}"
    except Exception as e:  # noqa: BLE001
        return f"You are an agent that can query Google Trends data. Error loading prompts: {e}"
```

- [ ] **Step 5: Write `agents/trends/src/trends_agent/agent.py`**

```python
from agents_shared.state import make_state_initializer
from agents_shared.tools import DEFAULT_RETRY_CONFIG, build_model, on_model_error_callback
from google.adk.agents import LlmAgent, SequentialAgent
from pydantic import BaseModel

from .prompt import load_agent_instructions
from .tools import execute_bigquery_sql, write_trends_result


class TrendsState(BaseModel):
    query: str = ""
    generated_sql: str = ""
    result: str = ""
    status: str = "idle"
    user_id: str = ""


_GENERATOR_INSTRUCTION = load_agent_instructions()

_EXECUTOR_INSTRUCTION = """\
You are a SQL execution agent. The BigQuery SQL query to run is:

{generated_sql}

Steps:
1. Call execute_bigquery_sql with that exact SQL string.
2. Read the JSON results returned.
3. Call write_trends_result with the SQL string and a concise markdown summary of the findings — highlight the top terms, notable patterns, and any surprises.

Never paste raw JSON into chat. Never modify the SQL. Write your insights in plain English.
"""


def build_agent() -> SequentialAgent:
    generator = LlmAgent(
        name="TrendsQueryGeneratorAgent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        static_instruction=_GENERATOR_INSTRUCTION,
        description="Generates a BigQuery SQL query from the user's question about Google Trends.",
        output_key="generated_sql",
    )

    executor = LlmAgent(
        name="TrendsQueryExecutorAgent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        on_model_error_callback=on_model_error_callback,
        instruction=_EXECUTOR_INSTRUCTION,
        description="Executes the generated SQL and writes a formatted markdown result to state.",
        tools=[execute_bigquery_sql, write_trends_result],
    )

    return SequentialAgent(
        name="GoogleTrendsAgent",
        sub_agents=[generator, executor],
        before_agent_callback=make_state_initializer(TrendsState),
        description="Translates Google Trends questions into BigQuery SQL, executes them, and streams results.",
    )
```

- [ ] **Step 6: Write `agents/trends/src/trends_agent/main.py`**

```python
"""Google Trends agent wiring."""

from agents_shared.app_factory import add_agent_routes, build_adk_agent
from agents_shared.dependencies import AgentServices
from agents_shared.state import make_extract_state
from dotenv import load_dotenv
from fastapi import FastAPI

from .agent import build_agent

load_dotenv()

_trends_agent = build_agent()


def register(app: FastAPI, services: AgentServices) -> None:
    add_agent_routes(
        app,
        prefix="/trends",
        adk_agent=build_adk_agent(
            _trends_agent,  # type: ignore[arg-type]
            services=services,
        ),
        services=services,
        extract_state_from_request=make_extract_state(),
    )
```

- [ ] **Step 7: Run tests — expect PASS**

```bash
uv run pytest agents/trends/tests/ -v
```

Expected:

```
PASSED test_clean_sql_query_strips_newlines_and_fences
PASSED test_clean_sql_query_removes_backslashes
PASSED test_write_trends_result_writes_markdown_to_state
PASSED test_write_trends_result_overwrites_previous_result
PASSED test_build_agent_returns_sequential_agent
PASSED test_build_agent_sub_agent_names
PASSED test_build_agent_executor_has_bigquery_tool
PASSED test_register_exposes_health_and_agui_routes
8 passed
```

- [ ] **Step 8: Commit**

```bash
git add agents/trends/src/trends_agent/
git commit -m "feat(trends): add credential bootstrap, prompt loader, agent, and main"
```

---

### Task 3: Gateway registration

**Files:**

- Modify: `agents/gateway/src/gateway/main.py`

**Interfaces:**

- Consumes: `register(app, services)` from `trends_agent.main`

- [ ] **Step 1: Add import to gateway**

Open `agents/gateway/src/gateway/main.py`. Add this import alongside the other agent imports (alphabetical by module name):

```python
from trends_agent.main import register as register_trends
```

- [ ] **Step 2: Add to `register_agents` loop**

In the `register_agents` function, add `register_trends` to the tuple of register functions, after `register_travel`:

```python
for register_agent in (
    register_travel,
    register_trends,   # add this line
    register_grocery,
    ...
):
```

- [ ] **Step 3: Verify gateway starts without error**

```bash
uv run python -c "from gateway.main import app; print('gateway OK')"
```

Expected: `gateway OK`

- [ ] **Step 4: Run full agent test suite**

```bash
uv run pytest agents/trends/ -v
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add agents/gateway/src/gateway/main.py
git commit -m "feat(trends): register trends agent in gateway"
```

---

### Task 4: TypeScript types

**Files:**

- Modify: `packages/types/src/index.ts`

**Interfaces:**

- Produces:
  - `"trends"` added to `AGENT_ORDER` (position: after `"presentation"`)
  - `"trends": "trends"` added to `AGENT_BACKEND_PATHS`
  - `TrendsState` type export

- [ ] **Step 1: Add `"trends"` to `AGENT_ORDER`**

In `packages/types/src/index.ts`, find `AGENT_ORDER` and append `"trends"`:

```typescript
export const AGENT_ORDER = [
  "travel",
  "grocery",
  "fitness",
  "wellness",
  "expense",
  "oral-boards",
  "oral-boards-v2",
  "a2ui",
  "resume",
  "research",
  "spreadsheet",
  "presentation",
  "trends",
] as const;
```

- [ ] **Step 2: Add `"trends"` to `AGENT_BACKEND_PATHS`**

```typescript
export const AGENT_BACKEND_PATHS = {
  travel: "travel",
  grocery: "grocery",
  fitness: "fitness",
  wellness: "wellness",
  expense: "expense",
  "oral-boards": "oralboards",
  "oral-boards-v2": "oralboards-v2",
  a2ui: "a2ui",
  resume: "resume",
  research: "research",
  spreadsheet: "spreadsheet",
  presentation: "presentation",
  trends: "trends",
} as const satisfies Record<AgentId, string>;
```

- [ ] **Step 3: Add `TrendsState` type**

Append after the `PresentationState` type block:

```typescript
// Trends agent state — matches what agents/trends writes to ADK shared state
export type TrendsStatus = "idle" | "ready";

export type TrendsState = {
  query?: string;
  generated_sql?: string;
  result?: string;
  status?: TrendsStatus;
  user_id?: string;
};
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm --filter @agents/types build 2>/dev/null || pnpm check
```

Expected: no type errors related to the new types.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(trends): add TrendsState type and AgentId"
```

---

### Task 5: Design tokens and agent theme

**Files:**

- Modify: `packages/ui/src/styles/globals.css`
- Modify: `apps/web/src/components/agent-theme.ts`

**Interfaces:**

- Produces: `--trends`, `--trends-soft`, `--trends-contrast` CSS vars; `"trends"` in `AgentTheme`

- [ ] **Step 1: Add light-mode color tokens**

Open `packages/ui/src/styles/globals.css`. Find the `:root` block that contains the other agent colors (e.g., `--travel`, `--research`). Add after the `--presentation` group:

```css
--trends: #1a5fcb;
--trends-soft: #dce8f9;
--trends-contrast: #ffffff;
```

- [ ] **Step 2: Add dark-mode color tokens**

Find the `.dark` block (contains `--travel: #ffb06b` etc.). Add after the `--presentation` dark group:

```css
--trends: #7eb8f7;
--trends-soft: #0f2a4d;
--trends-contrast: #040f1f;
```

There is also a `@media (prefers-color-scheme: dark)` block — add the same dark values there too.

- [ ] **Step 3: Add `"trends"` to `agent-theme.ts`**

Open `apps/web/src/components/agent-theme.ts`.

Add `"trends"` to the `AgentTheme` union:

```typescript
export type AgentTheme =
  | "travel"
  | "grocery"
  | "fitness"
  | "wellness"
  | "expense"
  | "oral-boards"
  | "oral-boards-v2"
  | "a2ui"
  | "resume"
  | "research"
  | "spreadsheet"
  | "presentation"
  | "trends";
```

Add to `AGENT_THEMES`:

```typescript
  trends: {
    label: "Trends",
    colorVar: "var(--trends)",
    softVar: "var(--trends-soft)",
    contrastVar: "var(--trends-contrast)",
  },
```

- [ ] **Step 4: Verify no TypeScript errors**

```bash
pnpm check
```

Expected: passes (or only pre-existing warnings).

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/styles/globals.css apps/web/src/components/agent-theme.ts
git commit -m "feat(trends): add trends design tokens and agent theme"
```

---

### Task 6: Web registry, console routes, and homepage card

**Files:**

- Modify: `apps/web/src/components/chat/agents/registry.ts`
- Create: `apps/web/src/app/console/trends/page.tsx`
- Create: `apps/web/src/app/console/trends/[thread]/page.tsx`
- Modify: `apps/web/src/app/page.tsx`

**Interfaces:**

- Consumes: `"trends"` from `AgentId` (Task 4); `"trends"` from `AgentTheme` (Task 5)

- [ ] **Step 1: Add `trends` to `registry.ts`**

Open `apps/web/src/components/chat/agents/registry.ts`. Add to the `AGENTS` record after `presentation`:

```typescript
  trends: {
    id: "trends",
    label: "Trends",
    glyph: "📈",
    colorVar: "--trends",
    placeholder: "What's trending on Google right now?",
    welcome:
      "Ask me about Google search trends — top terms, rising topics, or regional breakdowns.",
    artifact: {
      stateField: "result",
      kind: "markdown",
      title: "Trends report",
      name: "trends_report.md",
    },
    suggestions: [
      {
        title: "Top searches today",
        message: "What are the top Google searches in the US today?",
      },
      {
        title: "Rising terms",
        message: "What search terms are rising fastest right now?",
      },
      {
        title: "AI trends",
        message: "What AI-related terms are trending this week?",
      },
      {
        title: "Region breakdown",
        message: "Which search terms are trending in California?",
      },
    ],
  },
```

- [ ] **Step 2: Create console index route**

Create `apps/web/src/app/console/trends/page.tsx`:

```typescript
import { redirect } from "next/navigation";

export default function Page() {
  redirect(`/console/trends/${crypto.randomUUID()}`);
}
```

- [ ] **Step 3: Create console thread route**

Create `apps/web/src/app/console/trends/[thread]/page.tsx`:

```typescript
"use client";

import { use } from "react";

import { AgentWorkspace } from "@/components/chat/agent-workspace";

export default function Page({ params }: { params: Promise<{ thread: string }> }) {
  const { thread } = use(params);
  return <AgentWorkspace key={`trends:${thread}`} agentId="trends" threadId={thread} />;
}
```

- [ ] **Step 4: Add homepage card**

Open `apps/web/src/app/page.tsx`. In the `AGENTS` array, add after the `presentation` entry (id `"11"`):

```typescript
  {
    id: "12",
    href: "/console/trends",
    name: "Google Trends",
    tagline: "Live search trend analysis",
    description:
      "Ask questions in natural language — the agent writes BigQuery SQL against the Google Trends public dataset and streams a formatted report.",
    cta: "Explore trends",
    tags: ["BigQuery", "Trends", "Live data"],
    theme: "trends",
  },
```

- [ ] **Step 5: Run quality checks**

```bash
pnpm check
```

Expected: passes. Fix any lint errors before committing.

- [ ] **Step 6: Verify registry test still passes**

```bash
pnpm --filter @agents/web test 2>/dev/null || pnpm test
```

Expected: all existing tests pass (the registry test validates structure, not count).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/chat/agents/registry.ts \
        apps/web/src/app/console/trends/ \
        apps/web/src/app/page.tsx
git commit -m "feat(trends): add web registry, console routes, and homepage card"
```

---

## Self-Review

**Spec coverage:**

- ✅ `agents/trends/` directory with all required files
- ✅ GCP credential bootstrap from `GOOGLE_APPLICATION_CREDENTIALS_JSON`
- ✅ SequentialAgent with two LlmAgents using `build_model()`
- ✅ Jinja2 templates copied from ADK sample verbatim
- ✅ `write_trends_result` tool bridges agent output → state artifact
- ✅ `google-cloud-bigquery` + `jinja2` added to root `pyproject.toml`
- ✅ `trends_agent` registered in wheel packages
- ✅ Gateway import and registration
- ✅ `TrendsState` type + `"trends"` in `AGENT_ORDER` + `AGENT_BACKEND_PATHS`
- ✅ CSS color tokens in both light and dark blocks
- ✅ `"trends"` in `AgentTheme` and `AGENT_THEMES`
- ✅ Registry entry with suggestions and markdown artifact
- ✅ Console routes (index + `[thread]`)
- ✅ Homepage card

**Type consistency:**

- `write_trends_result(tool_context, sql, insights)` — same signature in tools.py, tests, and executor instruction
- `build_agent() -> SequentialAgent` — same in agent.py and tests
- `TrendsState.result` (str) matches `artifact.stateField: "result"` in registry
- `TrendsState.status` values `"idle"` / `"ready"` match `TrendsStatus` type

**No placeholders:** All steps contain complete code. No TBDs.
