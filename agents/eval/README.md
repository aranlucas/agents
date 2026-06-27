# Agent Eval Setup

This directory holds the shared eval configuration for all agents in this
monorepo. Eval datasets live alongside each agent's source code at
`agents/<name>/tests/eval/<name>.json`.

## Quick start

```bash
# Install the eval optional-dependencies (once)
uv sync --extra eval

# Install agents-cli (once)
uv tool install google-agents-cli

# Load GCP credentials and API keys
source .env.agents          # or set env vars manually — see Credentials below

# Run inference + grade for the travel agent
agents-cli eval generate --dataset agents/travel/tests/eval/travel.json
agents-cli eval grade --config agents/eval/eval_config.yaml

# One-shot shortcut (generate + grade)
agents-cli eval run --dataset agents/travel/tests/eval/travel.json \
    --config agents/eval/eval_config.yaml
```

## Directory layout

```
agents/eval/
  eval_config.yaml          shared grading config (metrics for all agents)
  README.md                 this file

agents/<name>/tests/eval/
  <name>.json               eval dataset for that agent
```

## Credentials

Two env-var sets are needed — keep them in `.env.agents` (gitignored):

| Variable                         | Purpose                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to `.google-credentials.json` (service account for eval inference on Vertex AI)                |
| `MISTRAL_API_KEY`                | Default judge-model key (Mistral via LiteLLM, no GCP needed for grading)                            |
| `EVAL_JUDGE_MODEL`               | Override the judge model (default: `mistral/mistral-small-latest`). Any LiteLLM model string works. |

Pull the service account credentials from the Railway project and save as
`.google-credentials.json` at the repo root (gitignored).

## Metrics

`eval_config.yaml` defines three `CodeExecutionMetric` judges that run
entirely locally (no GCP required for grading). Each calls LiteLLM with the
judge model configured via `EVAL_JUDGE_MODEL`.

| Metric                   | What it checks                                                                            | Score |
| ------------------------ | ----------------------------------------------------------------------------------------- | ----- |
| `task_success`           | Did the agent complete the user's requested task?                                         | 1–5   |
| `response_quality`       | Quality of the agent's final chat response                                                | 1–5   |
| `project_agent_contract` | Did the agent follow canvas-first and tool-use contracts? Reads per-case `rubric_groups`. | 1–5   |

`project_agent_contract` is the most important metric — it enforces the
monorepo-wide agent contract (write artifacts to state via tools, not chat)
and any case-specific rubrics defined in the dataset.

## Dataset format

Each eval case follows the `EvaluationDataset` schema:

```json
{
  "eval_cases": [
    {
      "eval_case_id": "unique_id",
      "metadata": {
        "agent_id": "travel",
        "backend_path": "travel"
      },
      "prompt": {
        "role": "user",
        "parts": [{ "text": "User message..." }]
      },
      "rubric_groups": {
        "agent_contract": {
          "rubrics": [
            {
              "rubric_id": "my_rubric",
              "content": {
                "property": {
                  "description": "Specific behavior the agent must demonstrate."
                }
              }
            }
          ]
        }
      }
    }
  ]
}
```

Per-case rubrics in `rubric_groups.agent_contract.rubrics` are automatically
read by the `project_agent_contract` metric and folded into the judge prompt.

## Eval agent pattern

Every agent must expose a `root_agent` that the eval SDK can load without
connecting to external services (Kroger, Strava, trvl MCP, etc.).

### Required changes per agent

**`agents/<name>/src/<name>_agent/agent.py`:**

```python
def build_eval_agent() -> LlmAgent:
    """Eval-compatible: no AGUIToolset, no McpToolset, no state_schema."""
    return LlmAgent(
        name="my_agent",
        model=build_model(),
        # Do NOT include state_schema — GEPA writes __llm_request_key__ to state
        # and strict schemas reject it.
        # Do NOT include before_agent_callback — it typically calls make_state_initializer
        # which depends on state_schema.
        # Do NOT include AGUIToolset() or any McpToolset — the Vertex AI eval SDK
        # cannot call inspect.signature() on ADK Toolset objects.
        static_instruction=_INSTRUCTION,
        instruction=_STATE_INSTRUCTION,
        tools=[
            # plain Python functions only
        ],
    )

root_agent = build_eval_agent()
```

**`agents/<name>/src/<name>_agent/__init__.py`:**

```python
"""<Name> agent package."""

from . import agent   # required for GEPA: module.agent.root_agent
```

### Why these constraints?

| Constraint                                        | Reason                                                                                                                                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `state_schema`                                 | GEPA writes `__llm_request_key__` to ADK state for prompt-optimization bookkeeping; strict Pydantic schemas reject unknown keys with `StateSchemaError`.                      |
| No `AGUIToolset` / `McpToolset`                   | `vertexai.Client().evals.AgentConfig.from_agent()` iterates tools and calls `inspect.signature()` on each. ADK `Toolset` objects are not callables — this raises `TypeError`. |
| `from . import agent` in `__init__.py`            | GEPA's `_get_agent_module` imports the package as module "agent" then accesses `module.agent.root_agent`. Without this import, `module.agent` doesn't exist.                  |
| `root_agent = build_eval_agent()` at module level | ADK `AgentLoader.load_agent()` looks for `root_agent` in the agent module at import time.                                                                                     |

### Agents with MCP tools

For agents that use MCP toolsets (travel → trvl, grocery → Kroger), create
`eval_stubs.py` with plain Python functions that return canned data. Import
them in `build_eval_agent()` instead of the MCP toolset.

For agents whose eval cases exercise auth-gate behavior (grocery, fitness,
wellness), no stubs are needed — the agent's auth check fires before any MCP
calls. The eval state starts with `kroger_connected=false` / `strava_connected=false`.

## Running eval for each agent

The `agents-cli-manifest.yaml` at the repo root points `agent_directory` to one
agent at a time. To eval a different agent, update it:

```yaml
name: agents
agent_directory: agents/grocery/src/grocery_agent # change per agent
region: us-central1
```

Then run:

```bash
agents-cli eval generate --dataset agents/grocery/tests/eval/grocery.json
agents-cli eval grade --config agents/eval/eval_config.yaml
```

Compare two grade runs:

```bash
agents-cli eval compare artifacts/grade_results/results_<ts1>.json \
                        artifacts/grade_results/results_<ts2>.json
```

## GEPA prompt optimization

GEPA (`agents-cli eval optimize`) rewrites the agent's static instruction to
improve a target metric. It requires the eval agent to have no `state_schema`
(see constraint table above).

```bash
# Optimize travel agent instruction against the project_agent_contract metric
agents-cli eval optimize \
  --dataset agents/travel/tests/eval/travel.json \
  --target-metric project_agent_contract \
  --config agents/eval/eval_config.yaml
```

GEPA is expensive (many LLM calls, several minutes). Only run it after manual
instruction tuning has plateaued. Capture the optimized instruction from the
command output and paste it into the agent's `_INSTRUCTION` string.

## Validate eval assets

```bash
uv run pytest agents/shared/tests/test_eval_assets.py -q
```

This checks that every registered agent has a colocated eval dataset and that
all datasets parse against the expected schema.
