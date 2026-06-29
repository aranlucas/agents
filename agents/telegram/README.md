# Telegram Bot Adapter

This package exposes the ADK orchestrator through one Telegram bot.

## Run locally

Set the BotFather token and run the module from the repo root:

```bash
export TELEGRAM_BOT_TOKEN="..."
uv run agents-telegram-bot
```

Optional environment variables:

- `TELEGRAM_LINK_BASE_URL` is required for `/login`, for example `https://your-web-app.com/telegram/link`
- `TELEGRAM_LINK_SECRET` must match the web/gateway secret used to consume link tokens
- `TELEGRAM_ALLOWED_CHAT_IDS` is a comma-separated allowlist of Telegram chat IDs
- `TELEGRAM_CONNECT_URL` optionally overrides the settings page URL sent when Strava or Kroger/QFC is missing
- `TELEGRAM_BOT_USERNAME` lets the bot ignore unmentioned group-chat messages, for example `agents_bot`
- `TELEGRAM_POLL_TIMEOUT` defaults to `50`
- `TELEGRAM_DEBUG=true` enables verbose adapter logging

## Telegram commands

- `/login` links Telegram to the signed-in web account
- `/logout` unlinks Telegram from the web account
- `/new` starts a new conversation with the orchestrator
- `/reset` alias for `/new`
- `/chat_id` prints the Telegram chat ID for allowlisting

The bot always routes every chat through the `orchestrator` agent, which
delegates to specialist agents through ADK `sub_agents`. Telegram does not
expose agent switching commands. State-first agents still write their artifacts
to ADK state; when they do not emit final chat text, the bot sends a compact
state summary back to Telegram.

## Group chats and topics

Group and supergroup messages are mention-gated. Set `TELEGRAM_BOT_USERNAME`
and users should mention the bot, for example `@agents_bot plan dinner`, to run
the orchestrator. Unmentioned group chatter is ignored.

Telegram forum topics get separate ADK sessions. The adapter only uses
`message_thread_id` when Telegram marks the message as a real topic message, so
ordinary group replies do not fragment conversation history. In a topic,
`/chat_id` prints both the group `chat_id` and the `topic_id`.

## Architecture

The runner follows the same shape as
[`google.adk.integrations.slack.SlackRunner`](https://github.com/google/adk-python/blob/main/src/google/adk/integrations/slack/slack_runner.py):

- `TelegramRunner` — thin wrapper that takes an ADK `Runner` and a
  `telegram.ext.Application`, sets up command and message handlers, and runs
  the core `receive → run agent → edit thinking message` loop
- `TelegramAuth`, `CredentialGate`, `SessionManager` — focused dependencies
  injected into the runner for account linking, integration gating, and ADK
  session lifecycle
- `build_telegram_runner(...)` — single entry point that composes the runner
  and all of its dependencies

The previous `TelegramAgentsBot` class is preserved as a thin facade that
mirrors the old public API on top of the new runner.

Telegram use is account-gated. `/start`, `/help`, `/login`, `/logout`, and
`/chat_id` work before linking; normal messages require a linked Clerk account
with both Kroger/QFC and Strava connected. The bot never asks for credentials in
chat. It reads account tokens through Clerk after the Telegram account has been
linked.
