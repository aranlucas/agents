# ADK runtime choices

Reviewed October 8, 2026 against the [ADK Go reference](https://pkg.go.dev/google.golang.org/adk/v2), published releases, and upstream source.

## Dependency revision

ADK Go has no published beta or prerelease tags. The latest tagged v2 release is [v2.5.0](https://github.com/google/adk-go/releases/tag/v2.5.0), published September 30. This service pins upstream commit [`49904c0d856e`](https://github.com/google/adk-go/commit/49904c0d856e), represented in Go modules as `v2.5.1-0.20261008104020-49904c0d856e`. This is an unreleased commit, not a beta release.

The pin includes [request-scoped MCP metadata](https://github.com/google/adk-go/pull/1429), [MCP connection cleanup](https://github.com/google/adk-go/pull/1713), and [cancellable waits for shared MCP sessions](https://github.com/google/adk-go/pull/1717). It also includes [toolset refresh before every model step](https://github.com/google/adk-go/pull/785). Replace the commit pin with the next tagged release containing these changes after validating it.

## Provider APIs

`internal/config` defines each provider's API alongside its base URL. Groq keeps Responses for its existing GPT OSS workloads. NVIDIA, Mistral, and OpenRouter use Chat Completions. Both primary and fallback models retain their own API selection. The adapter writes reasoning effort to the selected API's corresponding field and preserves the existing application rate limits, timeout policy, and circuit breaker.

[ADK's OpenAI model adapter](https://pkg.go.dev/google.golang.org/adk/v2/model/openaimodel) handles request and response conversion for both APIs. Tool arguments still require validation in application handlers; ADK sends function tools with strict validation disabled.

## Conversation compaction

Durable gateway conversations and the eval runner use [ADK sliding-window compaction](https://pkg.go.dev/google.golang.org/adk/v2/session/compaction) after every eight completed invocations. Earlier summaries remain intact instead of being repeatedly summarized. Stateless suggestions disable it. Summaries accumulate, so this reduces history size but does not impose a fixed context ceiling. State, instructions, schemas, and the current invocation also consume context.

The default ADK summarizer uses the root agent's model and asks it to preserve concrete durable facts. Summarization costs additional model calls and can lose information. Structured state remains canonical and is inserted into agent instructions on subsequent calls. Compaction adds summary events to the same SQLite session database; it does not delete the original history.

Grocery retains its 512 KiB history byte limit, but no longer truncates older turns in a callback. Oversized raw context fails explicitly rather than silently losing user constraints.

The SQLite integration test exercises both strategies, early-fact recall, state retention, and preservation of all original user events with a deterministic model fixture. This verifies the integration contract, not a live model's recall quality. Run `make recall` for a live check on eight synthetic reference facts across multiple summaries; `make recall RECALL_FLAGS='-recall-provider openrouter'` selects the Chat Completions path. Add `-recall-strategy rolling` to compare rolling tail retention. These commands use local provider credentials, incur provider usage, and write `artifacts/recall/results_sliding.json` or `results_rolling.json`, including the summaries for inspection. Each run lowers its trigger to exercise compaction quickly; passing one trial is not a general recall guarantee.

The sliding-window trial with `openrouter/free` retained **8/8** early facts after five summaries. The initial rolling trial retained **0/8** after nine summaries. Both trials encountered one transient summarizer network failure and continued with uncompacted history for that attempt. Groq could not complete the trial because of HTTP 429. Rolling tail retention is therefore restricted to the recall experiment. ADK's default summarizer clips each text part, including earlier summaries, at 2,000 characters; repeated clipping and model omissions can both lose details. The failed output does not establish which caused the loss. Critical constraints must live in canonical structured state rather than relying on summarization.

## MCP tracing and lifetime

Both MCP adapters attach ADK invocation identity and the active OpenTelemetry or Sentry `traceparent` to each tool call using their libraries' propagation functions. Metadata contains no credentials, user IDs, prompts, or session state.

Kroger connections are cached within one execution scope and closed when that run finishes, fails, or is canceled. They remain separate across runs and tokens. Travel's shared connection and discovery cache close at gateway shutdown or after evaluation; waiting on discovery honors the caller's deadline. Closed toolsets cannot reconnect or return cached tools.

Integration tests use a local MCP server to verify metadata changes across runs, request-token isolation, connection reuse, HTTP cleanup, and cancellation during shared discovery.
