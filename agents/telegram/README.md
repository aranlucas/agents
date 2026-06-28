# Telegram Bot Adapter

This package exposes the surfaced ADK agents through one Telegram bot.

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
- `TELEGRAM_POLL_TIMEOUT` defaults to `50`
- `TELEGRAM_DEBUG=true` enables verbose adapter logging

## Telegram commands

- `/agents` lists the orchestrator plus every directly selectable surfaced agent
- `/agent <id>` switches the active agent for the current Telegram chat
- `/current` shows the active agent
- `/login` links Telegram to the signed-in web account
- `/logout` unlinks Telegram from the web account
- `/reset` clears the selected agent session for the current chat
- `/chat_id` prints the Telegram chat ID for allowlisting

The bot always starts each chat on the default `orchestrator` agent, which delegates to the specialist agents through
ADK `sub_agents`. The adapter uses the same ADK agent constructors as the
gateway. State-first agents still write their artifacts to ADK state; when they
do not emit final chat text, the bot sends a compact state summary back to
Telegram.

Telegram use is account-gated. `/start`, `/help`, `/login`, `/logout`, and
`/chat_id` work before linking; normal messages require a linked Clerk account
with both Kroger/QFC and Strava connected. The bot never asks for credentials in
chat. It reads account tokens through Clerk after the Telegram account has been
linked.
