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
3. Call write_trends_result with the SQL string and a concise markdown summary of the findings \
— highlight the top terms, notable patterns, and any surprises.

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
