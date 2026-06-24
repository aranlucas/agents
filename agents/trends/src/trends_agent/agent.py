import asyncio
import logging
import time

from ag_ui_adk import get_a2ui_tool
from agents_shared.state import make_state_initializer
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    build_a2ui_model,
    build_model,
    on_model_error_callback,
    strip_thinking_before_model,
)
from google.adk.agents import LlmAgent
from google.adk.tools.agent_tool import AgentTool
from pydantic import BaseModel, Field

from .sub_agents import build_generator
from .tools import (
    begin_trends_query,
    execute_bigquery_sql,
    set_trends_verification,
    validate_trends_sql,
    write_trends_result,
)
from .toolsets import web_search_toolset

log = logging.getLogger("trends_agent")

TRENDS_CATALOG_ID = "copilotkit://trends/v1"

_TRENDS_A2UI_GUIDELINES = """\
Render a compact Google Trends analysis using the supplied catalog.

Component props (pass these fields directly on the component — never use a \
separate data model):
- TrendMetric: { label, value, detail? }
- TrendBarChart: { title, categoryKey, valueKey, rows, maxItems?, valueFormat? }
  categoryKey = column name for labels (e.g. "term")
  valueKey    = numeric column name (e.g. "percent_gain", "rank", "score")
  rows        = top 10 result rows (array of objects from the query)
  Use percent_gain, score, rank, or any numeric column as valueKey.
  Never leave the chart empty if rows contain any numeric column.
- TrendLineChart: { title, xKey, yKey, rows, valueFormat? }
  Only include when rows have a date/week column alongside a numeric value.
- TrendTable: { columns, rows, maxRows? }
  columns = [{ key, label, format }] derived from result column names
  rows    = top 10 result rows
  maxRows = 10
- SqlDisclosure: { title, sql }

Rules:
- Never invent values. Every displayed value must come from executed rows,
  generated SQL, or saved insights.
- Do not render empty axes — omit a chart component if it has no valid data.
- Use one stable surface id per result; update that surface only for
  presentation-only follow-ups.
"""

_INSTRUCTION = """\
You are a Google Trends execution, verification, and visualization agent.

Follow these steps in order:
1. Read the latest user message as the original analytical question.
2. Call TrendsQueryGeneratorAgent with the question to get bounded BigQuery SQL.
3. Call validate_trends_sql with the exact SQL returned by the generator.
4. If validation fails, call write_trends_result with the safe validation error.
   Do not call BigQuery or generate_a2ui.
5. Call begin_trends_query with that question and the validated SQL.
6. Call execute_bigquery_sql with that exact SQL. Never modify it.
7. If execution fails, call write_trends_result with the safe error, then call
   generate_a2ui only if it is available to render a concise error surface.
   Skip verification when there are no rows to check.
8. If execution succeeds, derive concise insights only from returned rows.
9. Call write_trends_result with the question, SQL, columns, rows, and insights.
10. Verify the findings against the live web (ONLY when rows are non-empty):
    - Identify the top 1-3 terms by score, rank, or percent_gain.
    - Use Brave Search to corroborate them with current news, launches, or
      seasonal context that explains their search interest. Make AT MOST 2 web
      searches — prefer one batched query covering several top terms at once.
      Do NOT search for terms whose meaning is obvious and unambiguous.
      If a search returns 429 / "too many requests" / an error, do NOT retry in
      a loop; proceed with what you already have and note the gap.
    - Call set_trends_verification with a concise note. For each top term state
      CONFIRMED (with the supporting web context), CONTRADICTED (with what
      suggests the BigQuery ranking is stale or misleading), or UNVERIFIED (no
      clear context found within the search budget). End with a one-line
      confidence statement (e.g. "High confidence — the top term tracks a
      confirmed product launch this week.").
    - Never edit the SQL, rows, or draft insights — only append the note.
11. Only after write_trends_result (and set_trends_verification when applicable)
    succeeds, call generate_a2ui with intent "create" and changes describing the
    saved analysis, including the verification outcome.
12. Keep chat text to one short completion or fallback sentence.

Never invent values. Never paste raw JSON into chat. Never expose provider
exceptions, credentials, or project details.
"""


class TrendsState(BaseModel):
    query: str = ""
    generated_sql: str = ""
    columns: list[str] = Field(default_factory=list)
    rows: list[dict] = Field(default_factory=list)
    insights: str = ""
    status: str = "idle"
    error: str = ""
    user_id: str = ""


# Brave's free search tier allows ~1 request/second and returns 429s when bursted,
# which is the most common failure mode for verification. Enforce a minimum spacing
# between web-search tool calls across the whole process as a hard floor; the
# instruction also caps the total number of searches per verification.
_WEB_SEARCH_MIN_INTERVAL_S = 1.2
_web_search_lock = asyncio.Lock()
_web_search_state: dict[str, float] = {"last_at": 0.0}


async def throttle_web_search(tool, args, tool_context) -> None:
    """Space out Brave web-search calls to respect the free-tier rate limit."""
    if not str(getattr(tool, "name", "")).startswith("brave_"):
        return
    async with _web_search_lock:
        elapsed = time.monotonic() - _web_search_state["last_at"]
        if elapsed < _WEB_SEARCH_MIN_INTERVAL_S:
            wait = _WEB_SEARCH_MIN_INTERVAL_S - elapsed
            log.debug("throttle_web_search: sleeping %.2fs before %s", wait, tool.name)
            await asyncio.sleep(wait)
        _web_search_state["last_at"] = time.monotonic()
    return


def build_agent() -> LlmAgent:
    state_init = make_state_initializer(TrendsState)

    # A2UI tool lives directly on the root agent — no sub-agent traversal
    # needed for ag_ui_adk's per-run event_queue wiring.
    trends_a2ui_tool = get_a2ui_tool(
        {
            # Restricted fallback chain: excludes DeepSeek and openrouter/free
            # because both may produce thought=True (reasoning) parts. ADK's
            # LiteLlm serialises those as reasoning_content in the OpenAI message
            # body, which Cerebras, Groq, and Mistral reject with 400.
            "model": build_a2ui_model(),
            "guidelines": {"generation_guidelines": _TRENDS_A2UI_GUIDELINES},
            "default_surface_id": "trends-result",
            "default_catalog_id": TRENDS_CATALOG_ID,
        }
    )

    return LlmAgent(
        name="GoogleTrendsAgent",
        model=build_model(),
        retry_config=DEFAULT_RETRY_CONFIG,
        before_model_callback=strip_thinking_before_model,
        on_model_error_callback=on_model_error_callback,
        instruction=_INSTRUCTION,
        description="Generates SQL, executes BigQuery, verifies findings against the web, and renders A2UI analysis.",
        before_tool_callback=throttle_web_search,
        before_agent_callback=state_init,
        tools=[
            AgentTool(build_generator()),
            validate_trends_sql,
            begin_trends_query,
            execute_bigquery_sql,
            write_trends_result,
            set_trends_verification,
            trends_a2ui_tool,
            web_search_toolset(),
        ],
    )
