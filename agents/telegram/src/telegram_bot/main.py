"""Entrypoint for running the ADK agents Telegram bot."""

from __future__ import annotations

import logging
import os

from dotenv import load_dotenv

from .runner import TelegramAgentsBot, env_flag, parse_allowed_chat_ids


def run() -> None:
    load_dotenv()
    load_dotenv(".env.local", override=True)

    logging.basicConfig(
        level=logging.DEBUG if env_flag("TELEGRAM_DEBUG") else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    token = os.getenv("TELEGRAM_BOT_TOKEN") or os.getenv("TELEGRAM_TOKEN")
    if not token:
        raise RuntimeError("Set TELEGRAM_BOT_TOKEN with the BotFather token.")

    _default_web_base = "https://agents-lucas.vercel.app"
    allowed_chat_ids = parse_allowed_chat_ids(os.getenv("TELEGRAM_ALLOWED_CHAT_IDS"))
    link_base_url = (
        os.getenv("TELEGRAM_LINK_BASE_URL") or f"{_default_web_base}/telegram/link"
    )
    connect_url = (
        os.getenv("TELEGRAM_CONNECT_URL") or f"{_default_web_base}/console/settings"
    )
    mini_app_url = os.getenv("TELEGRAM_MINI_APP_URL")
    poll_timeout = int(os.getenv("TELEGRAM_POLL_TIMEOUT", "50"))

    bot = TelegramAgentsBot(
        allowed_chat_ids=allowed_chat_ids,
        link_base_url=link_base_url,
        connect_url=connect_url,
        mini_app_url=mini_app_url,
        poll_timeout=poll_timeout,
        debug=env_flag("TELEGRAM_DEBUG"),
    )
    bot.run_polling(token)


if __name__ == "__main__":
    run()
