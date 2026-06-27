# Agent Eval Scaffold

This directory contains Agent Platform eval assets for the mounted/web-visible
agents in this monorepo.

- `eval_config.yaml` selects shared managed metrics plus one project-specific
  rubric metric.
- Each agent's dataset lives alongside its implementation at
  `agents/<name>/tests/eval/<name>.json`.
- `agents/shared/tests/test_eval_assets.py` keeps the datasets in sync with the
  agent registry and checks the generate-ready schema used here.

Run a focused local asset check:

```bash
uv run pytest agents/shared/tests/test_eval_assets.py -q
```

Run Agent Platform evals after installing `agents-cli` and configuring the
target agent runtime:

```bash
agents-cli eval generate --dataset agents/travel/tests/eval/travel.json
agents-cli eval grade --config tests/eval/eval_config.yaml
```

Some datasets intentionally exercise disconnected/default-state behavior for
auth-gated agents. Full live evals for travel, grocery, fitness, wellness, and
A2UI may require the same external services or injected AG-UI tools that the app
uses at runtime.
