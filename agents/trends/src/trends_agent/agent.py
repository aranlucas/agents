import logging
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
from google.adk.tools import FunctionTool
from google.adk.tools.agent_tool import AgentTool
from pydantic import BaseModel, Field

from ._credentials import bootstrap_gcp_credentials
from .subagents.generator import build_generator
from .tools.begin_trends_query import begin_trends_query
from .tools.execute_bigquery_sql import execute_bigquery_sql
from .tools.search import web_search_toolset
from .tools.set_trends_verification import set_trends_verification
from .tools.validate_trends_sql import validate_trends_sql
from .tools.write_trends_result import write_trends_result

bootstrap_gcp_credentials()

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
    columns: list[str] = Field(default_factory=list[str])
    rows: list[dict[str, object]] = Field(default_factory=list[dict[str, object]])
    insights: str = ""
    status: str = "idle"
    error: str = ""
    user_id: str = ""


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
        before_agent_callback=state_init,
        tools=[
            AgentTool(build_generator()),
            FunctionTool(validate_trends_sql),
            FunctionTool(begin_trends_query),
            FunctionTool(execute_bigquery_sql),
            FunctionTool(write_trends_result),
            FunctionTool(set_trends_verification),
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
            FunctionTool(validate_trends_sql),
            FunctionTool(begin_trends_query),
            FunctionTool(execute_bigquery_sql),
            FunctionTool(write_trends_result),
            FunctionTool(set_trends_verification),
        ],
    )


root_agent = build_eval_agent()
