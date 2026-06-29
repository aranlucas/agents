import asyncio
import logging
import time
from pathlib import Path

from ag_ui_adk import get_a2ui_tool
from agents_shared.state import make_state_initializer
from agents_shared.tools import (
    DEFAULT_RETRY_CONFIG,
    GEMINI_RETRY_OPTIONS,
    on_model_error_callback,
    stop_on_terminal_text,
    strip_thinking_before_model,
)
from google.adk.agents import LlmAgent
from google.adk.models.google_llm import Gemini
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools.agent_tool import AgentTool
from pydantic import BaseModel, Field

from .subagents import build_generator
from .tools import (
    begin_trends_query,
    execute_bigquery_sql,
    set_trends_verification,
    validate_trends_sql,
    web_search_toolset,
    write_trends_result,
)

log = logging.getLogger("trends_agent")

TRENDS_CATALOG_ID = "copilotkit://trends/v1"

TRENDS_A2UI_COMPOSITION_GUIDE = """\
## Trends Catalog — Component Reference

Use ONLY the Trends catalog components below. Every value must come from \
executed query rows, generated SQL, or saved insights.

TrendBarChart  { title, categoryKey, valueKey, rows, maxItems?, valueFormat? }
  categoryKey  column name for labels         e.g. "term"
  valueKey     numeric column name            e.g. "percent_gain", "rank", "score"
  rows         top 10 rows as an inline array — object array, not a path binding
  Omit if no numeric column exists in the result.

TrendLineChart  { title, xKey, yKey, rows, valueFormat? }
  Include only when rows contain a date or week column alongside a numeric value.

TrendMetric  { label, value, detail? }
  One card per KPI (peak term, total rows, date range).

TrendTable  { columns, rows, maxRows }
  columns  [{ key, label, format }]  one entry per result column
  rows     top 10 rows as an inline array
  maxRows  10

SqlDisclosure  { title, sql }
  Always include. title = "Generated SQL", sql = the exact executed query.

CRITICAL: pass rows as an inline array directly on the component. \
Do NOT put rows only in the data field — the catalog components read from \
their own props, not path bindings.
"""

INSTRUCTION = (Path(__file__).parent / "instructions.md").read_text(encoding="utf-8")


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
web_search_lock = asyncio.Lock()
web_search_state: dict[str, float] = {"last_at": 0.0}


async def throttle_web_search(tool, args, tool_context) -> None:
    """Space out Brave web-search calls to respect the free-tier rate limit."""
    if not str(getattr(tool, "name", "")).startswith("brave_"):
        return
    async with web_search_lock:
        elapsed = time.monotonic() - web_search_state["last_at"]
        if elapsed < _WEB_SEARCH_MIN_INTERVAL_S:
            wait = _WEB_SEARCH_MIN_INTERVAL_S - elapsed
            log.debug("throttle_web_search: sleeping %.2fs before %s", wait, tool.name)
            await asyncio.sleep(wait)
        web_search_state["last_at"] = time.monotonic()
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
            "model": Gemini(
                model="gemini-2.5-flash",
                retry_options=GEMINI_RETRY_OPTIONS,
            ),
            "guidelines": {"composition_guide": TRENDS_A2UI_COMPOSITION_GUIDE},
            "default_surface_id": "trends-result",
            "default_catalog_id": TRENDS_CATALOG_ID,
        }
    )

    return LlmAgent(
        name="GoogleTrendsAgent",
        model=LiteLlm(model="groq/llama-3.3-70b-versatile"),
        retry_config=DEFAULT_RETRY_CONFIG,
        before_model_callback=strip_thinking_before_model,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        instruction=INSTRUCTION,
        description="Google Trends BigQuery analysis and verification.",
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


def build_eval_agent() -> LlmAgent:
    """Eval-compatible agent: no A2UI tool and no Brave MCP search toolset."""
    state_init = make_state_initializer(TrendsState)

    return LlmAgent(
        name="GoogleTrendsAgent",
        model=LiteLlm(model="mistral/mistral-small-latest"),
        retry_config=DEFAULT_RETRY_CONFIG,
        before_model_callback=strip_thinking_before_model,
        on_model_error_callback=on_model_error_callback,
        after_model_callback=stop_on_terminal_text,
        instruction=INSTRUCTION,
        description="Google Trends BigQuery analysis and verification.",
        before_agent_callback=state_init,
        tools=[
            AgentTool(build_generator(model="mistral/mistral-small-latest")),
            validate_trends_sql,
            begin_trends_query,
            execute_bigquery_sql,
            write_trends_result,
            set_trends_verification,
        ],
    )


root_agent = build_eval_agent()
