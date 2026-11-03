# Runtime rationale

## Conversation compaction

Durable conversations use sliding-window compaction so earlier summaries are not repeatedly summarized. Rolling tail retention lost early facts in a prior recall experiment and remains restricted to that experiment. Summaries still accumulate: compaction is not a fixed context ceiling or a retention guarantee. Keep critical constraints in canonical structured state. Summary events share the SQLite session store with the original history; compaction does not delete that history.

To evaluate recall after changing models or compaction, run `make recall`. It uses provider credentials, incurs usage, and writes synthetic facts and summaries to `artifacts/recall/results_sliding.json`. Use `RECALL_FLAGS='-recall-provider openrouter'` for the Chat Completions path; add `-recall-strategy rolling` to compare tail retention (output: `results_rolling.json`). The experiment lowers compaction triggers to exercise multiple summaries quickly. A passing trial does not establish general recall quality.

## MCP ownership and privacy

Kroger connections belong to one execution scope and close when it finishes, fails, or is canceled. Keep runs and tokens isolated. Travel instead shares a connection and discovery cache until gateway shutdown or evaluation cleanup; discovery waits must honor caller cancellation. Closed toolsets must not reconnect or return cached tools.

Tool-call metadata carries invocation identity and the active OpenTelemetry or Sentry `traceparent`. Keep credentials, user IDs, prompts, and session state out of metadata and logs of connection-cache keys.
